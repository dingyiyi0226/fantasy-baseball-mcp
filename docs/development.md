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

**Read:** `list_games`, `get_game`, `list_leagues`, `get_league`, `list_teams`, `get_team`, `get_roster`, `get_team_stats`, `get_league_scoreboard`, `get_team_matchup_history`, `get_player_stats`, `list_players`, `rank_players`, `rank_game_players`, `search_players`, `get_league_scoring_categories`, `get_transactions`

Several tools come in a light/detailed pair. Prefer the lighter one unless
stats are needed: `list_teams` (keys/names only) vs `get_team` (one team's metadata + season
stats) vs `get_league` (league settings, teams, and standings),
`get_league_scoreboard` (one week, every pairing) vs `get_team_matchup_history` (one team,
detailed weekly stats), `get_roster`
with compact `player_key`, `name`, `editorial_team_abbr`, `display_position`,
`selected_position`, and `status`; `full=true` adds detailed profile, injury,
eligibility, and lineup fields (including `is_starting`); `includeStats=true`
adds `player_stats` to the compact fields; and `list_players` vs
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
