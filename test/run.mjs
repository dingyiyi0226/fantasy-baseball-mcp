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
import * as playerMappers from "../dist/yahoo/player.js";
import * as rosterMappers from "../dist/yahoo/roster.js";
import * as teamMappers from "../dist/yahoo/team.js";
import * as transactionMappers from "../dist/yahoo/transaction.js";

const mappers = {
  ...gameMappers,
  ...leagueMappers,
  ...matchupMappers,
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
  ["get_league_metadata", "mapLeagueMetadata", "get_league"],
  ["list_teams", "mapListTeams"],
  ["get_team", "mapTeam"],
  ["get_roster", "mapRosterCompact"],
  ["get_roster_full", "mapRosterFull", "get_roster"],
  ["get_roster_stats", "mapRosterCompactWithStats"],
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
  const categories = categoryTool
    ? mappers.mapGameStatCategories(read("raw", categoryTool)).stat_categories
    : undefined;
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

if (failed) {
  console.error(`\n${failed} mapper(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length} mappers match their fixtures.`);
