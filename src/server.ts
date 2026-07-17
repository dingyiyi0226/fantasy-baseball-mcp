import { writeSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAnalysisTools } from "./analysis/index.js";
import { Session } from "./app/session.js";
import { McpContext } from "./mcp.js";
import {
  registerYahooReadTools,
  registerYahooWriteTools,
} from "./yahoo/index.js";
import { registerYahooOnboardingTools } from "./yahoo/onboarding.js";

/** Server version. Kept in sync with package.json/manifest.json by scripts/sync-version.js. */
export const VERSION = "0.9.4";
const ENABLE_YAHOO_WRITE_API = process.env.ENABLE_YAHOO_WRITE_API === "true";

/**
 * Server-level instructions sent to the AI client so it understands the
 * `fantasy …` command convention and maps plain language to the right tools.
 */
const INSTRUCTIONS = `This server manages the user's Yahoo Fantasy Baseball team.

It uses a simple "fantasy ..." command convention. Interpret the user's plain
language and call the matching tool:

Setup (do this first, once):
- "fantasy login" / "fantasy start" / "fantasy setup" -> call fantasy_login to
  show the guide and the authorization link. If the user gives a Yahoo Client
  ID/Secret, pass them.
- After the user pastes the verification code from Yahoo, call fantasy_authorize.
- "fantasy choose team" -> call fantasy_select_team to set the default team.
- "fantasy status" -> call fantasy_status.
- "fantasy logout" / "fantasy disconnect" -> call fantasy_logout to remove saved
  credentials and start over.

CRITICAL OUTPUT RULE: When fantasy_login, fantasy_status, or fantasy_logout
returns text, copy that text into your reply WORD FOR WORD. Do NOT paraphrase,
condense, rewrite, reorder, or restructure it in any way. Do NOT create your
own bullet points or "two options" framing. Do NOT omit the network-allowlist
section, the numbered steps, the URL, or any field names. The user depends on
the exact instructions; rewriting them breaks the setup flow.

Yahoo stats use compact row tables: \`stats.columns\` names the values in each
corresponding \`stats.rows\` array. Read values by their shared position; do not
treat the columns as unrelated lists. \`stat_categories\` and \`stat_winners\`
use the same format. League-settings \`roster_positions\` also uses that format.

Repeated Yahoo player results use the same format: \`players.columns\` names
the values in each \`players.rows\` array. \`keyOnly=true\` roster results remain
a plain player-key array. A player\'s \`player_stats\` keeps coverage metadata;
its table is stored in sibling \`player_stats.stats.columns\` and
\`player_stats.stats.rows\` player columns.

Probable-starter results also use this format: \`starters.columns\` names the
values in each corresponding \`starters.rows\` array.

In \`analyze_roster_stats\`, each player remains an object. Only its MLB time
windows are flattened: \`mlbStats.columns\` names the aligned values in
\`mlbStats.standard\` and the optional \`mlbStats.recent14d\` and
\`mlbStats.recent30d\` arrays.

Everyday use (these default to the user's configured league/team):
- "fantasy show roster" / "who is starting" -> get_roster (the compact seven-field
  player view: player_key, name, editorial_team_abbr, display_position, selected_position,
  status, and is_starting. Pass keyOnly=true when only player keys are needed.)
- "fantasy roster stats" -> get_roster_stats (detailed player profile, injury, eligibility,
  lineup, and player_stats fields).
- "fantasy show my matchup" / "fantasy matchup" -> get_team_matchup_history
- "fantasy league scoreboard" -> get_league_scoreboard
- "fantasy list teams" -> list_teams (team_key and name only; do not also call get_league)
- "fantasy league metadata" -> get_league_metadata
- "fantasy standings" / "fantasy league" -> get_league (settings, standings, and team_key/name)
- "fantasy my stats this week" -> get_team_stats with period=week and the requested week
- "fantasy season stats" -> get_team_stats with period=season
- "fantasy free agents" / "who's available" -> list_players (names/ownership, no stats);
  "fantasy who should I add" (needs stats to compare) -> rank_players
- "fantasy hot free-agent batters" / "which FA hitter should I add"
  -> rank_free_agent_batters (FA batters only, with actual last-week or last-month stats)
- "fantasy MLB leaders" / "rank all players by <stat>" -> rank_game_players (Yahoo-wide
  leaderboard; not filtered by the user's league or its ownership)
- For MLB probable starting pitchers on a date, or free-agent/streamer starter scouting,
  use list_probable_starters. Set fantasyContext=true when the user asks whether those
  starters are free agents, available, rostered, or addable; it adds fantasyStatus and
  ownerTeamName (when rostered by another team).
- "fantasy find <player name>" / "is <name> available" / need a player_key from a name
  -> search_players (resolves a name to a player_key; filter status=FA for free agents)
- "fantasy recent moves" / "fantasy transactions" -> get_transactions

Advanced player analysis (no Yahoo auth required):
- "analyze [player name]" / "how is [player] doing" -> analyze_player_stats
  Fetches Statcast (exit velo, barrel %, hard-hit %), expected stats (xBA, xSLG,
  xwOBA), recent 14-/30-day splits, and FanGraphs (WAR, wRC+, K%, BB%) for any MLB player.

Roster analysis (requires Yahoo setup):
- "analyze my roster" / "roster report" / "who should start tomorrow" -> analyze_roster_stats
  Runs analyze_player_stats for every player on the team's current roster.

Do not use the legacy Yahoo write API path for roster changes in normal use.
For lineup changes like bench/start requests, use the browser-based roster
management flow. Keep add/drop recommendations non-executing by default. When
the add-drop-player browser workflow is available and the user explicitly
approves an exact transaction, use it; otherwise have the user make the move
directly on Yahoo Fantasy. If any tool says setup is incomplete, guide the user
back to "fantasy start".`;

/** Register the tools available without enabling the legacy Yahoo write API. */
export function registerDefaultTools(
  server: McpServer,
  session: Session,
  ctx: McpContext,
): void {
  registerYahooOnboardingTools(server, session);
  registerYahooReadTools(server, ctx);
  registerAnalysisTools(server, ctx);
}

/**
 * Boot the MCP server over stdio. The server always starts — even with no
 * credentials — so the in-chat "fantasy start" onboarding can run. stdio
 * transport owns stdout, so all diagnostics go to stderr.
 */
export async function runServer(): Promise<void> {
  // Log version/runtime up front (synchronously, so it survives even if startup
  // later crashes) — this is how we confirm exactly which build is running,
  // especially when diagnosing platform-specific issues.
  writeSync(
    2,
    `[fantasy-baseball-mcp] starting v${VERSION} (node ${process.version}, ${process.platform} ${process.arch})\n`,
  );

  const session = new Session();
  await session.init();

  const ctx = new McpContext(session);
  const server = new McpServer(
    { name: "fantasy-baseball", version: VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerDefaultTools(server, session, ctx);
  if (ENABLE_YAHOO_WRITE_API) {
    registerYahooWriteTools(server, ctx);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    session.isConfigured()
      ? "Fantasy Baseball MCP server running (configured)."
      : "Fantasy Baseball MCP server running (not set up — say 'fantasy start').",
  );
}
