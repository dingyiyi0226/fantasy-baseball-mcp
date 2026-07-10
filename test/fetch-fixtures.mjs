/**
 * Regenerates the API fixtures under test/fixtures/.
 *
 * For each read endpoint it:
 *   1. fetches the live Yahoo response (refreshing the OAuth token as needed),
 *   2. sanitizes all personal data (league/team/manager names + ids, image URLs,
 *      chat ids, guids) so the fixtures are safe to commit to a public repo,
 *   3. trims long lists down to a few representative items for readability,
 *   4. writes the cleaned raw response to test/fixtures/raw/<tool>.json, and
 *   5. runs the real mapper on that cleaned raw response and writes the result
 *      to test/fixtures/mapped/<tool>.json.
 *
 * Usage:
 *   npm run build            # mappers must be compiled to dist/ first
 *   node test/fetch-fixtures.mjs get_roster      # refresh exactly one fixture
 *
 * Requires a configured ~/.yahoo-fantasy-mcp/config.json (run the auth flow once).
 * Real player names are kept — they are public MLB data, not personal data.
 */
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import * as leagueMappers from "../dist/yahoo/league.js";
import * as matchupMappers from "../dist/yahoo/matchup.js";
import * as playerMappers from "../dist/yahoo/player.js";
import * as rosterMappers from "../dist/yahoo/roster.js";
import * as teamMappers from "../dist/yahoo/team.js";
import * as transactionMappers from "../dist/yahoo/transaction.js";

const mappers = {
  ...leagueMappers,
  ...matchupMappers,
  ...playerMappers,
  ...rosterMappers,
  ...teamMappers,
  ...transactionMappers,
};

const requestedFixture = process.argv[2];
if (!requestedFixture || process.argv.length !== 3) {
  console.error("Usage: node test/fetch-fixtures.mjs <fixture-name>");
  process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(HERE, "fixtures", "raw");
const MAPPED_DIR = join(HERE, "fixtures", "mapped");
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(MAPPED_DIR, { recursive: true });

// --- auth -----------------------------------------------------------------
const configPath = `${homedir()}/.yahoo-fantasy-mcp/config.json`;
const config = JSON.parse(readFileSync(configPath, "utf8"));
const { clientId, clientSecret, refreshToken } = config;

const tokenRes = await axios.post(
  "https://api.login.yahoo.com/oauth2/get_token",
  new URLSearchParams({
    grant_type: "refresh_token",
    redirect_uri: "oob",
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
// The real league id is read from config so the script works for any account.
const realLeagueKey = config.defaultLeagueKey; // e.g. "469.l.78350"
const realLeagueId = realLeagueKey.split(".l.")[1]; // e.g. "78350"
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

/** Replace the real league id everywhere it is embedded in keys/strings. */
function scrubLeagueId(data) {
  const json = JSON.stringify(data).split(realLeagueId).join(FAKE_LEAGUE_ID);
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
  const copy = scrubLeagueId(data);
  sanitize(copy);
  trim(copy);
  return copy;
}

// --- endpoints ------------------------------------------------------------
const lk = realLeagueKey;
const tk = config.defaultTeamKey;

const endpoints = [
  { tool: "list_leagues", mapper: "mapListLeagues", path: "/users;use_login=1/games;out=leagues" },
  { tool: "get_league", mapper: "mapLeague", path: `/league/${lk};out=teams,settings,standings` },
  { tool: "list_teams", mapper: "mapListTeams", path: `/league/${lk}/teams` },
  { tool: "get_team", mapper: "mapTeam", path: `/team/${tk};out=stats,standings` },
  { tool: "get_standings", mapper: "mapStandings", path: `/teams;team_keys=${lk}.t.1,${lk}.t.2,${lk}.t.3;out=stats,standings` },
  { tool: "get_roster", mapper: "mapRosterCompact", path: `/team/${tk}/roster;date=2026-06-20/players` },
  { tool: "get_roster_full", mapper: "mapRosterFull", path: `/team/${tk}/roster;date=2026-06-20/players` },
  { tool: "get_roster_stats", mapper: "mapRosterCompactWithStats", path: `/team/${tk}/roster;date=2026-06-20/players;out=stats` },
  { tool: "team_stats_week", mapper: "mapTeamStats", path: `/team/${tk}/stats;type=week;week=12` },
  { tool: "team_stats_season", mapper: "mapTeamStats", path: `/team/${tk}/stats;type=season` },
  { tool: "get_league_scoreboard", mapper: "mapMatchups", path: `/league/${lk}/scoreboard` },
  { tool: "get_team_matchup_history", mapper: "mapTeamMatchups", path: `/team/${tk};out=stats,matchups;weeks=1,2,3` },
  { tool: "get_player_stats", mapper: "mapPlayerStats" },
  { tool: "list_players", mapper: "mapPlayerList", path: `/league/${lk}/players;sort=AR;sort_type=season;start=0;count=3;out=ownership` },
  { tool: "rank_players", mapper: "mapRankPlayers", path: `/league/${lk}/players;sort=AR;sort_type=season;start=0;count=3;out=ownership,stats` },
  { tool: "get_transactions", mapper: "mapTransactions", path: `/league/${lk}/transactions` },
];

const selectedEndpoint = endpoints.find(({ tool }) => tool === requestedFixture);
if (!selectedEndpoint) {
  console.error(
    `Unknown fixture \"${requestedFixture}\". Choose one of: ${endpoints.map(({ tool }) => tool).join(", ")}`,
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
  writeFileSync(join(RAW_DIR, `${tool}.json`), JSON.stringify(raw, null, 2));

  const mapped = mappers[mapper](raw);
  writeFileSync(join(MAPPED_DIR, `${tool}.json`), JSON.stringify(mapped, null, 2));

  const rawKB = Math.round(JSON.stringify(raw).length / 1024);
  const mapKB = Math.round(JSON.stringify(mapped).length / 1024);
  console.log(`raw ${rawKB}KB -> mapped ${mapKB}KB`);
} catch (e) {
  console.log(`ERROR: ${e.message}`);
}
console.log("Done.");
