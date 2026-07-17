# `add-drop-player`

Use this tool when the user explicitly authorizes adding a Yahoo free agent or adding one player
while dropping another in Yahoo Fantasy Baseball.

Browser-control instructions live in `references/browser-control.md`. Keep this file focused on
Yahoo add/drop rules and transaction state.

Read `references/tool-notes.md` before using this tool.
Read `references/browser-control.md` before opening or controlling a browser.

## Shared Scope

Use this tool for:
- adding a specific free agent when the roster has an empty spot
- adding a specific free agent and dropping one user-approved rostered player when the roster is full
- verifying the saved roster through `get_roster` after Yahoo reports success

Do not use this tool for:
- waiver claims or players whose Yahoo roster status is not `FA`
- choosing a drop candidate without explicit user approval
- the legacy Yahoo write API
- lineup slot changes; use `adjust-lineup` instead

## Inputs

```text
teamKey:        required when the active Yahoo team is ambiguous
addPlayerName:  required
dropPlayerName: required only when the roster is full or the user explicitly requests an add/drop
```

Derive Yahoo's numeric URL segments from the selected `teamKey` and `player_key` at runtime. Never
hardcode a personal league, team, or player example from a previous run.

## Preconditions

Before opening Yahoo:
1. Resolve the exact team from the configured team, an explicit `teamKey`, or team-discovery tools.
2. Call `search_players` for `addPlayerName` with `status=FA`. Stop if the exact player is absent,
   on waivers, or already rostered.
3. Call `get_roster` for the target team. If `dropPlayerName` is supplied, confirm that exact player
   is present.
4. Confirm the user has explicitly authorized the add and, when required, the exact player to drop.
   Never infer approval for a different drop candidate.

The final numeric segment of a Yahoo player key is the `player_id` Yahoo expects in the browser
page's `apid` parameter. For example, extract `<player_id>` from
`<game_id>.p.<player_id>`, then verify the browser page shows the same player name before any
transaction click.

## Predictable Yahoo URLs

Use these URL shapes after deriving the numeric segments:

```text
Search by name:
https://baseball.fantasysports.yahoo.com/b1/<league_id>/playersearch?search=<encoded_player_name>

League-level add entry:
https://baseball.fantasysports.yahoo.com/b1/<league_id>/addplayer?apid=<player_id>

Team-specific add page (preferred when the team and player keys are known):
https://baseball.fantasysports.yahoo.com/b1/<league_id>/<team_id>/addplayer?apid=<player_id>

Standalone drop page:
https://baseball.fantasysports.yahoo.com/b1/<league_id>/<team_id>/dropplayer
```

The league-level add entry may redirect to `/selectmanager` when the account owns multiple teams.
That selector is a `GET` form with `mid=<team_id>` and an encoded `done` URL. Prefer the clean
team-specific add page when the relevant keys are already known; otherwise use the selector and
verify the team name before continuing.

Do not construct or replay transaction submission URLs. Both the no-drop and add/drop actions use a
Yahoo `POST` form with a short-lived crumb. Navigate directly only to read/selection pages, then use
the live page's exact submit control.

## Add/Drop Workflow

### Phase 1 - Open and verify the add page

1. Prefer the team-specific add URL when the selected `teamKey` and add `player_key` are known.
2. Otherwise open the search URL, locate the exact player row, and verify:
   - the displayed name matches `addPlayerName`
   - roster status is `FA`
   - the add link is `/b1/<league_id>/addplayer?apid=<player_id>`
3. Click the unique add link. If Yahoo shows `Select Team`, select the exact approved team and submit
   that selector.
4. On the add page, verify the heading and `Player to Add` row both name `addPlayerName`.
5. Stop on any name, team, availability, or page-state mismatch.

### Phase 2A - Add with an empty roster spot

Yahoo may show both of these signals:
- `You currently have <n> empty spot(s) on your roster and are not required to drop a player.`
- a submit control named `Add <addPlayerName>, don't drop anyone`

When the user authorized an add and no drop is required:
1. Confirm the no-drop submit control resolves exactly once.
2. Treat that control as the final transaction submission. Yahoo may not show another confirmation
   page.
3. Click it once only when the user already authorized the add.
4. Continue to Phase 3.

Do not select a drop player merely because the page lists optional drop rows when an empty roster
spot exists.

### Phase 2B - Add and drop when the roster is full

When Yahoo shows `Select a player to drop` and no no-drop action:
1. Require `dropPlayerName`. If it is missing, stop and ask the user which player to drop.
2. Locate the exact roster row containing `dropPlayerName`; require exactly one row.
3. Verify the row's Yahoo player link matches the expected drop player id when one is available.
4. Within that row, locate the unique `−` button and click it once.
5. Wait for the exact final submit control:
   `Add <addPlayerName>, Drop <dropPlayerName>`
6. Treat the exact visible submit label as the authoritative staged pair. Do not rely on the hidden
   `dpid` checkbox remaining checked after Yahoo rerenders the row.
7. If the label names either player incorrectly, is absent, or appears more than once, stop without
   submitting.
8. Treat this control as the final transaction submission. Click it once only when the user already
   authorized that exact pair.
9. Continue to Phase 3.

### Phase 3 - Verify the saved transaction

After the final submit click:
1. Wait for Yahoo to navigate.
2. Require the success banner to say either:
   - `You have successfully added <addPlayerName>`
   - `You have successfully added <addPlayerName> and dropped <dropPlayerName>`
3. Call `get_roster` for the exact team and roster date.
4. Confirm the added player is present. For an add/drop, also confirm the dropped player is absent.
5. Report success only when the browser banner and `get_roster` agree.

On any Yahoo error, unexpected state, or ambiguous navigation, follow `Error Handling` in
`references/browser-control.md`. If Yahoo shows a waiver flow, an add-limit warning, or a different
transaction pair, do not resubmit; report the confirmed state instead.

## Reporting Rules

- Before submission, state the exact team, add player, drop player (or `none`), and whether the
  next control is final.
- Report unexpected Yahoo state before taking another action.
- After submission, report the success banner and the read-only roster verification.
- Never expose Yahoo crumbs, account email addresses, personal league keys, or team keys.
