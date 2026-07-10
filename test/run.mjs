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
import * as mappers from "../dist/tools/mappers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (sub, tool) =>
  JSON.parse(readFileSync(join(HERE, "fixtures", sub, `${tool}.json`), "utf8"));

const CASES = [
  ["list_leagues", "mapListLeagues"],
  ["get_league", "mapLeague"],
  ["get_teams", "mapTeams"],
  ["get_standings", "mapStandings"],
  ["get_roster", "mapRosterCompact"],
  ["get_roster_full", "mapRosterFull", "get_roster"],
  ["get_roster_stats", "mapRosterCompactWithStats"],
  ["get_team_stats_week", "mapTeamStats"],
  ["get_team_stats_season", "mapTeamStats"],
  ["get_matchups", "mapMatchups"],
  ["get_team_matchups", "mapTeamMatchups"],
  ["get_player_stats", "mapPlayerStats"],
  ["list_players", "mapPlayerList"],
  ["rank_players", "mapRankPlayers"],
  ["get_transactions", "mapTransactions"],
];

let failed = 0;
for (const [tool, mapper, rawTool = tool] of CASES) {
  const actual = JSON.stringify(mappers[mapper](read("raw", rawTool)), null, 2);
  const expected = JSON.stringify(read("mapped", tool), null, 2);
  if (actual === expected) {
    console.log(`  ok   ${tool}`);
  } else {
    failed++;
    console.log(`  FAIL ${tool} (${mapper} output differs from fixtures/mapped/${tool}.json)`);
  }
}

if (failed) {
  console.error(`\n${failed} mapper(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length} mappers match their fixtures.`);
