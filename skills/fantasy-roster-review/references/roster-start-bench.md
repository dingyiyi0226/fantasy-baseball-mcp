# `roster-start-bench`

Use this tool when the user explicitly wants an agent to manage players between active Yahoo lineup
slots and `BN` in the live Yahoo Fantasy Baseball website.

This tool contains execution-surface-specific sections (`Codex` and `Claude`), both of which drive
the user's real Chrome. Keep the Yahoo roster rules shared, and put surface-specific automation
guidance under the right section.

Read `references/tool-notes.md` before using this tool.

## Shared Scope

Use this tool for the shared Yahoo roster-management behavior:
- activating a benched hitter or pitcher into a valid lineup slot
- benching an active player into `BN`
- swapping two players by clicking Yahoo position pills
- watching the page while the user performs a move manually, then reporting what happened
- recovering from any unexpected error or Yahoo UI desync by refreshing the page and confirming the
  authoritative roster state with the `get_roster` tool

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
- do not claim the move succeeded until it is confirmed; on any unexpected error, refresh and treat
  the `get_roster` tool as the source of truth (see the shared Phase 3 error path)

### Profile and backend selection (do this first)

When the user asks to use the Codex Chrome tool, do **not** assume the default Chrome profile is
correct.

Tool split:
- use the Chrome plugin for Chrome profile selection, launch, and extension backend setup
- shell commands (e.g. `functions.exec_command`) may be used only for read-only diagnostics; do not
  launch Chrome through CLI/`open`/`osascript` unless the user explicitly asks for that fallback
- use `mcp__node_repl__js` for live Chrome backend checks and all actual Chrome actions

Workflow:
1. Before launching, inspect Chrome profiles and select a profile where the Codex Chrome Extension is
   installed and enabled. Do not use the default or last-used Chrome profile unless it is also a
   valid extension-enabled profile.
2. If multiple profiles have the extension installed and enabled, prefer the last-used profile among
   those valid profiles. If only one profile has the extension, launch that profile explicitly.
3. When Chrome is not running, launch it through the Chrome plugin's own browser setup flow, not via
   shell commands such as `open`, `osascript`, or direct CLI browser launches.
4. Use the Chrome plugin/browser-client documented launch path, then retry
   `agent.browsers.get("extension")`. Only fall back to reporting failure after the plugin launch
   path has been tried.
5. Only continue if a live Chrome backend of `type: "extension"` is available.
6. Do all real Chrome work through `mcp__node_repl__js`, not Computer Use and not the in-app
   browser.

Rules:
- prefer "profile with extension installed and enabled" over "last-used profile"
- do not proceed with a profile that lacks the Codex Chrome Extension
- if the live extension backend is unavailable, stop and report it instead of silently falling back

## Claude

Use this section when the execution surface is **Claude driving the user's Chrome** through the
`claude-in-chrome` MCP tools (`mcp__claude-in-chrome__*`).

This section is **Claude-in-Chrome only**:
- it drives real Chrome through the `claude-in-chrome` tools, not the in-app browser or any other
  automation surface
- assume Yahoo is already logged in inside the selected Chrome unless the user says otherwise
- do not claim a move succeeded until it is confirmed; on any unexpected error, refresh and treat
  the `get_roster` tool as the source of truth (see the shared Phase 3 error path)

### Browser selection (do this first)

1. Call `list_connected_browsers`. If more than one browser is connected you **must** ask the user
   which one to use (list every browser with its `deviceId`) before any browser action — never pick
   one yourself.
2. `select_browser` with the chosen `deviceId`.
3. `tabs_context_mcp{createIfEmpty:true}` to get or create a working tab, and note its `tabId`.

### Tool mapping for the workflow phases

Run the shared `Roster Move Workflow` below with these tools:
- **Open the team page**: `navigate` to the team URL on the working `tabId`.
- **Read roster state (Phase 1)**: take a `computer` `screenshot`. The swap-mode signal is
  *visual* (green vs. greyed pills), so a screenshot is the reliable read — prefer it over
  `read_page`/`get_page_text` for confirming legal destinations. Use `find` or `read_page` only to
  locate a player row by name when a screenshot alone is ambiguous.
- **Enter swap mode (Phase 2)**: `computer` `left_click` on the source player's position pill, then
  screenshot to confirm the pill highlighted (its row also tints) and which destinations turned green.
- **Complete the move (Phase 3)**: `left_click` the green destination pill, then screenshot to
  confirm `Saving...` → `All changes saved` and the changed slots.
- **Abort / cancel swap mode**: press `Escape` (`computer` `key`). Verified to clear the green
  highlights and leave the roster unchanged — use it to back out after inspecting a swap without
  committing.
- **Recover from any error / desync (Phase 3 error path)**: `navigate` to the same team URL again to
  reload, then call the `get_roster` tool to read the authoritative saved state. Trust `get_roster`
  over the screenshot when they disagree.

### Claude-in-Chrome specifics

- The roster table is long and only a few rows of pills are on screen at once. Scrolling changes
  pill coordinates, and *entering swap mode can auto-scroll the page* — always take a fresh
  screenshot immediately before each click and click from those fresh coordinates.
- Read pill color from a screenshot, not from the accessibility tree.
- Do not report success from a stale pre-reload screenshot after an error; follow the shared Phase 3
  error path (refresh, then confirm with `get_roster`) before reporting.

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

On **any** unexpected error, or if the page becomes inconsistent:
1. Treat the move as unconfirmed.
2. Refresh the page.
3. Call the `get_roster` tool to fetch the authoritative saved state (the backend API is more
   accurate than the visible page, which can lag or misrepresent what Yahoo actually saved).
4. Report the state from `get_roster`, not the stale visual state. If `get_roster` and the refreshed
   page disagree, trust `get_roster`.

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
- if a move fails, say it failed and give the post-failure state confirmed via `get_roster`
- never report success from the pre-refresh visual state alone after an error; on any unexpected
  error, refresh and confirm the final roster with `get_roster` before reporting
