# Fantasy Baseball for Claude & Codex

[![npm](https://img.shields.io/npm/v/fantasy-baseball-mcp)](https://www.npmjs.com/package/fantasy-baseball-mcp)

Manage your **Yahoo Fantasy Baseball** team from Claude or Codex with built-in skills for
daily roster reviews, weekly post-mortems, automated lineup adjustments, and free-agent scouting.

Yahoo's Fantasy Sports API supplies league and team data, while the **MLB Stats API**,
**Baseball Savant Statcast**, and **FanGraphs** provide advanced player data and probable
starting pitchers for tomorrow or any requested date.

Automated browser-based workflows handle lineup adjustments and approved add/drop actions
(Claude in Chrome or the Codex browser plugin), because Yahoo's write-scope API is deprecated.

## Contents

- [Install](#install)
  - [Claude Desktop](#claude-desktop)
  - [Codex desktop app](#codex-desktop-app)
- [Connect your Yahoo team](#connect-your-yahoo-team)
- [Talk to your team](#talk-to-your-team)
- [What "analyze" looks up](#what-analyze-looks-up)
- [Good to know](#good-to-know)
- [License](#license)

---

## Install

Pick the app you use — you only need one. Then continue to
[Connect your Yahoo team](#connect-your-yahoo-team).

### Claude Desktop

**1. Add the extension**

1. Download `fantasy-baseball-vX.X.X.mcpb` from the **[Releases page](../../releases/latest)**.
2. In Claude Desktop, go to **Settings → Extensions**.
3. Drag the file into the Extensions window and click **Install**.

> Leave the **Client ID / Client Secret** boxes empty for now — you'll fill them in during
> [Connect your Yahoo team](#connect-your-yahoo-team).

**2. Add the Fantasy Baseball skill** (guided start/sit and roster-review workflow)

1. Download `fantasy-baseball-skill-vX.X.X.zip` from the **[Releases page](../../releases/latest)**.
2. Go to **Settings → Capabilities** and turn on **code execution**.
3. Go to **Customize → Skills**, click **+ → Create skill → Upload a skill**, and choose the ZIP.

### Codex desktop app

Requires **Node.js** ([nodejs.org/download](https://nodejs.org/en/download) — install the LTS
build). The plugin bundles the Yahoo tools *and* the Fantasy Baseball skill in one step.

1. In the Codex app, go to **Settings → Plugins → Add plugin marketplace**.
2. Add from a GitHub repo:
   - **Source:** `dingyiyi0226/fantasy-baseball-mcp`
   - **Git ref:** `master`
   - **Sparse paths:** *(leave blank)*
3. Open the **Fantasy Baseball** marketplace and install the **Fantasy Baseball** plugin.
4. Sign in to Yahoo in Codex's in-app browser (one time, for lineup and add/drop moves).

   The Yahoo authorization below lets the plugin read your roster. Browser-driven lineup and add/drop
   moves also need Yahoo Fantasy to be logged in inside Codex's in-app browser. In a Codex chat, ask:

   ```text
   Open https://baseball.fantasysports.yahoo.com in the in-app browser so I can sign in.
   ```

   When the in-app browser tab opens, sign in to Yahoo there. After that, `adjust-lineup` and
   `add-drop-player` workflows can use the same in-app browser session. If a workflow opens Yahoo and
   finds that the tab is not logged in, it will stop and report the login state as an error instead
   of trying another browser.

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
again. (In Claude Desktop you can instead enter them under **Settings → Extensions → Fantasy
Baseball**.)

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
| `fantasy hot free-agent batters` | Rank available hitters by recent Yahoo stats |
| `fantasy MLB leaders` | Rank all Yahoo baseball players by a stat or overall rank |
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

## Good to know

- We store your Yahoo app credentials locally in `~/.fantasy-baseball-mcp/config.json`.

## License

MIT
