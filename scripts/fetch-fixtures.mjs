/**
 * Regenerates the API and analysis fixtures under test/fixtures/.
 *
 * For each read endpoint it:
 *   1. fetches the live upstream response(s), refreshing Yahoo OAuth when needed,
 *   2. sanitizes account-specific identifiers and personal data (game/league,
 *      team/manager names, image URLs, chat ids, guids) so the fixtures are
 *      safe to commit to a public repo,
 *   3. trims long lists down to a few representative items for readability,
 *   4. writes the cleaned raw response to test/fixtures/raw/<tool>.json, and
 *   5. runs the real mapper on that cleaned raw response and writes the result
 *      to test/fixtures/mapped/<tool>.json.
 *
 * Usage:
 *   npm run fixtures:refresh -- get_roster  # refresh exactly one fixture
 *
 * Yahoo fixtures require a configured ~/.fantasy-baseball-mcp/config.json (run the auth flow once).
 * Analysis fixtures use public MLB, Baseball Savant, and FanGraphs data and need no Yahoo auth.
 * Real player names are kept — they are public MLB data, not personal data.
 */
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import stringify from "json-stringify-pretty-compact";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import * as leagueMappers from "../dist/yahoo/league.js";
import * as gameMappers from "../dist/yahoo/game.js";
import * as matchupMappers from "../dist/yahoo/matchup.js";
import * as playerMappers from "../dist/yahoo/player.js";
import * as rosterMappers from "../dist/yahoo/roster.js";
import * as teamMappers from "../dist/yahoo/team.js";
import * as transactionMappers from "../dist/yahoo/transaction.js";
import * as analysisMappers from "../dist/analysis/index.js";
import * as statsMappers from "../dist/analysis/statsClient.js";
import { REDIRECT_URI } from "../dist/yahoo/callbackServer.js";

const mappers = {
  ...gameMappers,
  ...leagueMappers,
  ...matchupMappers,
  ...playerMappers,
  ...rosterMappers,
  ...teamMappers,
  ...transactionMappers,
};

const requestedFixture = process.argv[2];
if (!requestedFixture || process.argv.length !== 3) {
  console.error("Usage: npm run fixtures:refresh -- <fixture-name>");
  process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, "..", "test", "fixtures");
const RAW_DIR = join(FIXTURES_DIR, "raw");
const MAPPED_DIR = join(FIXTURES_DIR, "mapped");
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(MAPPED_DIR, { recursive: true });

// --- public analysis sources ----------------------------------------------
const ANALYSIS_FIXTURES = [
  "analyze_player_stats",
  "analyze_roster_stats",
  "list_probable_starters",
];

const MLB_STAT_KEYS = [
  "gamesPlayed", "plateAppearances", "atBats", "hits", "doubles", "triples",
  "homeRuns", "rbi", "runs", "stolenBases", "caughtStealing", "baseOnBalls",
  "strikeOuts", "avg", "obp", "slg", "ops", "babip", "totalBases",
  "gamesStarted", "inningsPitched", "wins", "losses", "saves", "holds",
  "saveOpportunities", "blownSaves", "era", "whip", "strikeoutsPer9Inn",
  "walksPer9Inn", "qualityStarts",
];
const EXPECTED_STAT_KEYS = [
  "est_ba", "est_slg", "est_woba", "est_ba_minus_ba_diff",
  "est_slg_minus_slg_diff", "est_woba_minus_woba_diff",
];
const STATCAST_KEYS = [
  "avg_hit_speed", "max_hit_speed", "ev50", "ev95percent", "brl_percent", "brl_pa",
  "avg_hit_angle", "anglesweetspotpercent", "max_distance", "avg_distance",
];
const FANGRAPHS_KEYS = [
  "playerid", "WAR", "wRC+", "wOBA", "ISO", "BABIP", "K%", "BB%", "SwStr%",
  "EV", "Barrel%", "HardHit%", "GB%", "FB%", "HR/FB", "LD%", "ERA", "FIP",
  "xFIP", "WHIP", "LOB%",
];

function pick(record, keys) {
  if (!record) return null;
  return Object.fromEntries(keys.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]));
}

function compactPlayerSources(sources) {
  return {
    ...sources,
    mlb: pick(sources.mlb, MLB_STAT_KEYS),
    expected: pick(sources.expected, EXPECTED_STAT_KEYS),
    statcast: pick(sources.statcast, STATCAST_KEYS),
    fangraphs: pick(sources.fangraphs, FANGRAPHS_KEYS),
    recent14d: pick(sources.recent14d, MLB_STAT_KEYS),
    recent30d: pick(sources.recent30d, MLB_STAT_KEYS),
  };
}

async function retryPublicFetch(fetch, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function captureAnalysisFixture(tool) {
  const season = new Date().getFullYear();
  if (tool === "analyze_player_stats") {
    const sources = compactPlayerSources(await retryPublicFetch(() =>
      analysisMappers.fetchPlayerAnalysisSources("Shohei Ohtani", season)));
    const raw = { sources, leagueScoringCategories: [] };
    return { raw, mapped: analysisMappers.mapAnalyzePlayerStats(sources) };
  }

  if (tool === "analyze_roster_stats") {
    const sources = compactPlayerSources(await retryPublicFetch(() =>
      analysisMappers.fetchPlayerAnalysisSources("Tarik Skubal", season)));
    const categories = [
      { statId: "7", displayName: "R", positionType: "B" },
      { statId: "12", displayName: "HR", positionType: "B" },
      { statId: "28", displayName: "W", positionType: "P" },
      { statId: "42", displayName: "K", positionType: "P" },
    ];
    const raw = {
      season,
      rosterDate: new Date().toISOString().slice(0, 10),
      leagueScoringCategories: categories,
      players: [analysisMappers.mapPlayerAnalysis(sources)],
    };
    return {
      raw,
      mapped: analysisMappers.mapAnalyzeRosterStats(
        raw.season,
        raw.rosterDate,
        raw.leagueScoringCategories,
        raw.players,
      ),
    };
  }

  const date = "2025-06-20";
  const response = await retryPublicFetch(() =>
    axios.get("https://statsapi.mlb.com/api/v1/schedule", {
      params: { sportId: 1, date, hydrate: "probablePitcher,team" },
    }));
  const games = response.data?.dates?.[0]?.games ?? [];
  const schedule = {
    ...response.data,
    dates: response.data?.dates?.length > 0
      ? [{ ...response.data.dates[0], games: games.slice(0, 2) }]
      : [],
  };
  const raw = { date, schedule };
  const starters = statsMappers.mapProbableStarters(schedule);
  return { raw, mapped: analysisMappers.mapProbableStarterBoard(date, starters) };
}

if (ANALYSIS_FIXTURES.includes(requestedFixture)) {
  process.stdout.write(`${requestedFixture}... `);
  try {
    const { raw, mapped } = await captureAnalysisFixture(requestedFixture);
    writeFileSync(join(RAW_DIR, `${requestedFixture}.json`), stringify(raw));
    writeFileSync(join(MAPPED_DIR, `${requestedFixture}.json`), stringify(mapped));
    const rawKB = Math.round(JSON.stringify(raw).length / 1024);
    const mapKB = Math.round(JSON.stringify(mapped).length / 1024);
    console.log(`raw ${rawKB}KB -> mapped ${mapKB}KB`);
    console.log("Done.");
    process.exit(0);
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
}

// --- auth -----------------------------------------------------------------
const configPath = `${homedir()}/.fantasy-baseball-mcp/config.json`;
const legacyConfigPath = `${homedir()}/.yahoo-fantasy-mcp/config.json`;
const readConfigPath = existsSync(configPath) ? configPath : legacyConfigPath;
const config = JSON.parse(readFileSync(readConfigPath, "utf8"));
const { clientId, clientSecret, refreshToken } = config;

const tokenRes = await axios.post(
  "https://api.login.yahoo.com/oauth2/get_token",
  new URLSearchParams({
    grant_type: "refresh_token",
    redirect_uri: REDIRECT_URI,
    refresh_token: refreshToken,
  }).toString(),
  {
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  },
);
const accessToken = tokenRes.data.access_token;
if (tokenRes.data.refresh_token) {
  config.refreshToken = tokenRes.data.refresh_token;
  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });
const BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

async function fetchResource(resource) {
  const res = await axios.get(`${BASE}${resource}`, {
    responseType: "text",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const parsed = parser.parse(res.data);
  return parsed?.fantasy_content ?? parsed;
}

// --- sanitization ---------------------------------------------------------
const realLeagueKey = config.defaultLeagueKey; // e.g. "469.l.78350"
const FAKE_GAME_KEY = "123";
const FAKE_LEAGUE_ID = "12345";

const SCRUB_KEYS = new Set([
  "url",
  "recordbook_url",
  "logo_url",
  "image_url",
  "editorial_team_url",
  "editorial_player_url",
  "guid",
  "iris_group_chat_id",
  "sendbird_channel_url",
]);

/** team_id from a team_key like "469.l.78350.t.7" -> "7" */
function teamIdFromKey(key) {
  const m = /\.t\.(\d+)$/.exec(String(key ?? ""));
  return m ? m[1] : null;
}

/**
 * Recursively rewrite personal data in place:
 *  - team names    -> "Team <id>"   (derived from the sibling *team_key)
 *  - manager names -> "Manager <id>"
 *  - league name   -> "Demo League"
 *  - image/url/guid/chat-id fields -> harmless placeholders
 */
function sanitize(node) {
  if (Array.isArray(node)) {
    node.forEach(sanitize);
    return;
  }
  if (!node || typeof node !== "object") return;

  // Team entry: name derived from its own team_key.
  if (node.team_key && node.name !== undefined) {
    const id = teamIdFromKey(node.team_key);
    if (id) node.name = `Team ${id}`;
  }
  // Manager entry.
  if (node.manager_id !== undefined && node.nickname !== undefined) {
    node.nickname = `Manager ${node.manager_id}`;
  }
  // League entry (has settings/standings/teams or a league_key + name).
  if (node.league_key && node.name !== undefined && !node.team_key) {
    node.name = "Demo League";
  }
  // Ownership + transaction team-name fields, derived from the paired key.
  for (const [keyField, nameField] of [
    ["owner_team_key", "owner_team_name"],
    ["destination_team_key", "destination_team_name"],
    ["source_team_key", "source_team_name"],
  ]) {
    if (node[keyField] && node[nameField] !== undefined) {
      const id = teamIdFromKey(node[keyField]);
      if (id) node[nameField] = `Team ${id}`;
    }
  }

  for (const [k, v] of Object.entries(node)) {
    if (SCRUB_KEYS.has(k) && typeof v === "string") {
      node[k] = v ? `https://example.com/${k}` : v;
    } else {
      sanitize(v);
    }
  }
}

/** Replace all Yahoo game and league identifiers, including historical leagues. */
function scrubAccountIds(data) {
  const json = JSON.stringify(data)
    .replace(
      /("(?:game_key|game_id)":)("?)\d+\2(?=[,}])/g,
      `$1$2${FAKE_GAME_KEY}$2`,
    )
    .replace(/\b\d+\.l\.\d+/g, `${FAKE_GAME_KEY}.l.${FAKE_LEAGUE_ID}`)
    .replace(/\b\d+\.p\./g, `${FAKE_GAME_KEY}.p.`)
    .replace(/("league_id":)("?)\d+\2(?=[,}])/g, `$1$2${FAKE_LEAGUE_ID}$2`)
    .replace(/("(?:renew|renewed)":")\d+_\d+"/g, `$1${FAKE_GAME_KEY}_${FAKE_LEAGUE_ID}"`);
  return JSON.parse(json);
}

// --- trimming -------------------------------------------------------------
// Cap repeated list containers so fixtures stay small and readable. Stat lists
// are intentionally left intact so the shape stays realistic.
const CAPS = { game: 2, game_week: 2, team: 3, player: 3, matchup: 2, transaction: 3 };

function trim(node) {
  if (Array.isArray(node)) {
    node.forEach(trim);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) {
    if (k in CAPS && Array.isArray(v) && v.length > CAPS[k]) {
      node[k] = v.slice(0, CAPS[k]);
    }
    trim(node[k]);
  }
}

function clean(data) {
  const copy = scrubAccountIds(data);
  sanitize(copy);
  trim(copy);
  return copy;
}

// --- endpoints ------------------------------------------------------------
const lk = realLeagueKey;
const tk = config.defaultTeamKey;

const endpoints = [
  { tool: "get_game", mapper: "mapGame", path: "/game/" + realLeagueKey.split(".l.")[0] },
  { tool: "game_stat_categories", mapper: "mapGameStatCategories", path: "/game/" + realLeagueKey.split(".l.")[0] + "/stat_categories" },
  { tool: "list_games", mapper: "mapListGames", path: "/users;use_login=1/games;out=leagues,teams" },
  { tool: "list_leagues", mapper: "mapListLeagues", path: "/users;use_login=1/games;out=leagues" },
  { tool: "get_league", mapper: "mapLeague", path: `/league/${lk};out=teams,settings,standings` },
  { tool: "get_league_metadata", mapper: "mapLeagueMetadata", path: `/league/${lk}` },
  { tool: "list_teams", mapper: "mapListTeams", path: `/league/${lk}/teams` },
  { tool: "get_team", mapper: "mapTeam", path: `/team/${tk};out=stats,standings` },
  { tool: "get_roster", mapper: "mapRosterCompact", path: `/team/${tk}/roster;date=2026-06-20/players` },
  { tool: "get_roster_stats", mapper: "mapRosterStats", path: `/team/${tk}/roster;date=2026-06-20/players;out=stats` },
  { tool: "team_stats_week", mapper: "mapTeamStats", path: `/team/${tk}/stats;type=week;week=12` },
  { tool: "team_stats_season", mapper: "mapTeamStats", path: `/team/${tk}/stats;type=season` },
  { tool: "get_league_scoreboard", mapper: "mapMatchups", path: `/league/${lk}/scoreboard` },
  { tool: "get_team_matchup_history", mapper: "mapTeamMatchups", path: `/team/${tk}/matchups;weeks=16` },
  { tool: "get_player_stats", mapper: "mapPlayerStats" },
  { tool: "list_players", mapper: "mapPlayerList", path: `/league/${lk}/players;sort=AR;sort_type=season;start=0;count=3;out=ownership` },
  { tool: "rank_players", mapper: "mapRankPlayers", path: `/league/${lk}/players;sort=AR;sort_type=season;start=0;count=3;out=ownership,stats` },
  { tool: "rank_free_agent_batters", mapper: "mapRankPlayers", path: `/league/${lk}/players;status=FA;position=B;sort=AR;sort_type=lastweek;start=0;count=3;out=ownership/stats;type=lastweek` },
  { tool: "rank_game_players", mapper: "mapGameRankPlayers", path: `/game/${lk.split(".")[0]}/players;sort=AR;sort_type=season;start=0;count=3;out=stats` },
  { tool: "get_transactions", mapper: "mapTransactions", path: `/league/${lk}/transactions` },
];

const selectedEndpoint = endpoints.find(({ tool }) => tool === requestedFixture);
if (!selectedEndpoint) {
  console.error(
    `Unknown fixture \"${requestedFixture}\". Choose one of: ${[...endpoints.map(({ tool }) => tool), ...ANALYSIS_FIXTURES].join(", ")}`,
  );
  process.exit(1);
}

let playerKeys = "";
if (selectedEndpoint.tool === "get_player_stats") {
  // Only player stats needs this supporting roster request to obtain valid keys.
  const rosterRaw = await fetchResource(`/team/${tk}/roster;date=2026-06-20/players;out=stats`);
  const rosterPlayers = (() => {
    const p = rosterRaw?.team?.roster?.players?.player;
    return Array.isArray(p) ? p : p ? [p] : [];
  })();
  playerKeys = rosterPlayers.slice(0, 2).map((p) => p.player_key).join(",");
}

const { tool, mapper, path: configuredPath } = selectedEndpoint;
process.stdout.write(`${tool}... `);
try {
  const path =
    configuredPath ?? `/players;player_keys=${playerKeys}/stats;type=date;date=2026-06-20`;
  const raw = clean(await fetchResource(path));
  writeFileSync(join(RAW_DIR, `${tool}.json`), stringify(raw));

  let gameStatCategories;
  if (tool === "rank_game_players") {
    const categoryData = clean(await fetchResource(`/game/${lk.split(".")[0]}/stat_categories`));
    const categoryStats = categoryData?.game?.stat_categories?.stats?.stat;
    const stats = Array.isArray(categoryStats) ? categoryStats : categoryStats ? [categoryStats] : [];
    gameStatCategories = stats.map((stat) => ({
      stat_id: stat.stat_id,
      name: stat.name,
      display_name: stat.display_name,
      sort_order: stat.sort_order,
      position_type: stat.position_type,
    }));
  }
  const mapped = mappers[mapper](raw, gameStatCategories);
  writeFileSync(join(MAPPED_DIR, `${tool}.json`), stringify(mapped));

  const rawKB = Math.round(JSON.stringify(raw).length / 1024);
  const mapKB = Math.round(JSON.stringify(mapped).length / 1024);
  console.log(`raw ${rawKB}KB -> mapped ${mapKB}KB`);
} catch (e) {
  console.log(`ERROR: ${e.message}`);
}
console.log("Done.");
