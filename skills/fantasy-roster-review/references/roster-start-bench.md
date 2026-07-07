# `roster-start-bench`

Use this tool when the user explicitly wants Codex to manage players between active Yahoo lineup
slots and `BN` in the live Yahoo Fantasy Baseball website.

This tool contains execution-surface-specific sections. Keep the Yahoo roster rules shared, and put surface-specific automation guidance under the right section.

Read `references/tool-notes.md` before using this tool.

## Shared Scope

Use this tool for the shared Yahoo roster-management behavior:
- activating a benched hitter or pitcher into a valid lineup slot
- benching an active player into `BN`
- swapping two players by clicking Yahoo position pills
- watching the page while the user performs a move manually, then reporting what happened
- recovering from Yahoo UI desync by refreshing and re-reading the visible roster state

Do not use this tool for:
- add/drop transactions
- waiver claims
- API-only lineup advice with no browser interaction

## Inputs

```text
teamId:        required when the current Yahoo team page is not already open
leagueId:      discover from Yahoo tools when not explicitly provided
playerName:    required for the source player the user wants to move
targetSlot:    required when the user already knows the destination slot (`BN`, `SP`, `RP`, `P`, `Util`, etc.)
```

## URL & Team Discovery

When Chrome is not already on the correct Yahoo team page:
1. Discover the user's league and team ids from Yahoo tools such as `get_league`, `fantasy_status`, or other team-discovery output.
2. Build the team URL as:
   `https://baseball.fantasysports.yahoo.com/b1/<league_id>/<team_id>`
3. Open that URL in **Chrome** and verify the front tab title and URL before making any roster clicks.

## Codex

Use this section when the execution surface is Codex controlling the user's Chrome session.

This section is **Codex Chrome only**:
- use it only when the Chrome plugin or Chrome-control path is available
- assume Yahoo is already logged in inside Chrome unless the user says otherwise
- do not substitute the in-app browser or a different browser automation surface
- do not claim the move succeeded until the Chrome page shows the saved state

## Roster Move Workflow

### Phase 1 - Inspect

Before any click:
1. Confirm the correct team page is open in Chrome.
2. Read the visible roster state from the Yahoo table.
3. Find the source player's current slot pill.
4. Identify the desired destination slot or the destination player the user wants to swap with.
5. If the page already looks inconsistent after a failed move, refresh first.

### Phase 2 - Enter Swap Mode

To start a move:
1. Click the source player's current position pill.
2. Wait for Yahoo to enter swap mode.
3. Confirm the source pill becomes highlighted.
4. Confirm legal destination pills turn green.

Interpretation rules:
- green means Yahoo currently allows that destination
- no green destination means the move is not legal in the current roster state
- if the expected destination does not turn green, do not guess; refresh or reassess the roster constraint

### Phase 3 - Complete Or Abort

If the intended destination pill is green:
1. Click that destination pill once.
2. Wait for Yahoo to save.
3. Confirm `Saving...` appears, then `All changes saved`.
4. Re-read the roster row(s) to verify the players changed slots.

If Yahoo shows an error or the page becomes inconsistent:
1. Treat the move as unconfirmed.
2. Refresh the page.
3. Re-read the roster from the refreshed page.
4. Report the refreshed state instead of the stale visual state.

## Observed Yahoo Behaviors

Use these behaviors as hard-earned constraints, not guesses:
- Bench or active swap targets are surfaced through green position pills only after selecting the source pill.
- `SP` bench pitchers can swap into `SP` and `P`, but not `RP`.
- `RP` bench pitchers can swap into `RP` and `P`, but not `SP`.
- Multi-eligible hitters can light multiple infield or outfield pills plus `Util`.
- IL moves can fail even after a click path appears available; a full active-plus-bench roster is a common cause.
- After a failed IL-related move, refresh before deciding what the current roster actually is.

## Reporting Rules

- output a short Chrome management checklist with the exact source player, source slot, and intended destination slot
- mention any observed roster constraint that might block the move
- when monitoring a live move, narrate only the meaningful state changes: page verified, source pill selected, destination became green, save confirmed, or refresh required
- if a move fails, say it failed and give the refreshed post-failure state
- never report success from the pre-refresh visual state alone after an error
