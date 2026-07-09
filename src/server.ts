import { writeSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Session } from "./session.js";
import { ToolContext } from "./tools/context.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";
import { registerOnboardingTools } from "./tools/onboarding.js";
import { registerAnalysisTools } from "./tools/analysis.js";

/** Server version. Kept in sync with package.json/manifest.json by scripts/sync-version.js. */
export const VERSION = "0.6.1";
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

Everyday use (these default to the user's configured league/team):
- "fantasy show roster" / "who is starting" -> get_roster (slots/status, no stats);
  use get_roster_stats when the user wants per-player Yahoo stats.
- "fantasy show my matchup" / "fantasy matchup" -> get_team_matchups or get_matchups
- "fantasy standings" -> get_standings; "fantasy league" (settings + teams) -> get_league
- "fantasy my stats this week" -> get_team_stats_week
- "fantasy season stats" -> get_team_stats_season
- "fantasy free agents" / "who's available" -> list_players (names/ownership, no stats);
  "fantasy who should I add" (needs stats to compare) -> rank_players
- For MLB probable starting pitchers on a date, or free-agent/streamer starter scouting,
  use list_probable_starters. Set fantasyContext=true when the user asks whether those
  starters are free agents, available, rostered, or addable.
- "fantasy find <player name>" / "is <name> available" / need a player_key from a name
  -> search_players (resolves a name to a player_key; filter status=FA for free agents)
- "fantasy recent moves" / "fantasy transactions" -> get_transactions

Advanced player / roster analysis (no Yahoo auth required for these):
- "analyze [player name]" / "how is [player] doing" -> analyze_player_stats
  Fetches Statcast (exit velo, barrel %, hard-hit %), expected stats (xBA, xSLG,
  xwOBA), recent 14-/30-day splits, and FanGraphs (WAR, wRC+, K%, BB%) for any MLB player.
- "analyze my roster" / "roster report" / "who should start tomorrow" -> analyze_roster_stats
  Runs analyze_player_stats for every player on the team's current roster.

Do not use the legacy Yahoo write API path for roster changes in normal use.
For lineup changes like bench/start requests, use the browser-based roster
management flow. For add/drop decisions, recommend the move and have the user
make it directly on Yahoo Fantasy. If any tool says setup is incomplete, guide
the user back to "fantasy start".`;

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
    `[yahoo-fantasy-mcp] starting v${VERSION} (node ${process.version}, ${process.platform} ${process.arch})\n`,
  );

  const session = new Session();
  await session.init();

  const ctx = new ToolContext(session);
  const server = new McpServer(
    { name: "fantasy-baseball", version: VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerOnboardingTools(server, session);
  registerReadTools(server, ctx);
  if (ENABLE_YAHOO_WRITE_API) {
    registerWriteTools(server, ctx);
  }
  registerAnalysisTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    session.isConfigured()
      ? "Fantasy Baseball MCP server running (configured)."
      : "Fantasy Baseball MCP server running (not set up — say 'fantasy start').",
  );
}
