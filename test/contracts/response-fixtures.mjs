/**
 * Offline regression check for the response mappers.
 *
 * Runs each mapper on its committed raw fixture and compares the output against
 * the committed mapped fixture. No network or credentials required — this guards
 * against accidental changes to mapper field selection.
 *
 * Usage:
 *   npm test
 *
 * If a mapper intentionally changed, regenerate its fixture with
 * `npm run fixtures:refresh -- <fixture-name>`.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as leagueMappers from "../../dist/yahoo/league.js";
import * as gameMappers from "../../dist/yahoo/game.js";
import * as matchupMappers from "../../dist/yahoo/matchup.js";
import * as commonMappers from "../../dist/yahoo/mappers.js";
import * as playerMappers from "../../dist/yahoo/player.js";
import * as rosterMappers from "../../dist/yahoo/roster.js";
import * as teamMappers from "../../dist/yahoo/team.js";
import * as transactionMappers from "../../dist/yahoo/transaction.js";
import * as analysisMappers from "../../dist/analysis/index.js";
import * as statsMappers from "../../dist/analysis/statsClient.js";

const mappers = {
  ...gameMappers,
  ...leagueMappers,
  ...matchupMappers,
  ...commonMappers,
  ...playerMappers,
  ...rosterMappers,
  ...teamMappers,
  ...transactionMappers,
};

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (sub, tool) =>
  JSON.parse(readFileSync(join(HERE, "..", "fixtures", sub, `${tool}.json`), "utf8"));

const CASES = [
  ["get_game", "mapGame"],
  ["game_stat_categories", "mapGameStatCategories"],
  ["list_games", "mapListGames"],
  ["list_leagues", "mapListLeagues"],
  ["get_league", "mapLeague"],
  ["get_league_metadata", "mapLeagueMetadata"],
  ["list_teams", "mapListTeams"],
  ["get_team", "mapTeam"],
  ["get_roster", "mapRosterCompact"],
  ["get_roster_stats", "mapRosterStats"],
  ["team_stats_week", "mapTeamStats"],
  ["team_stats_season", "mapTeamStats"],
  ["get_league_scoreboard", "mapMatchups"],
  ["get_team_matchup_history", "mapTeamMatchups"],
  ["get_player_stats", "mapPlayerStats"],
  ["list_players", "mapPlayerList"],
  ["rank_players", "mapRankPlayers"],
  ["rank_free_agent_batters", "mapRankPlayers"],
  ["rank_game_players", "mapGameRankPlayers", undefined, "game_stat_categories"],
  ["get_transactions", "mapTransactions"],
];

let failed = 0;
for (const [tool, mapper, rawTool = tool, categoryTool] of CASES) {
  const categoryStats = categoryTool
    ? read("raw", categoryTool).game.stat_categories.stats.stat
    : undefined;
  const categories = categoryStats?.map((stat) => ({
    stat_id: stat.stat_id,
    name: stat.name,
    display_name: stat.display_name,
    sort_order: stat.sort_order,
    position_type: stat.position_type,
  }));
  const actual = JSON.stringify(mappers[mapper](read("raw", rawTool), categories), null, 2);
  const expected = JSON.stringify(read("mapped", tool), null, 2);
  if (actual === expected) {
    console.log(`  ok   ${tool}`);
  } else {
    failed++;
    console.log(`  FAIL ${tool} (${mapper} output differs from fixtures/mapped/${tool}.json)`);
  }
}

const analysisCases = [
  ["analyze_player_stats", (raw) =>
    analysisMappers.mapAnalyzePlayerStats(raw.sources, raw.leagueScoringCategories)],
  ["analyze_roster_stats", (raw) =>
    analysisMappers.mapAnalyzeRosterStats(
      raw.season,
      raw.rosterDate,
      raw.leagueScoringCategories,
      raw.players,
    )],
  ["list_probable_starters", (raw) =>
    analysisMappers.mapProbableStarterBoard(
      raw.date,
      statsMappers.mapProbableStarters(raw.schedule),
    )],
];

for (const [tool, mapFixture] of analysisCases) {
  const actual = JSON.stringify(mapFixture(read("raw", tool)), null, 2);
  const expected = JSON.stringify(read("mapped", tool), null, 2);
  if (actual === expected) {
    console.log(`  ok   ${tool}`);
  } else {
    failed++;
    console.log(`  FAIL ${tool} output differs from fixtures/mapped/${tool}.json`);
  }
}

const rosterAnalysis = analysisMappers.mapAnalyzeRosterStats(
  2026,
  "2026-07-13",
  [],
  [{
    player: { name: "Example Pitcher" },
    standard: { games: 10, wins: 4 },
    recent14d: { games: 2, wins: 1 },
    expectedStats: { xwOBAAgainst: "0.300" },
  }],
);
const rosterAnalysisPlayer = rosterAnalysis.players[0];
if (
  JSON.stringify(rosterAnalysisPlayer?.["mlbStats.columns"]) === JSON.stringify(["games", "wins"]) &&
  JSON.stringify(rosterAnalysisPlayer?.["mlbStats.standard"]) === JSON.stringify([10, 4]) &&
  JSON.stringify(rosterAnalysisPlayer?.["mlbStats.recent14d"]) === JSON.stringify([2, 1]) &&
  !("mlbStats.recent30d" in rosterAnalysisPlayer) &&
  !("standard" in rosterAnalysisPlayer) &&
  rosterAnalysisPlayer.expectedStats?.xwOBAAgainst === "0.300"
) {
  console.log("  ok   analyze_roster_stats flattens only MLB stat windows");
} else {
  failed++;
  console.log("  FAIL analyze_roster_stats flattens only MLB stat windows");
}

const probableStarters = statsMappers.mapProbableStarters(
  read("raw", "list_probable_starters").schedule,
);
const enrichedStarterBoard = analysisMappers.mapProbableStarterBoard(
  read("raw", "list_probable_starters").date,
  [
    { ...probableStarters[0], fantasyStatus: "freeAgent" },
    { ...probableStarters[1], fantasyStatus: "otherTeam", ownerTeamName: "Team 2" },
  ],
  { leagueKey: "123.l.12345" },
);
if (
  enrichedStarterBoard.leagueKey === "123.l.12345" &&
  JSON.stringify(enrichedStarterBoard.starters.columns.slice(-2)) ===
    JSON.stringify(["fantasyStatus", "ownerTeamName"]) &&
  JSON.stringify(enrichedStarterBoard.starters.rows.map((row) => row.slice(-2))) ===
    JSON.stringify([["freeAgent", null], ["otherTeam", "Team 2"]])
) {
  console.log("  ok   probable-starter ownership uses the compact row table");
} else {
  failed++;
  console.log("  FAIL probable-starter ownership uses the compact row table");
}

const emptyStarterBoard = analysisMappers.mapProbableStarterBoard("2025-06-30", []);
if (
  emptyStarterBoard.count === 0 &&
  emptyStarterBoard.starters.columns.length === 8 &&
  emptyStarterBoard.starters.rows.length === 0 &&
  typeof emptyStarterBoard.note === "string"
) {
  console.log("  ok   empty probable-starter boards preserve the compact table schema");
} else {
  failed++;
  console.log("  FAIL empty probable-starter boards preserve the compact table schema");
}

if (
  !probableStarters.some((starter) => "team" in starter || "opponent" in starter) &&
  !enrichedStarterBoard.starters.columns.includes("team") &&
  !enrichedStarterBoard.starters.columns.includes("opponent")
) {
  console.log("  ok   probable-starter boards keep only team abbreviations");
} else {
  failed++;
  console.log("  FAIL probable-starter boards keep only team abbreviations");
}

const requestedWeek = 16;
const filteredMatchups = mappers.mapTeamMatchups(
  read("raw", "get_team_matchup_history"),
  [requestedWeek],
).matchups;
if (filteredMatchups.length === 1 && filteredMatchups[0]?.week === requestedWeek) {
  console.log(`  ok   get_team_matchup_history filters requested weeks`);
} else {
  failed++;
  console.log("  FAIL get_team_matchup_history filters requested weeks");
}

const matchupResource = mappers.teamMatchupHistoryResource("123.l.12345.t.1", [16]);
if (matchupResource === "/team/123.l.12345.t.1/matchups;weeks=16") {
  console.log("  ok   get_team_matchup_history uses the matchup weeks endpoint");
} else {
  failed++;
  console.log("  FAIL get_team_matchup_history uses the matchup weeks endpoint");
}

const compactStats = mappers.mapStatsTable({
  coverage_type: "date",
  stats: { stat: [{ stat_id: 60, value: "" }, { stat_id: 7, value: 426 }] },
});
if (
  JSON.stringify(compactStats) ===
  JSON.stringify({
    coverage_type: "date",
    stats: { columns: ["stat_id", "value"], rows: [[60, ""], [7, 426]] },
  })
) {
  console.log("  ok   stats use compact self-describing row tables");
} else {
  failed++;
  console.log("  FAIL stats use compact self-describing row tables");
}

const liftedStats = mappers.liftStatsTable("player_stats", {
  coverage_type: "season",
  season: 2026,
  stats: { stat: [{ stat_id: 50, value: "12.1" }] },
});
if (
  JSON.stringify(liftedStats) ===
  JSON.stringify({
    player_stats: { coverage_type: "season", season: 2026 },
    "player_stats.stats.columns": ["stat_id", "value"],
    "player_stats.stats.rows": [[50, "12.1"]],
  })
) {
  console.log("  ok   player stat tables lift into sibling player fields");
} else {
  failed++;
  console.log("  FAIL player stat tables lift into sibling player fields");
}

const compactPlayers = mappers.mapRecordsTable([
  { player_key: "123.p.1", name: "Player One", status: undefined },
  { player_key: "123.p.2", name: "Player Two", status: "DTD" },
]);
if (
  JSON.stringify(compactPlayers) ===
  JSON.stringify({
    columns: ["player_key", "name", "status"],
    rows: [["123.p.1", "Player One", null], ["123.p.2", "Player Two", "DTD"]],
  })
) {
  console.log("  ok   players use compact self-describing row tables");
} else {
  failed++;
  console.log("  FAIL players use compact self-describing row tables");
}

const fetchedGameCategories = await mappers.fetchGameStatCategories(
  { get: async () => read("raw", "game_stat_categories") },
  "123",
);
if (Array.isArray(fetchedGameCategories) && fetchedGameCategories[0]?.display_name === "GP") {
  console.log("  ok   game stat-category lookup remains row-based internally");
} else {
  failed++;
  console.log("  FAIL game stat-category lookup remains row-based internally");
}

const registeredTools = new Map();
const defaultRequests = [];
mappers.registerMatchupTools(
  {
    registerTool(name, _definition, handler) {
      registeredTools.set(name, handler);
    },
  },
  {
    resolveTeamKey: () => "123.l.12345.t.1",
    yahoo: {
      async get(path) {
        defaultRequests.push(path);
        return path === "/league/123.l.12345"
          ? { league: { current_week: 16 } }
          : read("raw", "get_team_matchup_history");
      },
    },
  },
);
await registeredTools.get("get_team_matchup_history")({});
if (
  JSON.stringify(defaultRequests) ===
  JSON.stringify(["/league/123.l.12345", "/team/123.l.12345.t.1/matchups;weeks=16"])
) {
  console.log("  ok   get_team_matchup_history resolves the current week by default");
} else {
  failed++;
  console.log("  FAIL get_team_matchup_history resolves the current week by default");
}

if (failed) {
  console.error(`\n${failed} fixture mapping(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length + analysisCases.length} fixture mappings match.`);
