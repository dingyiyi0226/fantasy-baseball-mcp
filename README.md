# Fantasy Baseball for Claude

Let **Claude** look after your **Yahoo Fantasy Baseball** team. Ask it to check your
roster, scout free agents, review your matchup, and — when you say so — add/drop players
or set your lineup.

Everything runs **on your own computer** with **your own** Yahoo access. Nothing is
uploaded to anyone, and you don't need to be technical to set it up.

> 💬 Once installed, just talk to Claude with **"fantasy …"** commands:
> **`fantasy start`** to set up, then **`fantasy show roster`**, **`fantasy my matchup`**,
> **`fantasy who should I add`**, and more.

**New in v0.2:** Claude can now pull advanced stats directly from Baseball Savant,
FanGraphs, and the MLB Stats API — Statcast exit velocity, barrel rate, expected stats
(xBA / xSLG / xwOBA), WAR, wRC+, sprint speed, and more — for any player or your entire
roster at once.

---

## Part 1 · Install the extension (about 2 minutes)

1. **Download the extension.** Go to the
   **[Releases page](../../releases/latest)** and download the file ending in
   **`.mcpb`** (it's named `yahoo-fantasy-baseball.mcpb`).
2. **Open Claude Desktop.** If you don't have it yet, get it from
   [claude.ai/download](https://claude.ai/download).
3. Go to **Settings → Extensions**.
4. **Drag the `.mcpb` file** into the Extensions window (or click **Install
   Extension** and pick the file).
5. Click **Install**. Done — Claude now has the fantasy tools.

> You can leave the **Client ID / Client Secret** boxes empty for now. We'll fill them in
> during the next part, and Claude will tell you exactly what to paste where.

## Part 2 · Connect your Yahoo team (about 3 minutes)

You only do this once. In a chat with Claude, type:

```
fantasy start
```

Claude will walk you through it. Here's what to expect:

### a) Create your free Yahoo "app"

This is just how Yahoo hands you a personal key. Claude will point you to
**[developer.yahoo.com/apps/create](https://developer.yahoo.com/apps/create/)**, where you:

- **Application Name:** anything (e.g. "My Fantasy Helper")
- **Homepage URL:** `http://localhost:8488` (placeholder)
- **Redirect URI(s):** `http://localhost:8488/callback`
- **API Permissions:** check **Fantasy Sports**, then pick **Read/Write**
- Click **Create App**

Yahoo shows you two values: a **Client ID** and a **Client Secret**.

### b) Give those two values to Claude

Either paste them into the chat (Claude will save them securely on your computer), or
enter them in **Settings → Extensions → Yahoo Fantasy Baseball**. Then say
`fantasy start` again.

### c) Authorize and finish

Claude gives you a link. Open it and click **Agree**. Yahoo will redirect your browser to
a local page — once you see **"Authorization complete!"**, go back to Claude and say
`fantasy authorize`. Claude will find your leagues, set your team as the default, and
you're ready. 🎉

> Stuck? Just type **`fantasy status`** and Claude will tell you what's left to do.

---

## Part 3 · Talk to your team

After setup, use plain language. A few examples:

| Say this… | …and Claude will |
| --- | --- |
| `fantasy show roster` | Show your current roster and how players are doing |
| `fantasy my matchup` | Summarize this week's head-to-head matchup |
| `fantasy standings` | Show the league standings |
| `fantasy who should I add` | Find the best available free agents |
| `fantasy my stats this week` | Show your team's weekly totals |
| `fantasy recent moves` | List recent adds, drops, and trades |
| `fantasy drop Smith and add Jones` | Propose the move and ask you to confirm |
| `fantasy bench Smith, start Jones today` | Propose lineup changes and confirm |
| `analyze Shohei Ohtani` | Pull Statcast, xStats, FanGraphs WAR/wRC+ for one player |
| `analyze my roster` | Run the above for every player on your roster at once |

You can also just ask naturally, e.g. *"Who on my bench should I start tonight?"* or
*"Is there a better closer available than the one I have?"* or
*"Which of my outfielders has the best hard-hit rate?"*

### What "analyze" pulls together

When you ask Claude to analyze a player it fetches live data from:

| Source | Stats |
| --- | --- |
| **MLB Stats API** | G, PA, HR, RBI, R, SB, BA, OBP, SLG, OPS, BABIP |
| **Baseball Savant — Expected Stats** | xBA, xSLG, xwOBA vs. actual (luck indicator) |
| **Baseball Savant — Statcast** | Avg / max exit velocity, EV50, hard-hit %, barrel %, launch angle |
| **Baseball Savant — Sprint Speed** | Sprint speed (ft/s), "bolts" count |
| **FanGraphs** | WAR, wRC+, K%, BB%, SwStr%, GB/FB/LD%, HR/FB |

Results also include direct links to each player's page on Baseball Savant, MLB.com,
Baseball Reference, and FanGraphs.

Leaderboard downloads are cached for one hour, so analyzing your full roster costs only
one network round-trip per source.

> ⚠️ **Roster changes always ask first.** Adding/dropping players and setting your lineup
> change your **real** Yahoo team, so Claude shows you exactly what it's about to do and
> waits for your **confirmation** before making the change.

### Want it to run on a schedule?

You can ask Claude Desktop to do this regularly — for example, *"every morning, check my
roster for injured or benched starters and suggest fixes."* Use Claude's built-in
scheduling/tasks; the extension just provides the fantasy tools.

---

## Frequently asked

**Is my data safe?** Yes. Your Yahoo keys and login are stored only on your computer
(in `~/.yahoo-fantasy-mcp/config.json`, readable only by you) and in your OS keychain.
Nothing is sent to any server but Yahoo's own API. Tokens are never logged.

**Why do I need my own Yahoo app?** Yahoo requires each person to use their own keys.
It keeps everything under your control and means no shared secrets.

**It says "rate limit" or "wait an hour."** Yahoo limits very heavy use. Take a break and
try again later.

**Does this cost anything?** No. The Yahoo app and this extension are free.

---

## For developers

This is a local **MCP server** (Node.js + TypeScript, stdio transport) for the Yahoo
Fantasy Sports v2 API.

```bash
npm install
npm run build          # compile TypeScript to dist/
node dist/cli.js auth  # optional terminal setup (instead of in-chat)
node dist/cli.js serve # run the MCP server over stdio
npm run pack           # build the .mcpb desktop-extension bundle
```

### Use it with Claude Code (or any MCP client) from source

```bash
claude mcp add yahoo-fantasy-baseball \
  -e YF_CLIENT_ID=your_id -e YF_CLIENT_SECRET=your_secret \
  -- node /absolute/path/to/dist/cli.js serve
```

Or add it to a Claude Desktop `claude_desktop_config.json` manually:

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

Onboarding: `fantasy_status`, `fantasy_setup`, `fantasy_authorize`, `fantasy_select_team`.

Read: `list_leagues`, `get_league`, `get_teams`, `get_team_roster`,
`get_team_stats_week`, `get_team_stats_season`, `get_matchups`, `get_team_matchups`,
`get_player_stats`, `rank_players`, `get_transactions`.

Analysis (no Yahoo auth needed — fetches from public APIs):
`analyze_player_stats`, `analyze_roster_stats`.

Write (destructive — clients prompt to confirm): `add_drop_player`, `set_lineup`.
*Trade proposals/accepts are planned for a future version.*

Credentials resolve from the saved config or the `YF_CLIENT_ID` / `YF_CLIENT_SECRET`
environment variables (the latter is how the desktop extension passes the settings-form
values). Releases are built and published automatically by GitHub Actions on a `v*` tag.

## License

MIT
