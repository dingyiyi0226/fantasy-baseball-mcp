# Developer notes

Local MCP server for the Yahoo Fantasy Sports v2 API. Built with Node.js and TypeScript, using stdio transport.

```bash
npm install
npm run build          # compile TypeScript -> dist/
node dist/cli.js auth  # optional terminal auth
node dist/cli.js serve # run MCP server over stdio
npm run pack           # build .mcpb bundle
```

## Tools

**Onboarding:** `fantasy_status`, `fantasy_login`, `fantasy_authorize`, `fantasy_logout`, `fantasy_select_team`

**Read:** `list_games`, `get_game`, `list_leagues`, `get_league`, `get_league_metadata`, `list_teams`, `get_team`, `get_roster`, `get_roster_stats`, `get_team_stats`, `get_league_scoreboard`, `get_team_matchup_history`, `get_player_stats`, `list_players`, `rank_players`, `rank_free_agent_batters`, `rank_game_players`, `search_players`, `get_league_scoring_categories`, `get_transactions`

### Compact response tables

Yahoo represents repeated records as `{ "columns": [...], "rows": [...] }`: a column name at
index `n` describes the value at index `n` in every row. This applies to player lists, stat values,
league/game stat categories, matchup stat winners, and league roster positions.

In player tables, `player_stats` and `player_advanced_stats` retain only their coverage metadata.
Their stat tables are sibling columns such as `player_stats.stats.columns` and
`player_stats.stats.rows`. `get_roster` with `keyOnly=true` is the sole exception: it returns a
plain player-key array.

### Yahoo key anatomy

Yahoo response keys are the canonical identifiers. A key embeds the numeric ID segments Yahoo uses
in browser URLs, so responses do not also return a redundant separate ID field. The sanitized
examples below use `123` as the game ID and `12345` as the league ID:

| Response field | Format | Example |
| --- | --- | --- |
| `game_key` | `<game_id>` | `123` |
| `league_key` | `<game_id>.l.<league_id>` | `123.l.12345` |
| `team_key` | `<game_id>.l.<league_id>.t.<team_id>` | `123.l.12345.t.2` |
| `player_key` | `<game_id>.p.<player_id>` | `123.p.11732` |
| `transaction_key` | `<game_id>.l.<league_id>.tr.<transaction_id>` | `123.l.12345.tr.249` |

`owner_team_key`, `winner_team_key`, `source_team_key`, and `destination_team_key` use the same
team-key format. Camel-case fields such as `leagueKey`, `teamKey`, and `playerKeys` use the same
formats. `stat_id` and `manager_id` are separate Yahoo attributes, not alternative forms of those
keys.

Several tools come in a light/detailed pair. Prefer the lighter one unless
stats are needed: `list_teams` (keys/names only; do not also call `get_league`) vs `get_team`
(one team's metadata + season stats) vs `get_league` (league settings, standings, and team
keys/names), `get_league_metadata` (current week and season dates only),
`get_league_scoreboard` (one week, every pairing) vs `get_team_matchup_history` (one team,
detailed weekly stats), `get_roster`
with compact `player_key`, `name`, `editorial_team_abbr`, `display_position`,
`selected_position`, `status`, and `is_starting` (or `keyOnly=true` for just
the player-key array); `get_roster_stats` for the detailed player profile,
injury, eligibility, lineup, and `player_stats` fields; and `list_players` vs
`rank_players` (+stats). Use `rank_free_agent_batters` when the result must contain only
available hitters and the returned stats must match Yahoo's `lastweek` or `lastmonth` window.

**Analysis** (public APIs; `list_probable_starters` adds optional Yahoo ownership): `analyze_player_stats`, `analyze_roster_stats` (accepts optional `playerKeys` array, max 10 per call; each player's `mlbStats.columns` aligns the `mlbStats.standard` and optional recent arrays), `list_probable_starters` (MLB probable starting pitchers for a date in a compact `starters.columns` / `starters.rows` table; `fantasyContext: true` adds `fantasyStatus` and, for another manager's pitcher, `ownerTeamName`)

Yahoo's write-scoped fantasy API is deprecated, so this server does not expose
write tools as part of the supported workflow.

Daily lineup adjustments are handled through the browser-based `adjust-lineup`
Fantasy Baseball skill flow. Add/drop recommendations remain non-executing by default. An explicitly
approved exact transaction can use the browser-based `add-drop-player` skill flow in Codex or
Claude.

Credentials resolve from saved config or from the `YF_CLIENT_ID` / `YF_CLIENT_SECRET` env vars.

## Distribution

### Package metadata

`package.json` is the source for the short description, and the README intro (between the npm
badge and `## Contents`) is the source for the long description. Run `npm run metadata:sync` after
editing either source; `npm run metadata:check` verifies the Claude and Codex manifests are aligned.

The server reaches users through three channels, all built/published by GitHub Actions on a `v*` tag:

- **Claude Desktop** — the `.mcpb` bundle (`npm run pack:safe`) plus the Fantasy Baseball skill ZIP (`npm run pack:skill`), both attached to the GitHub Release.
- **Codex desktop app** — a Codex plugin defined in-repo (`.codex-plugin/plugin.json`, `.mcp.json`, and `.agents/plugins/marketplace.json`) that bundles the same `skills/` folder and launches the server via `npx`. It's served straight from the repo, so there's no separate build artifact — users add the marketplace from the app UI.
- **npm** — `fantasy-baseball-mcp`, which the Codex plugin's `.mcp.json` runs via `npx`.

Legacy Yahoo write-tool code remains in the repo for compatibility testing, but
it is not registered by default. To expose that path intentionally, start the
server with `ENABLE_YAHOO_WRITE_API=true`.
