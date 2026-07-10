# `adjust-lineup`

Use this tool when the user explicitly wants an agent to manage players between active Yahoo lineup
slots and `BN` in the live Yahoo Fantasy Baseball website.

This tool contains execution-surface-specific sections (`Codex` and `Claude`). Codex uses the
Browser plugin, selecting a browser as its current guidance requires, while Claude drives the user's
real Chrome through `claude-in-chrome`. Keep the Yahoo roster rules shared, and put
surface-specific automation guidance under the right section.

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
3. For Codex, open that URL in the selected Browser plugin tab and verify the tab title
   and URL before making any roster clicks. For Claude, open that URL in the selected Chrome tab.

## Codex

Use this section when the execution surface is Codex controlling a browser through the Browser plugin.

This section uses the current Browser plugin selection rules:
- use it only when the Browser plugin skill `browser:control-in-app-browser` is available
- honor an explicit user request for the Codex in-app browser or Chrome; otherwise select from the
  Yahoo team URL, or use the runtime default only when no target URL is available
- expect Yahoo to already be logged in inside the selected browser before execution
- if the selected tab opens to a Yahoo sign-in page, sign-in prompt, or otherwise shows the user is
  not logged in, stop and report that as a browser-login error; do not continue the move
- do not switch the selected browser unless the Browser plugin guidance permits it
- do not claim the move succeeded until it is confirmed; on any unexpected error, refresh and treat
  the `get_roster` tool as the source of truth (see the shared Phase 3 error path)

### Browser setup (do this first)

Tool split:
- read the `control-in-app-browser` skill provided by the Browser plugin before any browser actions
- use `mcp__node_repl__js` with the Browser plugin runtime for setup and all actual Yahoo browser
  actions
- shell commands may be used only for read-only diagnostics; do not launch browsers through
  CLI/`open`/`osascript`

Workflow:
1. Read the Browser plugin skill `browser:control-in-app-browser` before making browser-control tool
   calls.
2. In `mcp__node_repl__js`, import the Browser plugin's `scripts/browser-client.mjs` by absolute
   path.
3. Call `setupBrowserRuntime({ globals: globalThis })`.
4. Reuse an existing `globalThis.iab`, `globalThis.chrome`, or `globalThis.browser` binding that
   serves the task. Otherwise, follow the Browser plugin's selection rules: explicit user intent
   selects that browser; the Yahoo team URL selects via `getForUrl(teamUrl)`; and `getDefault()` is
   used only when no target URL is available.
5. Store the initial selection in its persistent global binding and immediately read
   `await browser.documentation()` in full. Reuse that browser binding for later calls; if a tab is
   stale or closed, obtain a fresh tab from the existing browser binding.
6. Use the selected `browser` and `tab` for all Yahoo actions.
7. If an explicitly requested browser is unavailable, stop and report that. Do not silently fall
   back to Computer Use, API writes, shell browser launches, or another browser surface.
8. If opening or refreshing the team page shows that Yahoo is not logged in, stop and report it as a
   browser-login error instead of trying to sign in or continuing with the move.

Example setup shape:

```js
const { setupBrowserRuntime } = await import("/absolute/path/to/browser-plugin/scripts/browser-client.mjs");
await setupBrowserRuntime({ globals: globalThis });
if (globalThis.browser == null) {
  globalThis.browser = await agent.browsers.getForUrl(teamUrl);
  nodeRepl.write(await globalThis.browser.documentation());
}
const tab = await globalThis.browser.tabs.getFocusedOrFirst();
```

The example is for a task with no explicit browser request. For an explicit in-app browser or Chrome
request, use the corresponding persistent `globalThis.iab` or `globalThis.chrome` binding and the
selection code in the current Browser plugin skill.

### Codex Browser implementation notes

- Open the team URL in the selected Browser plugin tab and verify the tab title and URL before
  making any roster clicks. If the page is not already logged in to Yahoo Fantasy, stop and report a
  browser-login error.
- Prefer targeted `tab.playwright.evaluate(...)` row reads and screenshots over broad page scraping.
- Yahoo may fail `domSnapshot()` with `TypeError: o.incrementalAriaSnapshot is not a function`; if
  so, use targeted `evaluate`, `dom_cua.get_visible_dom()`, and screenshots instead of treating
  browser control as unavailable.
- Use screenshots to verify green vs. grey legal destination pills because color is the reliable
  swap-mode signal.
- When possible, click stable exact pill locators like
  `span.pos-label[aria-label="Click here to edit BN Nathan Eovaldi"]`, but only after verifying the
  locator count is exactly 1.

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
1. Confirm the correct team page is open in the selected browser tab.
2. Confirm Yahoo is showing the correct lineup date for the requested move.
3. Read the visible roster state from the Yahoo table.
4. Find the source player on `BN` or in an active slot, and identify the source player's current
   position pill.
5. Identify the desired destination slot or the destination player the user wants to swap with.
6. If the page already looks inconsistent after a failed move, refresh first.

### Phase 2 - Enter Swap Mode

1. Click the source player's current position pill and wait for Yahoo to enter swap mode.
2. Confirm that source pill is highlighted and identify the green destination pills; Yahoo permits
   only those destinations.
3. If the green pills are not clear from the current page state, take a screenshot and inspect it
   before choosing a destination.
4. Click only the green pill for the approved destination.

Interpretation rules:
- No green destination means the move is not legal in the current roster state.
- If the approved destination is not green after inspection, do not guess or force the move; refresh
  or reassess the roster constraint.

### Phase 3 - Complete Or Abort

If the intended destination pill is green:
1. Click only the intended green destination pill once.
2. Wait for Yahoo to save.
3. Confirm `Saving...` appears, then `All changes saved`.
4. Re-read the affected roster row(s) to verify the players changed slots.

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

- output a short browser management checklist with the exact source player, source slot, and intended destination slot
- mention any observed roster constraint that might block the move
- when monitoring a live move, narrate only the meaningful state changes: page verified, source pill selected, destination became green, save confirmed, or refresh required
- if a move fails, say it failed and give the post-failure state confirmed via `get_roster`
- never report success from the pre-refresh visual state alone after an error; on any unexpected
  error, refresh and confirm the final roster with `get_roster` before reporting
