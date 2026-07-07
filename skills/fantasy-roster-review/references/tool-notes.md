# Yahoo Fantasy Baseball Tool Notes

## Tool Constraints & Known Behaviors

### `analyze_roster_stats`
- **Always pass `playerKeys`** — never call on a full roster without it; the raw full-roster call returns a payload too large to process.
- **Batch size ≤ 10** — the tool enforces `.max(10)` on `playerKeys`. A 28-player roster = 3 batches (≤10 each).
- **No `compact` flag** — the size fix is the ≤10-key batching. Each returned player is the full (trimmed) object.
- **Workflow**: call `get_roster` first to get all player keys, split them into batches of
  up to 10, call `analyze_roster_stats` once per batch, then extract only the compact summary
  fields.
- **Missing `recent14d`/`recent30d`**: treat as "no recent data". Do not label the player hot or cold from a missing key. The conditional spread means players with no recent data simply won't have these keys.

### `rank_players`
- Use `sortType=lastmonth` and `lastweek` for recency.
- Returns up to 25 players per call; page with `start`.
- The schema does **not** accept an `ownership_type` filter. Filter returned players locally where
  `ownership.ownership_type` indicates a free agent.

### `get_roster`
- Accepts `date` parameter in `YYYY-MM-DD` format.
- Slot field tells you the position assignment (SP, RP, C, 1B, 2B, 3B, SS, OF, Util, BN, IL, NA).
- Injury status flags are separate from the slot.

### `list_probable_starters`
- Use `date=lineupDate` and `fantasyContext=true` during roster reviews so each probable SP is
  labeled `yourTeam`, `otherTeam`, `freeAgent`, `waivers`, or `unknown`.
- Use this as the first source for "is this SP actually probable to start?" and for free-agent
  streamer discovery. Filter locally for `fantasyStatus` of `freeAgent` or `waivers`, then use
  `analyze_player_stats` / matchup context before recommending an add.
- MLB usually posts probables only for today through roughly 2-3 days out. A low or zero count
  for a later date means probables may not be announced yet.

### `list_leagues` / team discovery
- Known limitation: some Yahoo league-discovery calls may return only one team per league per season,
  even when the user owns multiple teams. If the user expects multiple teams, prefer the configured
  default team, explicit user-provided team keys, or the teams surfaced by `fantasy_status`.
- Never publish or hardcode a user's personal league key, team key, or team name in this skill.

### `get_teams`
- May fail with response size errors on large leagues. Prefer direct team roster/matchup calls once
  a team key is known.

### `add_drop_player`
- Destructive — only call when `autoExecute=true` AND the user has explicitly requested roster changes.
- Yahoo write actions are unsupported by default in this MCP server. `add_drop_player` and
  `set_lineup` require `force=true`; without it they return instructions to make the change
  manually on Yahoo Fantasy.
- Never auto-drop on the final matchup day without a clearly stated win reason.

### Browser roster start/bench management
- Keep the Yahoo roster semantics shared across execution surfaces; only the automation mechanics should vary by section.
- Team page URL pattern is `https://baseball.fantasysports.yahoo.com/b1/<league_id>/<team_id>` after discovering `league_id` and `team_id` from Yahoo tools.
- In Yahoo's roster table, start a swap by clicking a player's position pill. The selected source pill becomes highlighted, and legal destination pills turn green.
- Complete the move by clicking one green destination pill. A successful save shows `Saving...` followed by `All changes saved` and often a green success toast.
- If Yahoo rejects a move or the page gets visually out of sync, refresh before trusting the visible roster state.
- IL activation can fail when the active/bench roster is full. Free a legal roster slot first, then retry after refresh.
- `SP` bench pitchers can swap into `SP` and `P`, but not `RP`.
- `RP` bench pitchers can swap into `RP` and `P`, but not `SP`.
- Multi-eligible hitters can light multiple infield or outfield pills plus `Util`.

#### Codex
- This path is **Codex Chrome only**; do not write instructions that assume the in-app browser or a different browser automation surface.
- For Codex monitoring, do not report success from a stale pre-refresh visual state after an error.

## League Info

Discover league-specific details from `fantasy_status`, `get_league`, and league scoring/category
tools at runtime. Do not assume a fixed league key, team list, scoring format, weekly add cap, or
waiver behavior.

Common head-to-head category leagues may include pitching categories such as IP, W, SV, ERA, WHIP,
K/BB, QS, and BSV, but always use the current league's actual categories when writing strategy.

## Compact Stat Summary Fields

Extract **only** these fields from `analyze_roster_stats` results:

**Batters**: wRC+, OBP, HR, SB, TB, barrel%, xwOBA–wOBA gap, `recent14d` (if present), `recent30d` (if present)

**Pitchers**: ERA, xERA, WHIP, K/BB, K%, BB%, QS, `recent14d` (if present), `recent30d` (if present)

Discard all other fields from the raw per-player objects.
