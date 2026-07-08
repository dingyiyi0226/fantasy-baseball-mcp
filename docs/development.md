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

**Read:** `list_leagues`, `get_league`, `get_standings`, `get_teams`, `get_roster`, `get_roster_stats`, `get_team_stats_week`, `get_team_stats_season`, `get_matchups`, `get_team_matchups`, `get_player_stats`, `list_players`, `rank_players`, `search_players`, `get_league_scoring_categories`, `get_transactions`

Several tools come in a light/detailed pair. Prefer the lighter one unless
stats are needed: `get_standings` vs `get_teams` (+matchups), `get_roster` vs
`get_roster_stats` (+stats), `list_players` vs `rank_players` (+stats).

**Analysis** (public APIs; `list_probable_starters` adds optional Yahoo ownership): `analyze_player_stats`, `analyze_roster_stats` (accepts optional `playerKeys` array, max 10 per call), `list_probable_starters` (MLB probable starting pitchers for a date; `fantasyContext: true` labels each by ownership)

Yahoo's write-scoped fantasy API is deprecated, so this server does not expose
write tools as part of the supported workflow.

Daily lineup start/bench management is handled through the browser-based roster
review/start-bench skill flow. Add/drop decisions are recommendation-only; make
the approved transaction directly on Yahoo Fantasy.

Credentials resolve from saved config or from the `YF_CLIENT_ID` / `YF_CLIENT_SECRET` env vars.

## Distribution

The server reaches users through three channels, all built/published by GitHub Actions on a `v*` tag:

- **Claude Desktop** — the `.mcpb` bundle (`npm run pack:safe`) plus the roster-review skill ZIP (`npm run pack:skill`), both attached to the GitHub Release.
- **Codex desktop app** — a Codex plugin defined in-repo (`.codex-plugin/plugin.json`, `.mcp.json`, and `.agents/plugins/marketplace.json`) that bundles the same `skills/` folder and launches the server via `npx`. It's served straight from the repo, so there's no separate build artifact — users add the marketplace from the app UI.
- **npm** — `yahoo-fantasy-baseball-mcp`, which the Codex plugin's `.mcp.json` runs via `npx`.

Legacy Yahoo write-tool code remains in the repo for compatibility testing, but
it is not registered by default. To expose that path intentionally, start the
server with `ENABLE_YAHOO_WRITE_API=true`.
