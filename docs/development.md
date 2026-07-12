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

**Read:** `list_games`, `get_game`, `list_leagues`, `get_league`, `get_league_metadata`, `list_teams`, `get_team`, `get_roster`, `get_roster_stats`, `get_team_stats`, `get_league_scoreboard`, `get_team_matchup_history`, `get_player_stats`, `list_players`, `rank_players`, `rank_game_players`, `search_players`, `get_league_scoring_categories`, `get_transactions`

Yahoo stat values use compact row tables: `stats.columns` defines the fields at each position in
the corresponding `stats.rows` arrays.
Yahoo player lists use the same `players.columns` / `players.rows` format; `get_roster` with
`keyOnly=true` remains a plain player-key array.

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
`rank_players` (+stats).

**Analysis** (public APIs; `list_probable_starters` adds optional Yahoo ownership): `analyze_player_stats`, `analyze_roster_stats` (accepts optional `playerKeys` array, max 10 per call), `list_probable_starters` (MLB probable starting pitchers for a date; `fantasyContext: true` adds `fantasyStatus` and, for another manager's pitcher, `ownerTeamName`)

Yahoo's write-scoped fantasy API is deprecated, so this server does not expose
write tools as part of the supported workflow.

Daily lineup adjustments are handled through the browser-based `adjust-lineup`
Fantasy Baseball skill flow. Add/drop recommendations remain non-executing by default. An explicitly
approved exact transaction can use the browser-based `add-drop-player` skill flow in Codex or
Claude.

Credentials resolve from saved config or from the `YF_CLIENT_ID` / `YF_CLIENT_SECRET` env vars.

## Distribution

The server reaches users through three channels, all built/published by GitHub Actions on a `v*` tag:

- **Claude Desktop** — the `.mcpb` bundle (`npm run pack:safe`) plus the Fantasy Baseball skill ZIP (`npm run pack:skill`), both attached to the GitHub Release.
- **Codex desktop app** — a Codex plugin defined in-repo (`.codex-plugin/plugin.json`, `.mcp.json`, and `.agents/plugins/marketplace.json`) that bundles the same `skills/` folder and launches the server via `npx`. It's served straight from the repo, so there's no separate build artifact — users add the marketplace from the app UI.
- **npm** — `fantasy-baseball-mcp`, which the Codex plugin's `.mcp.json` runs via `npx`.

Legacy Yahoo write-tool code remains in the repo for compatibility testing, but
it is not registered by default. To expose that path intentionally, start the
server with `ENABLE_YAHOO_WRITE_API=true`.
