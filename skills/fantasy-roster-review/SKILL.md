---
name: fantasy-roster-review
description: >
  Fantasy baseball roster review for Yahoo fantasy baseball teams. Produces an actionable report:
  category scoreboard vs. opponent, start/sit lineup moves (with slot positions), and add/drop
  targets. Does NOT auto-execute roster changes unless explicitly asked.

  Use this skill whenever the user asks for: fantasy roster review, daily fantasy review,
  roster review, fantasy check,
  start/sit advice, lineup moves, waiver wire targets, fantasy baseball status, or anything
  resembling "check my fantasy teams." Trigger on phrases like "check my teams", "fantasy review",
  "how are my teams doing", "who should I start", "any add/drops", "daily fantasy", or
  "run the roster review".
---

# Fantasy Roster Review

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
- manual checklist by default; only execute moves when the user explicitly asks

When the user asks for fantasy roster review, daily fantasy review, start/sit help, lineup moves,
waiver targets, or general team-status advice, load `references/daily-roster-review.md` and follow
that workflow.

## Operating Rules

- Default to recommendation-only mode unless the user explicitly asks to execute lineup or roster changes.
- Run multiple user teams sequentially to avoid rate-limiting external baseball data sources.
- Keep reports scannable: strategy first, then scoreboard, then moves, then add/drop targets.
- Every non-trivial recommendation needs a brief `Why` plus a compact `Evidence` table.
- If a deeper check reverses an earlier call, label it clearly as a `Phase 2 reversal`.
- Never hardcode or publish a user's personal league key, team key, or team name.

## Maintenance Notes

- Add future workflows as sibling reference files under `references/` and list them in `Available Tools`.
- Keep this `SKILL.md` focused on trigger coverage, routing, and shared guardrails.
- Put long workflow details in dedicated reference files so the skill stays small and extensible.
