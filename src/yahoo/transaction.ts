import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../mcp/context.js";
import { jsonResult, textResult } from "../mcp/results.js";
import { asArray, str } from "../util.js";
import { leagueKeyFromTeamKey } from "./keys.js";
import { mapLeagueHeader } from "./mappers.js";
import { DESTRUCTIVE, WRITE_NOT_SUPPORTED } from "./writeSupport.js";
import { escapeXml } from "./xml.js";

const READ_ONLY = { readOnlyHint: true } as const;

export function mapTransactions(data: any) {
  const league = data?.league;
  if (!league) return data;
  return {
    league: mapLeagueHeader(league),
    transactions: asArray(league.transactions?.transaction).map((transaction: any) => ({
      transaction_key: transaction.transaction_key,
      transaction_id: transaction.transaction_id,
      type: transaction.type,
      status: transaction.status,
      timestamp: transaction.timestamp,
      players: asArray(transaction.players?.player).map((player: any) => ({
        player_key: player.player_key,
        player_id: player.player_id,
        name: player.name?.full ?? player.name,
        editorial_team_abbr: player.editorial_team_abbr,
        display_position: player.display_position,
        position_type: player.position_type,
        transaction_data: player.transaction_data,
      })),
    })),
  };
}

export function registerTransactionReadTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    "get_transactions",
    {
      title: "Get league transactions",
      description:
        "Get recent adds, drops, and trades in a league. Pass teamKey to filter them.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key; defaults to configured league"),
        teamKey: z.string().optional().describe("Filter to this team's transactions"),
      },
      annotations: READ_ONLY,
    },
    async ({ leagueKey, teamKey }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const resource = teamKey
        ? `/league/${lk}/transactions;team_key=${teamKey}`
        : `/league/${lk}/transactions`;
      return jsonResult(mapTransactions(await ctx.yahoo.get(resource)));
    },
  );
}

export function registerTransactionWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    "add_drop_player",
    {
      title: "Add and/or drop a player",
      description:
        "DESTRUCTIVE: modifies your real Yahoo roster. Provide an add key, drop key, " +
        "or both, and always confirm the move with the user before calling this.",
      inputSchema: {
        addPlayerKey: z.string().optional().describe("Player key to add"),
        dropPlayerKey: z.string().optional().describe("Player key to drop"),
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
        force: z
          .boolean()
          .optional()
          .describe("Attempt the action even though write access is not officially supported"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ addPlayerKey, dropPlayerKey, teamKey, force }) => {
      if (!force) return textResult(WRITE_NOT_SUPPORTED);
      if (!addPlayerKey && !dropPlayerKey) {
        throw new Error("Provide addPlayerKey, dropPlayerKey, or both.");
      }

      const tk = ctx.resolveTeamKey(teamKey);
      const leagueKey = leagueKeyFromTeamKey(tk);
      const addBlock = addPlayerKey
        ? `      <player>
        <player_key>${escapeXml(addPlayerKey)}</player_key>
        <transaction_data>
          <type>add</type>
          <destination_team_key>${escapeXml(tk)}</destination_team_key>
        </transaction_data>
      </player>`
        : "";
      const dropBlock = dropPlayerKey
        ? `      <player>
        <player_key>${escapeXml(dropPlayerKey)}</player_key>
        <transaction_data>
          <type>drop</type>
          <source_team_key>${escapeXml(tk)}</source_team_key>
        </transaction_data>
      </player>`
        : "";

      let xml: string;
      let action: string;
      if (addPlayerKey && dropPlayerKey) {
        action = `add ${addPlayerKey} and drop ${dropPlayerKey}`;
        xml = `<?xml version="1.0"?>
<fantasy_content>
  <transaction>
    <type>add/drop</type>
    <players>
${addBlock}
${dropBlock}
    </players>
  </transaction>
</fantasy_content>`;
      } else if (addPlayerKey) {
        action = `add ${addPlayerKey}`;
        xml = `<?xml version="1.0"?>
<fantasy_content>
  <transaction>
    <type>add</type>
${addBlock}
  </transaction>
</fantasy_content>`;
      } else {
        action = `drop ${dropPlayerKey}`;
        xml = `<?xml version="1.0"?>
<fantasy_content>
  <transaction>
    <type>drop</type>
${dropBlock}
  </transaction>
</fantasy_content>`;
      }

      const result = await ctx.yahoo.post(`/league/${leagueKey}/transactions`, xml);
      const transactionKey = str(result?.transaction?.transaction_key);
      return textResult(
        `Transaction submitted for team ${tk}: ${action}.` +
          (transactionKey
            ? `\nYahoo transaction key: ${transactionKey}`
            : "\nYahoo accepted the request."),
      );
    },
  );
}
