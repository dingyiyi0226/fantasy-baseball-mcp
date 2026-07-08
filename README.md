# Yahoo Fantasy Baseball MCP Server

[![npm](https://img.shields.io/npm/v/yahoo-fantasy-baseball-mcp)](https://www.npmjs.com/package/yahoo-fantasy-baseball-mcp)

A **Yahoo Fantasy Baseball MCP server** for **Claude** and **Codex**.

For **Claude Desktop**, you can install the packaged `.mcpb` extension with no npm, terminal, or manual config. For **Codex** and other MCP clients, the same server runs over standard stdio configuration.

Let your AI assistant help manage your **Yahoo Fantasy Baseball** team: check your roster, scout free agents, review your matchup, and analyze players with Statcast and FanGraphs data. Everything runs on your own machine with your own Yahoo access.

> **Note:** Yahoo's write-scope Fantasy Sports API is deprecated ([yfpy#79](https://github.com/uberfastman/yfpy/issues/79)), so direct add/drop and lineup writes are not available through the API. We provide browser-based skills that use Chrome for lineup start/bench workflows, and add/drop support through that path is still under development.

## Table of contents

- [Install](#install)
- [Connect your Yahoo team](#connect-your-yahoo-team)
- [Install the roster review skill](#install-the-roster-review-skill)
- [Talk to your team](#talk-to-your-team)
- [Use with Claude Code, Codex & other MCP clients](#use-with-claude-code-codex--other-mcp-clients)
- [FAQ and troubleshooting](docs/troubleshooting.md)
- [Developer notes](docs/development.md)
- [License](#license)

---

## Install

> **Using OpenAI Codex instead of Claude?** Skip this section, follow [Use with OpenAI Codex](#use-with-openai-codex) to register the server, then continue with [Connect your Yahoo team](#connect-your-yahoo-team).

1. **Download** `yahoo-fantasy-baseball-vX.X.X.mcpb` from the **[Releases page](../../releases/latest)**.
2. **Open Claude Desktop**.
3. Go to **Settings → Extensions**.
4. **Drag the `.mcpb` file** into the Extensions window and click **Install**.

> Leave the **Client ID / Client Secret** boxes empty for now. You'll fill them in during setup.

## Connect your Yahoo team

You only need to do this once. In a chat, type `fantasy start` and follow the prompts.

### a) Create your free Yahoo app

Go to **[developer.yahoo.com/apps/create](https://developer.yahoo.com/apps/create/)** and fill in:

- **Application Name:** anything, for example `My Fantasy Helper`
- **Homepage URL:** `https://localhost:8488`
- **Redirect URI(s):** `https://localhost:8488/callback`
- **OAuth Client Type:** `Confidential Client`
- **API Permissions:** `Fantasy Sports -> Read`
- Click **Create App**

Yahoo then gives you a **Client ID** and **Client Secret**.

### b) Enter those values

Paste them into the chat, or in Claude Desktop enter them under **Settings → Extensions → Yahoo Fantasy Baseball**, then say `fantasy start` again.

### c) Authorize and finish

Open the authorization link and click **Agree**. If your browser warns about a self-signed certificate, click **Advanced** and continue to localhost. Once you see **Authorization complete!**, say `fantasy authorize`.

The assistant will find your leagues, set your default team, and finish setup.

> Stuck? Type `fantasy status` to see what is still missing.

---

## Install the roster review skill

Once the MCP server is installed and your Yahoo team is connected, you can add the **Fantasy Roster Review** skill for a more guided start/sit and roster review workflow.

For Claude Code, Codex, and similar CLI agents, install it with:

```bash
npx skills add dingyiyi0226/fantasy-baseball-mcp
```

Then restart your client and ask for `fantasy roster review`.

For Claude Desktop setup, see [docs/roster-review-skill.md](docs/roster-review-skill.md).

---

## Talk to your team

| Say this... | To do this |
| --- | --- |
| `fantasy show roster` | Show your current roster |
| `fantasy my matchup` | Summarize this week's matchup |
| `fantasy standings` | Show league standings |
| `fantasy who should I add` | Find strong free-agent options |
| `fantasy my stats this week` | Show your team's weekly totals |
| `fantasy recent moves` | List recent adds, drops, and trades |
| `who's pitching tomorrow` | List probable starting pitchers for a date; add "and who's a free agent" for ownership context |
| `analyze Shohei Ohtani` | Pull Statcast, xStats, FanGraphs WAR/wRC+, and recent splits |
| `analyze my roster` | Run the same analysis for every player on your roster |

You can also ask naturally, like *"Who on my bench should I start tonight?"* or *"Is there a better closer available?"*

### What `analyze` pulls

| Source | Stats |
| --- | --- |
| **MLB Stats API** | Season totals plus 14-day and 30-day splits |
| **Baseball Savant** | xBA, xSLG, xwOBA vs. actual, plus exit velocity, barrel rate, and hard-hit rate |
| **FanGraphs** | WAR, wRC+, FIP, xFIP, K%, BB%, SwStr%, and GB/FB% |

Analysis automatically targets your **league's scoring categories**. Results also include links to each player's pages on Baseball Savant, MLB.com, Baseball Reference, and FanGraphs. Leaderboard data is cached for one hour.

---

## Use with Claude Code, Codex & other MCP clients

The one-click `.mcpb` bundle in [Install](#install) is for Claude Desktop only. Other MCP clients, including Claude Code and OpenAI Codex, run the same server over stdio. Register it once with the steps below, then connect your Yahoo team exactly as in [Connect your Yahoo team](#connect-your-yahoo-team) with `fantasy start`.

### Use with Claude Code or any MCP client

```bash
claude mcp add yahoo-fantasy-baseball \
  -e YF_CLIENT_ID=your_id -e YF_CLIENT_SECRET=your_secret \
  -- node /absolute/path/to/dist/cli.js serve
```

If your client uses a JSON MCP config, use:

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

### Use with OpenAI Codex

Codex does not use Claude's `.mcpb` bundle format, but it runs the same server. No clone or build is needed when installing from npm: `npx` fetches the published package for you. After registering the server, restart Codex and run `fantasy start` to connect your Yahoo team.

> **Requires Node.js 18+** because it provides `npx`. Install it from [nodejs.org/download](https://nodejs.org/en/download), or on macOS run `brew install node`.

**Desktop app**: go to **Settings → MCP → Connect to a custom MCP**, choose **STDIO**, and fill in:

| Field | Value |
| --- | --- |
| **Name** | `yahoo-fantasy-baseball` |
| **Command to launch** | `npx` |
| **Arguments** | `-y`, `yahoo-fantasy-baseball-mcp@latest`, `serve` (one argument per entry) |
| **Environment variables** | `YF_CLIENT_ID` / `YF_CLIENT_SECRET` (optional; you can also authorize in chat) |
| **Working directory** | leave blank |

> **Command not found?** GUI apps do not always inherit your shell `PATH`. Run `which npx` in a terminal and paste that absolute path into **Command to launch**.

**CLI / IDE extension**: add this to `~/.codex/config.toml`. Run `/mcp` afterward to confirm the connection.

```toml
[mcp_servers.yahoo-fantasy-baseball]
command = "npx"
args = ["-y", "yahoo-fantasy-baseball-mcp@latest", "serve"]

[mcp_servers.yahoo-fantasy-baseball.env]
YF_CLIENT_ID = "your_id"
YF_CLIENT_SECRET = "your_secret"
```

> **Using a local checkout instead of npm?** Run `npm install && npm run build`, then use `node` as the command with `/absolute/path/to/dist/cli.js` and `serve` as the arguments.

A copy-paste version also lives in [`codex.config.example.toml`](codex.config.example.toml).

---

## Additional docs

- [Install the roster review skill](docs/roster-review-skill.md)
- [FAQ and troubleshooting](docs/troubleshooting.md)
- [Developer notes](docs/development.md)

## License

MIT
