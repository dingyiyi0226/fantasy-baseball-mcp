/**
 * Guard the cross-tool assumptions encoded in shipped skill workflows.
 *
 * These references cannot be exercised through the MCP server, so assert the
 * operational constraints that prevent expensive or incorrectly scoped calls.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

function markdownFiles(path) {
  return readdirSync(join(ROOT, path), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(path, entry.name);
    if (entry.isDirectory()) return markdownFiles(relativePath);
    return entry.isFile() && entry.name.endsWith(".md") ? [relativePath] : [];
  });
}

const dailyReview = read("skills/fantasy-baseball/references/daily-roster-review.md");
const toolNotes = read("skills/fantasy-baseball/references/tool-notes.md");
const developmentDocs = read("docs/development.md");
const addDrop = read("skills/fantasy-baseball/references/add-drop-player.md");
const adjustLineup = read("skills/fantasy-baseball/references/adjust-lineup.md");
const browserControl = read("skills/fantasy-baseball/references/browser-control.md");

assert.match(
  dailyReview,
  /once per `lineupDate`[\s\S]*?`date=lineupDate, fantasyContext=false`/,
  "daily review must fetch the plain probable-starter board once per date",
);
assert.match(
  dailyReview,
  /starter row[\s\S]*?`starters\.columns`/,
  "daily review must decode the compact probable-starter table",
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
  /call `get_league_metadata`[\s\S]*?Do not call[\s\S]*?`get_league` during setup/,
  "daily review must preserve the lightweight Phase 0 setup",
);
assert.match(
  dailyReview,
  /Reuse the player keys from Phase 1B's roster response; do not call `get_roster` again/,
  "daily review must reuse the roster response when batching player analysis",
);
assert.match(
  dailyReview,
  /IL\/NA-status player occupying an active or `BN` slot[\s\S]*?vacant matching reserve slot[\s\S]*?Treat the freed active\/`BN` spot[\s\S]*?without a drop/,
  "daily review must free standard roster capacity by placing eligible IL/NA players first",
);
assert.match(
  dailyReview,
  /not already cached[\s\S]*?lazily call `get_league` once[\s\S]*?`settings\.roster_positions`/,
  "daily review must load configured reserve capacity lazily and at most once per league",
);
assert.match(
  dailyReview,
  /configured[\s\S]*?count is greater than its occupied assignment count[\s\S]*?Never infer configured IL\/NA capacity[\s\S]*?empty reserve slots may be omitted/,
  "daily review must compare configured capacity with assignments instead of counting roster rows",
);
assert.match(
  dailyReview,
  /settings cannot be fetched[\s\S]*?capacity as \*\*unknown\*\*[\s\S]*?do not recommend a drop[\s\S]*?Yahoo/,
  "daily review must not infer a full reserve or required drop when capacity is unavailable",
);
assert.match(
  dailyReview,
  /Before identifying a drop candidate[\s\S]*?prefer an add-only recommendation[\s\S]*?no standard spot can be freed/,
  "daily review must prefer an add-only recommendation when roster capacity is open",
);
assert.match(
  dailyReview,
  /For every proposed add[\s\S]*?lineup follow-up[\s\S]*?add and start[\s\S]*?add only — leave on BN/,
  "daily review must give every add recommendation an explicit same-day lineup outcome",
);
assert.match(
  dailyReview,
  /After each verified add\/add-drop[\s\S]*?`adjust-lineup`[\s\S]*?no lineup adjustment is\n+needed/,
  "daily review must execute or report the add target's recorded lineup follow-up",
);
assert.match(
  dailyReview,
  /\| Vacant IL \| 5 IL \| 3 IL \| IL10 player on BN \| Move BN -> IL,[^\n]*?without a drop \|/,
  "daily review must cover moving an IL10 player into the fourth of five IL slots before an add",
);
assert.match(
  dailyReview,
  /\| Full IL \| 5 IL \| 5 IL \| IL10 player on BN \| No reserve vacancy;[^\n]*?Yahoo confirms one is required \|/,
  "daily review must cover the genuinely full IL reserve case",
);
assert.match(
  dailyReview,
  /\| Vacant NA \| 3 NA \| 2 NA \| NA player on BN \| Move BN -> NA,[^\n]*?without a drop \|/,
  "daily review must apply the same vacancy rule to NA slots",
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
  toolNotes,
  /`starters\.columns`[\s\S]*?`starters\.rows`/,
  "tool notes must document the compact probable-starter table",
);
assert.match(
  toolNotes,
  /`mlbStats\.columns`[\s\S]*?`mlbStats\.standard`[\s\S]*?`mlbStats\.recent14d`[\s\S]*?`mlbStats\.recent30d`/,
  "tool notes must document the flattened roster-analysis MLB windows",
);
assert.match(
  dailyReview,
  /Decode each `mlbStats\.standard`[\s\S]*?`mlbStats\.columns` indexes/,
  "daily review must decode roster-analysis MLB arrays by their shared columns",
);
assert.match(
  toolNotes,
  /rows show occupied `selected_position` assignments, not configured slot capacity[\s\S]*?Empty IL\/NA[\s\S]*?never infer total reserve capacity/,
  "tool notes must distinguish roster assignments from configured reserve capacity",
);
assert.match(
  toolNotes,
  /keep `get_league_metadata` as the normal setup call[\s\S]*?Call `get_league` lazily[\s\S]*?`settings\.roster_positions`/,
  "tool notes must preserve the lazy league-settings lookup",
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
assert.match(
  toolNotes,
  /`team_key` is `<game_id>\.l\.<league_id>\.t\.<team_id>`, for example `123\.l\.12345\.t\.2`/,
  "tool notes must define the team-key segments used throughout tool responses",
);
assert.match(
  developmentDocs,
  /\| `transaction_key` \| `<game_id>\.l\.<league_id>\.tr\.<transaction_id>` \| `123\.l\.12345\.tr\.249` \|/,
  "development docs must define every returned Yahoo identity-key format",
);
assert.match(
  adjustLineup,
  /https:\/\/baseball\.fantasysports\.yahoo\.com\/b1\/<league_id>\/<team_id>/,
  "lineup workflow must document Yahoo's canonical league/team URL parameters",
);
assert.match(
  addDrop,
  /\/b1\/<league_id>\/<team_id>\/addplayer\?apid=<player_id>/,
  "add/drop workflow must document Yahoo's canonical URL parameters",
);
assert.match(
  browserControl,
  /rerender the roster row[\s\S]*?do not reuse the source locator with `locator\.press\(\.\.\.\)`[\s\S]*?tab-level `tab\.cua\.keypress\(\.\.\.\)`/,
  "lineup controls must avoid locator-scoped keys after Yahoo rerenders the source row",
);
assert.match(
  browserControl,
  /Focused input target no longer matches the resolved locator[\s\S]*?stale focus after the[\s\S]*?rerender[\s\S]*?not as a Yahoo application or lineup-eligibility error/,
  "lineup controls must classify focused-target mismatch as stale focus after rerender",
);

const staleResponseIdField = /(?:returns?|contains?|includes?)\b[^\n]*`(?:player|transaction|team|league|game)_id`/i;
for (const path of ["README.md", ...markdownFiles("docs"), ...markdownFiles("skills")]) {
  assert.doesNotMatch(
    read(path),
    staleResponseIdField,
    `${path} must not present an ID segment as a returned response field`,
  );
}

console.log("Skill workflow contracts pass.");
