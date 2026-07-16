---
name: fantasy-baseball
description: >
  Top-level Yahoo fantasy baseball tool for roster reviews, lineup moves, waiver advice,
  team status, weekly post-mortems, and comeback checks. Use for prompts like "check my
  teams", "fantasy review", "who should I start", "any add/drops", "weekly review",
  "grade my week", or "can I still win this week".
---

# Fantasy Baseball

This skill is the top-level router for the repo's Yahoo fantasy baseball review workflows.
Keep the public trigger surface stable here, and move the detailed procedure for each workflow
into a dedicated tool reference so we can add more tools over time without bloating this file.

Read `references/tool-notes.md` before calling any Yahoo tools.

## Available Tools

### `daily-roster-review`

Use this tool for the current day-to-day roster review flow:
- matchup scoreboard vs opponent
- opponent pressure check
- start/sit recommendations with exact slot changes
- add/drop targets and streamer ideas
- lineup adjustments delegated to `adjust-lineup` by default; add/drop stays manual by default

When the user asks for fantasy roster review, daily fantasy review, start/sit help, lineup moves,
waiver targets, or general team-status advice, load `references/daily-roster-review.md` and follow
that workflow.

### `weekly-review`

Use this tool for a management post-mortem on the current or a just-finished scoring week:
- category outcome vs. opponent, including in-progress weeks
- move-by-move timeline of adds/drops/lineup calls, graded on process vs. result
- opponent management comparison (lineup cleanliness, streamer usage, add/drop efficiency)
- missed opportunities (IL/NA misuse, unused streams, missed saves chases)
- for an in-progress week that is currently being lost: whether a realistic comeback is still
  possible with the best plausible management from here, not hindsight luck
- a scorecard grading category strategy, adds/drops, daily lineup handling, and IL/NA management

When the user asks for a weekly review, a post-mortem on roster moves, "how did I manage this
week", "grade my week", or whether they can still win a losing week, load
`references/weekly-review.md` and follow that workflow.

### `adjust-lineup`

Use this tool when the user explicitly wants browser-driven Yahoo lineup slot management:
- move a player between active lineup slots and `BN`
- activate or bench pitchers and hitters with exact slot swaps
- inspect the current Yahoo page state before or after a manual click sequence
- produce a manual browser checklist when write execution should stay user-driven

Load `references/browser-control.md` for browser control and
`references/adjust-lineup.md` for the Yahoo lineup procedure. Do not use it for generic browser
automation or API-only roster advice.

### `add-drop-player`

Use this tool when the user explicitly authorizes a browser-driven Yahoo roster transaction:
- add a specific free agent into an empty roster spot
- add a specific free agent and drop one exact, user-approved rostered player

Load `references/browser-control.md` for browser control and
`references/add-drop-player.md` for the Yahoo transaction procedure. Do not use the legacy Yahoo
write API. Follow its confirmation and post-transaction verification rules.

## Operating Rules

- In `daily-roster-review`, default to `autoStartBench=true` and `autoAddDrop=false` unless the
  caller explicitly overrides them.
- For real Yahoo UI lineup changes, prefer the dedicated `adjust-lineup` tool instead of improvising a
  browser procedure inside the review workflows.
- For an explicitly approved Yahoo add/drop transaction, use `add-drop-player`; keep add/drop advice
  recommendation-only when execution was not explicitly authorized.
- For every daily-review add or add/drop recommendation, state whether the target should also be
  started that day, with the exact lineup move, or explicitly say it should remain on `BN`.
- Run multiple user teams sequentially to avoid rate-limiting external baseball data sources.
- Keep reports scannable: strategy first, then scoreboard, then moves, then add/drop targets.
- Every non-trivial recommendation needs a brief `Why` plus a compact `Evidence` table.
- If a deeper check reverses an earlier call, label it clearly as a `Phase 2 reversal`.
- Never hardcode or publish a user's personal league key, team key, or team name.

## Maintenance Notes

- Add future workflows as sibling reference files under `references/` and list them in `Available Tools`.
- Keep this `SKILL.md` focused on trigger coverage, routing, and shared guardrails.
- Put long workflow details in dedicated reference files so the skill stays small and extensible.
