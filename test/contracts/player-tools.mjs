/** Verify the dedicated free-agent batter ranking request and response contract. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerPlayerTools } from "../../dist/yahoo/player.js";

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
  resolveLeagueKey: (leagueKey) => leagueKey ?? "123.l.12345",
  yahoo: {
    async get(path) {
      requests.push(path);
      return readFixture("rank_free_agent_batters");
    },
  },
};

registerPlayerTools(server, ctx);

assert.ok(registered.has("rank_free_agent_batters"));
const periodSchema = registered.get("rank_free_agent_batters").definition.inputSchema.period;
assert.equal(periodSchema.parse(undefined), "lastweek");
assert.equal(periodSchema.parse("lastmonth"), "lastmonth");
assert.throws(() => periodSchema.parse("season"));

const result = await registered.get("rank_free_agent_batters").handler({
  sort: "12",
  period: "lastweek",
  start: 0,
  count: 5,
});
assert.equal(
  requests[0],
  "/league/123.l.12345/players;status=FA;position=B;sort=12;sort_type=lastweek;" +
    "start=0;count=5;out=ownership/stats;type=lastweek",
);

const payload = JSON.parse(result.content[0].text);
assert.ok(!payload.players.columns.includes("player_id"));
assert.ok(!payload.players.columns.includes("batting_order"));
const value = (column) =>
  payload.players.rows[0][payload.players.columns.indexOf(column)];
assert.deepEqual(value("ownership"), { ownership_type: "freeagents" });
assert.deepEqual(value("player_stats"), { coverage_type: "lastweek" });
assert.ok(value("player_stats.stats.rows").length > 0);

const rankPlayersResult = await registered.get("rank_players").handler({
  sort: "AR",
  sortType: "lastweek",
  start: 0,
  count: 5,
});
const rankPlayersPayload = JSON.parse(rankPlayersResult.content[0].text);
assert.ok(!rankPlayersPayload.players.columns.includes("player_id"));
assert.ok(!rankPlayersPayload.players.columns.includes("batting_order"));

console.log("Player tool contracts pass.");
