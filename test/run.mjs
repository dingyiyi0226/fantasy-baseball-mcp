/**
 * Offline regression check for the response mappers.
 *
 * Runs each mapper on its committed raw fixture and compares the output against
 * the committed mapped fixture. No network or credentials required — this guards
 * against accidental changes to mapper field selection.
 *
 * Usage:
 *   npm run build
 *   node test/run.mjs
 *
 * If a mapper intentionally changed, regenerate fixtures with fetch-fixtures.mjs.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as leagueMappers from "../dist/yahoo/league.js";
import * as gameMappers from "../dist/yahoo/game.js";
import * as matchupMappers from "../dist/yahoo/matchup.js";
import * as commonMappers from "../dist/yahoo/mappers.js";
import * as playerMappers from "../dist/yahoo/player.js";
import * as rosterMappers from "../dist/yahoo/roster.js";
import * as teamMappers from "../dist/yahoo/team.js";
import * as transactionMappers from "../dist/yahoo/transaction.js";

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
  JSON.parse(readFileSync(join(HERE, "fixtures", sub, `${tool}.json`), "utf8"));

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
  console.error(`\n${failed} mapper(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length} mappers match their fixtures.`);
