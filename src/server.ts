import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Session } from "./session.js";
import { ToolContext } from "./tools/context.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";
import { registerOnboardingTools } from "./tools/onboarding.js";

/**
 * Server-level instructions. Clients (Claude Desktop / Claude Code) load this so
 * Claude understands the `fantasy …` command convention and maps plain language
 * to the right tools.
 */
const INSTRUCTIONS = `This server manages the user's Yahoo Fantasy Baseball team.

It uses a simple "fantasy ..." command convention. Interpret the user's plain
language and call the matching tool:

Setup (do this first, once):
- "fantasy start" / "fantasy setup" -> call fantasy_setup to show the guide and
  the authorization link. If the user gives a Yahoo Client ID/Secret, pass them.
- After the user pastes the verification code from Yahoo, call fantasy_authorize.
- "fantasy choose team" -> call fantasy_select_team to set the default team.
- "fantasy status" -> call fantasy_status.

Everyday use (these default to the user's configured league/team):
- "fantasy show roster" -> get_team_roster
- "fantasy show my matchup" / "fantasy matchup" -> get_team_matchups or get_matchups
- "fantasy standings" / "fantasy league" -> get_league
- "fantasy my stats this week" -> get_team_stats_week
- "fantasy season stats" -> get_team_stats_season
- "fantasy who should I add" / "fantasy free agents" -> rank_players
- "fantasy recent moves" / "fantasy transactions" -> get_transactions
- "fantasy add X" / "fantasy drop Y" / "fantasy swap X for Y" -> add_drop_player
- "fantasy set lineup ..." / "fantasy bench X, start Y" -> set_lineup

add_drop_player and set_lineup change the user's real roster. Always confirm the
exact players (and positions) with the user before calling them. If any tool says
setup is incomplete, guide the user back to "fantasy start".`;

/**
 * Boot the MCP server over stdio. The server always starts — even with no
 * credentials — so the in-chat "fantasy start" onboarding can run. stdio
 * transport owns stdout, so all diagnostics go to stderr.
 */
export async function runServer(): Promise<void> {
  const session = new Session();
  await session.init();

  const ctx = new ToolContext(session);
  const server = new McpServer(
    { name: "yahoo-fantasy-baseball", version: "0.1.0" },
    { instructions: INSTRUCTIONS },
  );

  registerOnboardingTools(server, session);
  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    session.isConfigured()
      ? "Yahoo Fantasy Baseball MCP server running (configured)."
      : "Yahoo Fantasy Baseball MCP server running (not set up — say 'fantasy start').",
  );
}
