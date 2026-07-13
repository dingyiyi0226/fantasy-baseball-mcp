/**
 * Guard the cross-tool assumptions encoded in shipped skill workflows.
 *
 * These references cannot be exercised through the MCP server, so assert the
 * operational constraints that prevent expensive or incorrectly scoped calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

const dailyReview = read("skills/fantasy-baseball/references/daily-roster-review.md");
const toolNotes = read("skills/fantasy-baseball/references/tool-notes.md");

assert.match(
  dailyReview,
  /once per `lineupDate`[\s\S]*?`date=lineupDate, fantasyContext=false`/,
  "daily review must fetch the plain probable-starter board once per date",
);
assert.doesNotMatch(
  dailyReview,
  /fantasyContext=true/,
  "daily review must not use default-team ownership enrichment",
);
assert.doesNotMatch(
  dailyReview,
  /full=true/,
  "daily review must use the compact roster tool for opponent pressure",
);
assert.match(
  dailyReview,
  /Reuse the player keys from Phase 1B's roster response; do not call `get_roster` again/,
  "daily review must reuse the roster response when batching player analysis",
);
assert.match(
  dailyReview,
  /IL\/NA-status player occupying an active or `BN` slot[\s\S]*?vacant matching reserve slot[\s\S]*?without dropping anyone/,
  "daily review must free standard roster capacity by placing eligible IL/NA players first",
);
assert.match(
  dailyReview,
  /Before identifying a drop candidate[\s\S]*?prefer an add-only recommendation[\s\S]*?no empty slot remains/,
  "daily review must prefer an add-only recommendation when roster capacity is open",
);
assert.match(
  dailyReview,
  /currentTeamKey[\s\S]*?probable-starter board locally[\s\S]*?opponentTeamKey/,
  "daily review must join the shared board to both rosters locally",
);
assert.match(
  toolNotes,
  /configured default league\/team[\s\S]*?cannot be scoped to a different team/,
  "tool notes must preserve the ownership-enrichment scope limitation",
);
assert.match(
  dailyReview,
  /`rank_free_agent_batters` with `period=lastweek`[\s\S]*?at most five[\s\S]*?`recent14d`/,
  "daily review must shortlist FA batters from recent Yahoo rankings and validate 14-day form",
);
assert.match(
  toolNotes,
  /`rank_free_agent_batters`[\s\S]*?`status=FA` and `position=B`[\s\S]*?`player_stats\.coverage_type`/,
  "tool notes must preserve the FA-only batter ranking and recent-stat response contract",
);

console.log("Skill workflow contracts pass.");
