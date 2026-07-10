# Fantasy Baseball Tool Notes

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
- Defaults to only `player_key`, `name`, `editorial_team_abbr`, `display_position`, `selected_position`, and `status`. Pass `full=true` for standard roster details, or `includeStats=true` for those six fields plus Yahoo stats.
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
- Returns only each league's `league_key` and `name`; call `get_league` for all league details.
- Known limitation: some Yahoo league-discovery calls may return only one team per league per season,
  even when the user owns multiple teams. If the user expects multiple teams, prefer the configured
  default team, explicit user-provided team keys, or the teams surfaced by `fantasy_status`.
- Never publish or hardcode a user's personal league key, team key, or team name in this skill.

### `list_teams` / `get_team`
- `list_teams` is the lightweight league-wide discovery tool; it returns only team keys and names.
- `get_team` returns one team's metadata, season stats, points, and standings—but never roster or
  matchups. Use the more focused stats or matchup tools when those are the only data needed.
- `get_league` is the league-wide standings tool. It returns league settings, teams, and the
  standings table together; do not look for or call a separate standings tool.

### `get_league_scoreboard` / `get_team_matchup_history`
- Use `get_league_scoreboard` for every pairing in one scoring week; it deliberately omits team
  matchup stats. Use `get_team_matchup_history` for one team's detailed weekly matchup stats.

### `add_drop_player`
- Legacy-only Yahoo API path retained for future compatibility testing; do not use it in
  normal roster-review flows.
- Add/drop recommendations should stay manual even when the user approves the move.
- Never auto-drop on the final matchup day without a clearly stated win reason.

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
