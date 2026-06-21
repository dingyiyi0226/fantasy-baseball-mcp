# Fantasy Baseball for Claude

A **Claude Desktop Extension** — drag the `.mcpb` file into Claude and you're done. No npm, no terminal, no config files.

Let **Claude** look after your **Yahoo Fantasy Baseball** team: check your roster, scout free agents, review your matchup, and more. Everything runs on your own computer with your own Yahoo access.

> **Note:** Adding/dropping players and setting lineups are not supported — Yahoo has deprecated the write-scope Fantasy Sports API ([yfpy#79](https://github.com/uberfastman/yfpy/issues/79)).

---

## Part 1 · Install

1. **Download** `yahoo-fantasy-baseball-vX.X.X.mcpb` from the **[Releases page](../../releases/latest)**.
2. **Open Claude Desktop** — get it at [claude.ai/download](https://claude.ai/download) if needed.
3. Go to **Settings → Extensions**.
4. **Drag the `.mcpb` file** into the Extensions window and click **Install**.

> Leave the **Client ID / Client Secret** boxes empty for now — you'll fill them in during setup.

## Part 2 · Connect your Yahoo team

You only do this once. In a chat with Claude, type `fantasy start` and follow the prompts.

### a) Create your free Yahoo app

Go to **[developer.yahoo.com/apps/create](https://developer.yahoo.com/apps/create/)** and fill in:

- **Application Name:** anything (e.g. "My Fantasy Helper")
- **Homepage URL:** `https://localhost:8488`
- **Redirect URI(s):** `https://localhost:8488/callback`
- **OAuth Client Type:** Confidential Client
- **API Permissions:** Fantasy Sports → Read
- Click **Create App**

Yahoo gives you a **Client ID** and **Client Secret**.

### b) Give those values to Claude

Paste them into the chat, or enter them in **Settings → Extensions → Yahoo Fantasy Baseball**, then say `fantasy start` again.

### c) Authorize and finish

Click the link Claude gives you, then click **Agree**. If your browser warns about a self-signed certificate, click **Advanced → Proceed to localhost**. Once you see **"Authorization complete!"**, say `fantasy authorize`. Claude will find your leagues, set your team as default, and you're ready. 🎉

> Stuck? Type `fantasy status` and Claude will tell you what's left.

---

## Part 3 · Talk to your team

| Say this… | …and Claude will |
| --- | --- |
| `fantasy show roster` | Show your current roster |
| `fantasy my matchup` | Summarize this week's matchup |
| `fantasy standings` | Show league standings |
| `fantasy who should I add` | Find the best free agents |
| `fantasy my stats this week` | Show your team's weekly totals |
| `fantasy recent moves` | List recent adds, drops, and trades |
| `analyze Shohei Ohtani` | Pull Statcast, xStats, FanGraphs WAR/wRC+, and recent splits |
| `analyze my roster` | Run the above for every player on your roster |

You can also ask naturally: *"Who on my bench should I start tonight?"* or *"Is there a better closer available?"*

### What "analyze" pulls

| Source | Stats |
| --- | --- |
| **MLB Stats API** | Season totals + 14-day & 30-day splits |
| **Baseball Savant** | xBA, xSLG, xwOBA vs. actual; exit velocity, barrel %, hard-hit % |
| **FanGraphs** | WAR, wRC+/FIP/xFIP, K%, BB%, SwStr%, GB/FB% |

Analysis automatically targets your **league's scoring categories**. Results include links to each player's page on Baseball Savant, MLB.com, Baseball Reference, and FanGraphs. Leaderboard data is cached for one hour.

---

## FAQ

**Is my data safe?** Your Yahoo keys are stored only on your computer (`~/.yahoo-fantasy-mcp/config.json`) and in your OS keychain. Nothing is sent anywhere but Yahoo's API.

**Why do I need my own Yahoo app?** Yahoo requires each person to use their own keys — no shared secrets.

**Rate limit errors?** Yahoo limits heavy use. Wait an hour and try again.

**Does this cost anything?** No. Both the Yahoo app and this extension are free.

**`analyze` commands fail with a connection error?** Claude may need explicit permission to reach the stats APIs. Go to **Settings → Capabilities** (Team/Enterprise: **Organization settings → Capabilities**) and add these under **Additional allowed domains**:

| Domain | Used for |
| --- | --- |
| `statsapi.mlb.com` | MLB Stats API |
| `baseballsavant.mlb.com` | Statcast / expected stats |
| `www.fangraphs.com` | FanGraphs WAR/wRC+ |

---

## For developers

Local MCP server (Node.js + TypeScript, stdio transport) for the Yahoo Fantasy Sports v2 API.

```bash
npm install
npm run build          # compile TypeScript → dist/
node dist/cli.js auth  # optional terminal auth
node dist/cli.js serve # run MCP server over stdio
npm run pack           # build .mcpb bundle
```

### Use with Claude Code or any MCP client

```bash
claude mcp add yahoo-fantasy-baseball \
  -e YF_CLIENT_ID=your_id -e YF_CLIENT_SECRET=your_secret \
  -- node /absolute/path/to/dist/cli.js serve
```

Or add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "yahoo-fantasy-baseball": {
      "command": "node",
      "args": ["/absolute/path/to/dist/cli.js", "serve"],
      "env": { "YF_CLIENT_ID": "your_id", "YF_CLIENT_SECRET": "your_secret" }
    }
  }
}
```

### Tools

**Onboarding:** `fantasy_status`, `fantasy_login`, `fantasy_authorize`, `fantasy_logout`, `fantasy_select_team`

**Read:** `list_leagues`, `get_league`, `get_standings`, `get_teams`, `get_roster`, `get_roster_stats`, `get_team_stats_week`, `get_team_stats_season`, `get_matchups`, `get_team_matchups`, `get_player_stats`, `list_players`, `rank_players`, `search_players`, `get_league_scoring_categories`, `get_transactions`

Several tools come in a light/detailed pair — prefer the lighter one unless stats are needed: `get_standings` vs `get_teams` (+matchups), `get_roster` vs `get_roster_stats` (+stats), `list_players` vs `rank_players` (+stats).

**Analysis** (no Yahoo auth — public APIs): `analyze_player_stats`, `analyze_roster_stats` (accepts optional `playerKeys` array, max 10 per call)

**Write** (deprecated by Yahoo — require `force: true`): `add_drop_player`, `set_lineup`

Credentials resolve from the saved config or `YF_CLIENT_ID` / `YF_CLIENT_SECRET` env vars. Releases are published automatically by GitHub Actions on a `v*` tag.

## License

MIT
