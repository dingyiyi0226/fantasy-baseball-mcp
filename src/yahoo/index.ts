import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../mcp/context.js";
import { registerLeagueTools } from "./league.js";
import { registerMatchupTools } from "./matchup.js";
import { registerPlayerTools } from "./player.js";
import { registerRosterReadTools, registerRosterWriteTools } from "./roster.js";
import { registerTeamTools } from "./team.js";
import {
  registerTransactionReadTools,
  registerTransactionWriteTools,
} from "./transaction.js";

export function registerYahooReadTools(server: McpServer, ctx: McpContext): void {
  registerLeagueTools(server, ctx);
  registerTeamTools(server, ctx);
  registerRosterReadTools(server, ctx);
  registerPlayerTools(server, ctx);
  registerMatchupTools(server, ctx);
  registerTransactionReadTools(server, ctx);
}

export function registerYahooWriteTools(server: McpServer, ctx: McpContext): void {
  registerRosterWriteTools(server, ctx);
  registerTransactionWriteTools(server, ctx);
}
