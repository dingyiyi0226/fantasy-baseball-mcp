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
| `fantasy who should I add?` | Find free-agent targets |
| `who's pitching tomorrow?` | List probable starters; add “who's a free agent?” to check availability |
| `analyze Shohei Ohtani` | Compare recent performance with Statcast and FanGraphs indicators |
| `move <player> from BN to <slot>` | Makes one approved lineup swap in the signed-in Yahoo browser, then verifies it saved |
| `set my lineup today` | Applies the agreed start/bench moves from a roster review |
| `add <free agent>` | Adds that exact free agent when there is an open roster spot |
| `add <free agent> and drop <player>` | Submits only that exact approved add/drop pair and verifies the resulting roster |
| `review my roster today` | Reviews the current matchup, lineup, open slots, and free-agent or streamer opportunities |
| `who on my bench should I start tonight?` | Recommends exact start/bench swaps and explains why |
| `weekly review` | Grades lineup choices, adds/drops, and category strategy for this week or the week just finished |
| `can I still win this week?` | Identifies realistic category flips and the best remaining path |

Browser actions use the signed-in Yahoo session: Codex's in-app browser or Claude's connected
Chrome. They stop if Yahoo is not signed in or the requested move is ambiguous. You can always ask
for advice first; an add/drop is submitted only after you explicitly approve the exact player or pair.

## Good to know

- Your Yahoo app credentials are stored locally in `~/.fantasy-baseball-mcp/config.json`.
- **For batters, we use** season, 14-day, and 30-day splits; xBA, xSLG, xwOBA, and their
  expected-vs-actual gaps; exit velocity, hard-hit rate, barrel rate, launch angle, sweet-spot rate,
  and batted-ball distance; WAR, wRC+, wOBA, ISO, BABIP, K%, BB%, SwStr%, GB%, FB%, HR/FB, and LD%.
- **For pitchers, we use** season, 14-day, and 30-day splits; xBA, xSLG, and xwOBA allowed;
  exit velocity, hard-hit rate, barrel rate, and launch angle allowed; WAR, ERA, FIP, xFIP, WHIP,
  K%, BB%, SwStr%, GB%, FB%, HR/FB, BABIP, and LOB%.

## License

MIT
