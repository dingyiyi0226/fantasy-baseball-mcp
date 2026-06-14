# Yahoo Fantasy Baseball MCP

A **bring-your-own-credentials**, run-it-yourself [MCP](https://modelcontextprotocol.io)
server that lets Claude read and manage your **Yahoo Fantasy Baseball** team through
Yahoo's official OAuth 2.0 Fantasy Sports API.

- **Nothing is hosted.** You run the server locally on your own machine.
- **No secrets are shared.** You register your own Yahoo app and supply your own
  credentials. They live only in `~/.yahoo-fantasy-mcp/config.json` (locked to `0600`).
- Once connected, you can ask Claude to analyze your roster and matchups, scout free
  agents, and — with your confirmation — **add/drop players** and **set your lineup**.

> ⚠️ The add/drop and set-lineup tools change your **real** Yahoo roster. They are
> marked *destructive*, so MCP clients prompt you to confirm before each write.

---

## 1. Prerequisites

- **Node.js 18+**
- A Yahoo account with at least one Fantasy Baseball league.

## 2. Register a Yahoo app

1. Go to the **[Yahoo Developer App dashboard](https://developer.yahoo.com/apps/)** and
   click **Create an App**.
2. Fill in:
   - **Application Name**: anything, e.g. `My Fantasy MCP`.
   - **Application Type**: **Installed Application** (this enables the out-of-band flow).
   - **Redirect URI(s)**: set to `oob` (out-of-band). *Required.*
   - **API Permissions**: enable **Fantasy Sports** and select **Read/Write**
     (read-only is not enough for add/drop and lineup changes).
3. Create the app. Yahoo gives you a **Client ID (Consumer Key)** and
   **Client Secret (Consumer Secret)** — you'll paste these in the next step.

## 3. One-time authorization

Run the interactive `auth` command. It prints a URL, you authorize in your browser,
and paste back the code Yahoo shows you:

```bash
npx yahoo-fantasy-baseball-mcp auth
```

You can also pass credentials up front (or via the `YF_CLIENT_ID` / `YF_CLIENT_SECRET`
environment variables) to skip the prompts:

```bash
npx yahoo-fantasy-baseball-mcp auth --client-id <KEY> --client-secret <SECRET>
```

The command will:

1. Print the Yahoo authorization URL — open it, sign in, and **Allow** access.
2. Ask you to paste the verification code Yahoo displays.
3. Exchange it for tokens, then list your baseball leagues and the team you own in each.
4. Let you pick a **default league** and **team**, saved to
   `~/.yahoo-fantasy-mcp/config.json`.

After this, most tools work with no arguments — they fall back to your configured
defaults, so "manage my team" just works.

## 4. Connect it to Claude

The server speaks MCP over **stdio**. Add it to your client's `mcpServers` config.

### Claude Desktop

Edit `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "yahoo-fantasy-baseball": {
      "command": "npx",
      "args": ["-y", "yahoo-fantasy-baseball-mcp", "serve"]
    }
  }
}
```

Restart Claude Desktop. The Yahoo Fantasy tools will appear in the tools menu.

### Claude Code

```bash
claude mcp add yahoo-fantasy-baseball -- npx -y yahoo-fantasy-baseball-mcp serve
```

### Running from a local build

If you cloned this repo instead of using the published package, build it and point the
client at the compiled entry:

```bash
npm install && npm run build
```

```json
{
  "mcpServers": {
    "yahoo-fantasy-baseball": {
      "command": "node",
      "args": ["/absolute/path/to/fantasy-baseball-mcp/dist/cli.js", "serve"]
    }
  }
}
```

---

## Tools

All read tools accept optional `leagueKey` / `teamKey` and fall back to your configured
defaults. Key formats: league `{game_id}.l.{league_id}` (e.g. `431.l.12345`), team
`{league_key}.t.{n}`, player `{game_id}.p.{player_id}`.

### Read

| Tool | What it does |
| --- | --- |
| `list_leagues` | All leagues, game weeks, and stat categories for your account |
| `get_league` | A league's teams, settings, and standings |
| `get_teams` | Stats, standings, and matchups for every (or specific) team |
| `get_team_roster` | A team's roster with player stats for a date |
| `get_team_stats_week` | A team's stats for a scoring week |
| `get_team_stats_season` | A team's season stats |
| `get_matchups` | League scoreboard (optionally for a given week) |
| `get_team_matchups` | One team's matchups, all weeks or a subset |
| `get_player_stats` | Stats for one or more players on a date |
| `rank_players` | Rank/search players (incl. free agents) by AR/OR/PTS or a stat id |
| `get_transactions` | Recent league transactions (adds, drops, trades) |

### Write (destructive — Claude will ask you to confirm)

| Tool | What it does |
| --- | --- |
| `add_drop_player` | Add a free agent, drop a player, or both at once |
| `set_lineup` | Set daily roster positions (`1B`, `OF`, `SP`, `Util`, `BN`, …) |

*Trade proposals/accepts are not yet implemented (planned for a future version).*

## Automating it on a schedule

Because everything runs through Claude, you can have Claude do this on a cadence — for
example, ask **Claude Desktop** to run a scheduled task each morning that checks your
roster for injured/benched starters and proposes lineup changes, or use **Claude Code**'s
scheduling. The MCP server itself is stateless; it just exposes the tools.

## Security & limits

- Your Yahoo credentials and refresh token are stored only in
  `~/.yahoo-fantasy-mcp/config.json` (`chmod 600`). Nothing is uploaded anywhere.
- Tokens are **never logged**. The short-lived (~1h) access token is kept in memory and
  refreshed automatically; a rotated refresh token is saved transparently.
- Yahoo rate-limits aggressive use. If you hit it you'll see an
  *"HTTP 999 — wait ~1 hour"* error; pause and try again later.

## Development

```bash
npm install
npm run build      # compile TypeScript to dist/
npm run watch      # recompile on change
node dist/cli.js auth
node dist/cli.js serve
```

## License

MIT
