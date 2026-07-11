# `adjust-lineup`

Use this tool when the user explicitly wants an agent to manage players between active Yahoo lineup
slots and `BN` in the live Yahoo Fantasy Baseball website.

Browser-control instructions live in `references/browser-control.md`. Keep this file focused on
Yahoo roster rules and lineup state.

Read `references/tool-notes.md` before using this tool.
Read `references/browser-control.md` before opening or controlling a browser.

## Shared Scope

Use this tool for the shared Yahoo roster-management behavior:
- activating a benched hitter or pitcher into a valid lineup slot
- benching an active player into `BN`
- swapping two players by clicking Yahoo position pills
- watching the page while the user performs a move manually, then reporting what happened
- recovering from any unexpected error or Yahoo UI desync through the shared browser error-handling
  procedure

Do not use this tool for:
- add/drop transactions or add/drop tools
- waiver claims
- legacy Yahoo write APIs
- API-only lineup advice with no browser interaction

`get_roster` is allowed only for read-only verification, especially after refreshes, errors, or any
visual mismatch.

## Inputs

```text
teamId:        required when the current Yahoo team page is not already open
leagueId:      discover from Yahoo tools when not explicitly provided
playerName:    required for the source player the user wants to move
targetSlot:    required when the user already knows the destination slot (`BN`, `SP`, `RP`, `P`, `Util`, etc.)
```

## URL & Team Discovery

When the selected browser tab is not already on the correct Yahoo team page:
1. Discover the user's league and team ids from Yahoo tools such as `get_league`, `fantasy_status`, or other team-discovery output.
2. Build the team URL as:
   `https://baseball.fantasysports.yahoo.com/b1/<league_id>/<team_id>`
3. Use that URL as the workflow target and verify the page title and URL before making any roster
   clicks.

## Roster Move Workflow

### Phase 1 - Inspect

Before any click:
1. Confirm the correct team page is open in the selected browser tab.
2. Confirm Yahoo is showing the correct lineup date for the requested move.
3. Read the visible roster state from the Yahoo table.
4. Find the source player on `BN` or in an active slot, and identify the source player's current
   position pill.
5. Identify the desired destination slot or the destination player the user wants to swap with.
6. If the page already looks inconsistent, follow `Error Handling` in
   `references/browser-control.md`; do not start another swap attempt first.

### Phase 2 - Enter Swap Mode

1. Click the source player's current position pill and wait for Yahoo to enter swap mode.
2. Confirm that source pill is highlighted and identify the green destination pills; Yahoo permits
   only those destinations.
3. If the green pills are not clear from the current page state, take a screenshot and inspect it
   before choosing a destination.
4. Click only the green pill for the approved destination.

Interpretation rules:
- No green destination means the move is not legal in the current roster state.
- If the approved destination is not green after inspection, do not guess or force the move; reassess
  the roster constraint. Follow the browser error procedure only when the page is inconsistent.

### Phase 3 - Complete Or Abort

If the intended destination pill is green:
1. Click only the intended green destination pill once.
2. Wait for Yahoo to save.
3. Confirm `Saving...` appears, then `All changes saved`.
4. Re-read the affected roster row(s) to verify the players changed slots.

To cancel after entering swap mode, press `Escape`. Confirm that the green highlights clear and the
visible roster remains unchanged.

On any unexpected error or inconsistent page state, follow `Error Handling` in
`references/browser-control.md`.

## Observed Yahoo Behaviors

Use these behaviors as hard-earned constraints, not guesses:
- Bench or active swap targets are surfaced through green position pills only after selecting the source pill.
- `SP` bench pitchers can swap into `SP` and `P`, but not `RP`.
- `RP` bench pitchers can swap into `RP` and `P`, but not `SP`.
- Multi-eligible hitters can light multiple infield or outfield pills plus `Util`.
- IL moves can fail even after a click path appears available; a full active-plus-bench roster is a common cause.
- After a failed IL-related move while the browser remains responsive, refresh once before deciding
  what the current roster actually is. A timeout follows the terminal timeout rule instead.

## Reporting Rules

- output a short browser management checklist with the exact source player, source slot, and intended destination slot
- mention any observed roster constraint that might block the move
- when monitoring a live move, narrate only the meaningful state changes: page verified, source pill selected, destination became green, save confirmed, or manual fallback required
- if a move fails, say it failed and give the post-failure state confirmed via `get_roster`
- never report success from the pre-error visual state alone; confirm the final roster with
  `get_roster` before reporting and obey the terminal timeout rule in `browser-control.md`
