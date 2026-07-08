# Yahoo Fantasy Baseball for Claude & Codex

[![npm](https://img.shields.io/npm/v/yahoo-fantasy-baseball-mcp)](https://www.npmjs.com/package/yahoo-fantasy-baseball-mcp)

Manage your **Yahoo Fantasy Baseball** team by chatting with your AI assistant: check your
roster, scout free agents, review your matchup, and analyze players with Statcast and
FanGraphs data. Works in **Claude Desktop** and the **Codex desktop app**. Everything runs
locally with your own Yahoo login — nothing is hosted, and your credentials stay on your
machine.

> **Note:** Yahoo's write-scope Fantasy API is deprecated, so the assistant reads and advises
> but can't change your lineup automatically. Lineup start/bench moves are driven through your
> browser; you make add/drop moves yourself on Yahoo.

## Contents

- [Install](#install)
  - [Claude Desktop](#claude-desktop)
  - [Codex desktop app](#codex-desktop-app)
- [Connect your Yahoo team](#connect-your-yahoo-team)
- [Talk to your team](#talk-to-your-team)
- [What "analyze" looks up](#what-analyze-looks-up)
- [Help](#help)
- [License](#license)

---

## Install

Pick the app you use — you only need one. Then continue to
[Connect your Yahoo team](#connect-your-yahoo-team).

### Claude Desktop

**1. Add the extension**

1. Download `yahoo-fantasy-baseball-vX.X.X.mcpb` from the **[Releases page](../../releases/latest)**.
2. In Claude Desktop, go to **Settings → Extensions**.
3. Drag the file into the Extensions window and click **Install**.

> Leave the **Client ID / Client Secret** boxes empty for now — you'll fill them in during
> [Connect your Yahoo team](#connect-your-yahoo-team).

**2. Add the roster review skill** (guided start/sit and roster-review workflow)

1. Download `fantasy-roster-review-skill.zip` from the **[Releases page](../../releases/latest)**.
2. Go to **Settings → Capabilities** and turn on **code execution**.
3. Go to **Customize → Skills**, click **+ → Create skill → Upload a skill**, and choose the ZIP.

### Codex desktop app

Requires **Node.js** ([nodejs.org/download](https://nodejs.org/en/download) — install the LTS
build). The plugin bundles the Yahoo tools *and* the roster review skill in one step.

1. In the Codex app, go to **Settings → Plugins → Add plugin marketplace**.
2. Add from a GitHub repo:
   - **Source:** `dingyiyi0226/fantasy-baseball-mcp`
   - **Git ref:** `master`
   - **Sparse paths:** *(leave blank)*
3. Open the **Yahoo Fantasy Baseball** marketplace and install the **Yahoo Fantasy Baseball** plugin.

---

## Connect your Yahoo team

You only do this once, and it's the same in both apps: type `fantasy start` in a chat and
follow the prompts.

### a) Create your free Yahoo app

Yahoo requires each person to use their own keys. Go to
**[developer.yahoo.com/apps/create](https://developer.yahoo.com/apps/create/)** and fill in:

- **Application Name:** anything, e.g. `My Fantasy Helper`
- **Homepage URL:** `https://localhost:8488`
- **Redirect URI(s):** `https://localhost:8488/callback`
- **OAuth Client Type:** `Confidential Client`
- **API Permissions:** `Fantasy Sports → Read`
- Click **Create App**

Yahoo then gives you a **Client ID** and a **Client Secret**.

### b) Enter those keys

Paste the **Client ID** and **Client Secret** into the chat when asked, then say `fantasy start`
again. (In Claude Desktop you can instead enter them under **Settings → Extensions → Yahoo
Fantasy Baseball**.)

### c) Authorize and finish

Open the authorization link and click **Agree**. If your browser warns about a self-signed
certificate, click **Advanced** and continue to localhost. Once you see **Authorization
complete!**, say `fantasy authorize`.

The assistant will find your leagues, set your default team, and finish setup.

> Stuck? Type `fantasy status` to see what's still missing.

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
| `who's pitching tomorrow` | List probable starting pitchers for a date (add "and who's a free agent" for ownership) |
| `analyze Shohei Ohtani` | Pull Statcast, xStats, FanGraphs WAR/wRC+, and recent splits |
| `analyze my roster` | Run the same analysis for every player on your roster |

You can also ask naturally, like *"Who on my bench should I start tonight?"*

## What "analyze" looks up

| Source | Stats |
| --- | --- |
| **MLB Stats API** | Season totals plus 14-day and 30-day splits |
| **Baseball Savant** | xBA, xSLG, xwOBA vs. actual, plus exit velocity, barrel rate, and hard-hit rate |
| **FanGraphs** | WAR, wRC+, FIP, xFIP, K%, BB%, SwStr%, and GB/FB% |

Analysis automatically targets your **league's scoring categories**, and results link to each
player's pages on Baseball Savant, MLB.com, Baseball Reference, and FanGraphs. Leaderboard
data is cached for one hour.

---

## Help

- **[FAQ and troubleshooting](docs/troubleshooting.md)** — data safety, rate limits, and letting `analyze` reach the stats sites.
- **[Developer notes](docs/development.md)** — building from source and the full tool list.

## License

MIT
