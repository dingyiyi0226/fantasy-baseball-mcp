# Browser Control

Use the in-app Browser plugin for Codex and `claude-in-chrome` for Claude.

## Codex

### Prerequisites

- Use only the in-app Browser plugin.
- The in-app browser must already have an authenticated Yahoo session. If Yahoo is logged out or
  shows a sign-in prompt, stop and ask the user to sign in there.
- If the Browser plugin or in-app browser is unavailable, stop and report that. Do not fall back to
  another browser surface, Computer Use, shell browser launches, or API writes.

### Connect to the in-app browser

1. Read the Browser plugin skill `browser:control-in-app-browser` before any browser-control call.
2. Use `mcp__node_repl__js` and import the plugin's `scripts/browser-client.mjs` by absolute path.
   If `agent.browsers` already exists, reuse it instead of importing or initializing another runtime.
3. Reuse an existing `globalThis.iab` binding when it serves the task. Otherwise, call
   `setupBrowserRuntime({ globals: globalThis })`, then set
   `globalThis.iab = await agent.browsers.get("iab")`.
4. Immediately read the in-app browser's complete documentation with the direct
   `nodeRepl.write(await iab.documentation())` call. Do not reread it unless a disconnection
   requires a new in-app browser binding.

### Keep control of the workflow tab

- Reuse one controlled, normal browser tab throughout the workflow. Do not finalize, hand off, or
  move it to picture-in-picture while a Yahoo write is staged.
- A stale or closed tab does not invalidate `globalThis.iab`; obtain a fresh tab from that existing
  binding instead of selecting another browser.

### Interact safely

- Open the target Yahoo page in the selected tab and verify its title and URL before any browser
  click.
- Use the Browser plugin runtime for every Yahoo browser action. Prefer stable exact `href`, form
  value, and player-row locators over glyph text, and require the intended locator to resolve exactly
  once before clicking.
- When a visual state determines whether an action is valid, verify it with a screenshot.
- Yahoo may fail `domSnapshot()` with `TypeError: o.incrementalAriaSnapshot is not a function`.
  If so, use targeted `tab.playwright.evaluate(...)`, `dom_cua.get_visible_dom()`, and screenshots
  instead of treating browser control as unavailable.

### Yahoo lineup controls

- In swap mode, green position pills are the reliable legality signal.
- After a Yahoo lineup source pill enters swap mode, use keyboard control by default:
  `await tab.cua.keypress({ keys: ["ARROWUP"] })` or
  `await tab.cua.keypress({ keys: ["ARROWDOWN"] })` to move focus through legal destinations.
  Yahoo scrolls the focused destination into view; arrow-key navigation does not save the move. Take
  a screenshot when the approved green destination is focused, then press `ENTER` once to save. Use
  `ESC` to cancel swap mode.
- Fall back to click-and-scroll only when keyboard navigation cannot reveal the approved target.
  Scroll only through the controlled tab: use
  `await tab.cua.scroll({ x, y, scrollX, scrollY })` or
  `await tab.dom_cua.scroll({ x, y })`. Do not call an unscoped `scroll` method or an undocumented
  Playwright scrolling helper. Take a fresh screenshot after every scroll, then click only the
  approved green position pill.

## Claude

### Prerequisites

- Use only the `claude-in-chrome` MCP tools (`mcp__claude-in-chrome__*`) to drive the user's real
  Chrome. Do not substitute the in-app browser or another automation surface.
- A connected Chrome browser with an authenticated Yahoo session is required. If no browser is
  connected or Yahoo is logged out, stop and ask the user to connect or sign in, then tell you when
  it is ready.

### Connect to Chrome

1. Call `list_connected_browsers`. If more than one browser is connected you **must** ask the user
   which one to use (list every browser with its `deviceId`) before any browser action — never pick
   one yourself.
2. `select_browser` with the chosen `deviceId`.
3. `tabs_context_mcp{createIfEmpty:true}` to get or create a working tab, and note its `tabId`.

### Keep control of the workflow tab

- Reuse one controlled, normal Chrome tab throughout the workflow. Do not hand it off, replace it,
  or move it to picture-in-picture while a Yahoo write is staged.

### Interaction

- Use `navigate` with the working `tabId` to open or reload a Yahoo URL.
- Use a `computer` `screenshot` to inspect visual page state. Use `find` or `read_page` only
  when a screenshot does not clearly identify the intended row or control.
- Take a fresh screenshot immediately before each coordinate-based `computer` `left_click`, and
  after any scroll, navigation, or page rerender. Use `computer` `key` for keyboard actions.

## Error Handling

### Timeout or Browser Transport Failure

After the first timeout from a click, screenshot, snapshot, navigation, reload, or browser transport:

1. Stop the current action. Do not repeat the click or submit control in the failed tab.
2. Call `get_roster` once for the target team and roster date to confirm Yahoo's saved state. If the
   intended move saved, report success and stop.
3. If the move did not save, reuse the existing browser binding to open one new normal tab at the
   same team URL. Reinspect the roster date, source player, and legal green destination, then retry
   that same approved move once.
4. If the new tab cannot load, or any action in it times out, call `get_roster` once more and report
   the exact manual source-to-destination swap with the API-confirmed state.

Never reinitialize the browser, reload, scroll for recovery, return to the failed tab, or open a
third tab for the same move.

### Other Unexpected Yahoo State

When the browser is responsive but Yahoo's visible state is inconsistent:

1. Stop the current action. Do not repeat a click or submit control.
2. Take one fresh screenshot to identify the visible state.
3. If it remains unclear, refresh once and call `get_roster` for the target team and roster date.
4. Resume only when that single refresh and `get_roster` establish a clear, still-authorized action;
   otherwise, stop and report the manual swap.
