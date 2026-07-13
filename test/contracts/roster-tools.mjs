/** Verify the public roster-tool split and its smallest response path. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerRosterReadTools } from "../../dist/yahoo/roster.js";

const readFixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/raw/${name}.json`, import.meta.url), "utf8"));

const registered = new Map();
const requests = [];
const server = {
  registerTool(name, definition, handler) {
    registered.set(name, { definition, handler });
  },
};
const ctx = {
  resolveTeamKey: (teamKey) => teamKey ?? "123.l.12345.t.2",
  yahoo: {
    async get(path) {
      requests.push(path);
      return path.endsWith(";out=stats")
        ? readFixture("get_roster_stats")
        : readFixture("get_roster");
    },
  },
};

registerRosterReadTools(server, ctx);

assert.deepEqual([...registered.keys()], ["get_roster", "get_roster_stats"]);
assert.ok("keyOnly" in registered.get("get_roster").definition.inputSchema);
assert.ok(!("full" in registered.get("get_roster").definition.inputSchema));
assert.ok(!("includeStats" in registered.get("get_roster").definition.inputSchema));

const parseResult = (result) => JSON.parse(result.content[0].text);
const tableValue = (table, rowIndex, column) => table.rows[rowIndex][table.columns.indexOf(column)];
const keyOnly = parseResult(await registered.get("get_roster").handler({ keyOnly: true }));
assert.deepEqual(keyOnly, ["123.p.11732", "123.p.10235", "123.p.12100"]);

const roster = parseResult(await registered.get("get_roster").handler({}));
assert.equal(tableValue(roster.players, 0, "is_starting"), 0);

const rosterStats = parseResult(await registered.get("get_roster_stats").handler({}));
assert.equal(tableValue(rosterStats.players, 0, "player_id"), 11732);
assert.equal(tableValue(rosterStats.players, 0, "status"), null);
assert.equal(tableValue(rosterStats.players, 0, "is_starting"), 0);
const playerStats = tableValue(rosterStats.players, 0, "player_stats");
assert.equal(playerStats.coverage_type, "date");
assert.ok(!("stats" in playerStats));
assert.deepEqual(tableValue(rosterStats.players, 0, "player_stats.stats.columns"), ["stat_id", "value"]);
assert.ok(tableValue(rosterStats.players, 0, "player_stats.stats.rows"));
assert.ok(requests.some((path) => path.endsWith("/players;out=stats")));

console.log("Roster tool contracts pass.");
