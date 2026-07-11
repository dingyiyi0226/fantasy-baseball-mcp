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

console.log("Skill workflow contracts pass.");
