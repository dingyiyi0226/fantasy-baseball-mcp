# Fantasy Baseball Tool Notes

## Tool Constraints & Known Behaviors

### Compact Yahoo tables
- A table is `{ "columns": [...], "rows": [...] }`: the column at index `n` names the value at
  index `n` in every row. Read each row by matching values to columns at the same position.
- This format covers player lists, stat values, league/game `stat_categories`, matchup
  `stat_winners`, and league-settings `roster_positions`.
- In a player table, `player_stats` and `player_advanced_stats` contain only coverage metadata.
  Their stat values are sibling columns, for example `player_stats.stats.columns` and
  `player_stats.stats.rows`.
- `get_roster` with `keyOnly=true` is the exception: it returns a plain player-key array.

### `analyze_roster_stats`
- **Always pass `playerKeys`** — never call on a full roster without it; the raw full-roster call returns a payload too large to process.
- **Batch size ≤ 10** — the tool enforces `.max(10)` on `playerKeys`. A 28-player roster = 3 batches (≤10 each).
- **No `compact` flag** — the size fix is the ≤10-key batching. Each returned player is the full (trimmed) object.
- **Workflow**: reuse player keys from a roster response when it is already available. Otherwise,
  call `get_roster` with `keyOnly=true`, split the returned array into batches of up to 10, call
  `analyze_roster_stats` once per batch, then extract only the compact summary fields.
- **Missing `recent14d`/`recent30d`**: treat as "no recent data". Do not label the player hot or cold from a missing key. The conditional spread means players with no recent data simply won't have these keys.

### `rank_players`
- Use `sortType=lastmonth` and `lastweek` for recency.
- Returns up to 25 players per call; page with `start`.
- The compact ranking response omits `player_id` and `batting_order`; use `player_key`, name,
  eligibility, ownership, and stat rows for comparisons.
- The schema does **not** accept an `ownership_type` filter. Filter returned players locally where
  `ownership.ownership_type` indicates a free agent.

### `rank_free_agent_batters`
- Returns only league free-agent batters by applying Yahoo `status=FA` and `position=B`; do not
  filter owned players locally or use it for pitchers.
- Use `period=lastweek` for discovery. Use `lastmonth` only as a fallback or stability check.
- Unlike `rank_players`, its returned `player_stats.coverage_type` and stat rows match the requested
  recent period. Yahoo returns free-agent ownership as `ownership_type: "freeagents"`.
- Its compact response also omits `player_id` and `batting_order`.
- Yahoo has no 14-day ranking window. For the top candidates, call `analyze_player_stats` and use
  `recent14d` to verify playing time and category production before recommending an add.
- Use the current league's batting stat ids for category-specific `sort` values; do not hardcode a
  league's scoring categories.

### `get_roster`
- Accepts `date` parameter in `YYYY-MM-DD` format.
- Player rows default to `player_key`, `name`, `editorial_team_abbr`, `display_position`, `selected_position`, `status`, and `is_starting`. Use `keyOnly=true` to return only an array of player keys.
- Slot field tells you the position assignment (SP, RP, C, 1B, 2B, 3B, SS, OF, Util, BN, IL, NA).
- Injury status flags are separate from the slot.
- The rows show occupied `selected_position` assignments, not configured slot capacity. Empty IL/NA
  slots may be absent, so never infer total reserve capacity or that a reserve is full from the
  number of `IL`/`NA` rows returned.

### `get_roster_stats`
- Use only when Yahoo player stats or detailed player profile, injury, eligibility, or lineup fields are needed.
- Returns detailed player data including `player_id`, `editorial_team_abbr`, `position_type`, `eligible_positions`, `status_full`, `injury_note`, `on_disabled_list`, `is_undroppable`, `is_flex`, and `player_stats`; it also includes `selected_position`, `status`, and `is_starting` from the roster.

### `list_probable_starters`
- Returns starters as a compact row table: `starters.columns` names the values in each
  corresponding `starters.rows` array.
- For roster reviews, call once per date with `date=lineupDate, fantasyContext=false` and join the
  plain MLB board to the selected team and opponent rosters locally by normalized name and MLB team
  abbreviation. Reuse that board for every team in a multi-team review.
- Use `fantasyContext=true` only when ownership in the configured default league/team is explicitly
  needed. It makes one Yahoo ownership request per starter and cannot be scoped to a different team
  under review.
- Use this as the first source for "is this SP actually probable to start?" and for free-agent
  streamer discovery. Confirm availability from the active league's player ownership data, then use
  `analyze_player_stats` / matchup context before recommending an add.
- MLB usually posts probables only for today through roughly 2-3 days out. A low or zero count
  for a later date means probables may not be announced yet.

### `list_leagues` / team discovery
- Returns only each league's `league_key` and `name`; call `get_league` for all league details.
- Known limitation: some Yahoo league-discovery calls may return only one team per league per season,
  even when the user owns multiple teams. If the user expects multiple teams, prefer the configured
  default team, explicit user-provided team keys, or the teams surfaced by `fantasy_status`.
- Never publish or hardcode a user's personal league key, team key, or team name in this skill.

### `get_league_metadata` / `get_league`
- Use `get_league_metadata` when only the current week and league/season dates are needed, such as
  daily-review setup. It deliberately omits teams, settings, and standings.
- Use `get_league` only when the league settings, team list, or standings are needed.
- In daily review, keep `get_league_metadata` as the normal setup call. Call `get_league` lazily,
  at most once per league, only when an IL/NA-status player is assigned to an active or `BN` slot
  and configured reserve capacity is not already known. Read IL/NA counts from
  `settings.roster_positions`, then compare them with occupied `selected_position` assignments
  from `get_roster`.

### `list_teams` / `get_team`
- `list_teams` is the lightweight league-wide discovery tool; it returns only `team_key` and
  `name`. If those fields are enough, stop there—do not also call `get_league`.
- `get_team` returns one team's metadata, season stats, points, and standings—but never roster or
  matchups. Use the more focused stats or matchup tools when those are the only data needed.
- `get_league` is the league-wide settings and standings tool. It returns league settings,
  team keys/names, and the standings table together; do not use it solely to list teams.

### `get_league_scoreboard` / `get_team_matchup_history`
- Use `get_league_scoreboard` for every pairing in one scoring week; it deliberately omits team
  matchup stats. Use `get_team_matchup_history` for one team's detailed weekly matchup stats; it
  defaults to the current week, or accepts `weeks` for specified historical weeks.

### `add_drop_player`
- Legacy-only Yahoo API path retained for future compatibility testing; do not use it in
  normal roster-review flows.
- Keep add/drop recommendations non-executing by default. When the user explicitly approves an
  exact browser transaction, use the `add-drop-player` workflow instead of this legacy API tool.
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
