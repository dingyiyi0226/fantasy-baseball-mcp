import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { leagueKeyFromTeamKey } from "../yahooClient.js";
import { today, str } from "../util.js";
import { ToolContext, textResult } from "./context.js";

// Writes change a real Yahoo roster, so they are flagged destructive; MCP
// clients (Claude Desktop / Claude Code) will prompt the user to confirm.
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true } as const;

const WRITE_NOT_SUPPORTED =
  "Yahoo write actions are not supported yet — this app only has read access " +
  "to the Yahoo Fantasy API. Please make this change directly on Yahoo Fantasy.\n\n" +
  "If you'd like to try anyway, ask me to force it.";

/** Escape XML special characters in interpolated values. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Register roster-mutating tools: add/drop a player and set a daily lineup.
 * Trade proposals/accepts are intentionally deferred to a future version.
 */
export function registerWriteTools(server: McpServer, ctx: ToolContext): void {
  // -------------------------------------------------------------------------
  // add_drop_player
  // -------------------------------------------------------------------------
  server.registerTool(
    "add_drop_player",
    {
      title: "Add and/or drop a player",
      description:
        "DESTRUCTIVE: modifies your real Yahoo roster. Adds a free agent, drops a " +
        "rostered player, or does both at once. Provide addPlayerKey to add, " +
        "dropPlayerKey to drop, or both for a simultaneous add/drop. Player keys " +
        "look like 431.p.10642. Defaults to your configured team. Always confirm " +
        "the players with the user before calling this.",
      inputSchema: {
        addPlayerKey: z
          .string()
          .optional()
          .describe("Player key to ADD (free agent), e.g. 431.p.10642"),
        dropPlayerKey: z
          .string()
          .optional()
          .describe("Player key to DROP from your roster"),
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
        force: z
          .boolean()
          .optional()
          .describe("Set to true to attempt the action even though write access is not officially supported"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ addPlayerKey, dropPlayerKey, teamKey, force }) => {
      if (!force) {
        return textResult(WRITE_NOT_SUPPORTED);
      }
      if (!addPlayerKey && !dropPlayerKey) {
        throw new Error("Provide addPlayerKey, dropPlayerKey, or both.");
      }
      const tk = ctx.resolveTeamKey(teamKey);
      const leagueKey = leagueKeyFromTeamKey(tk);

      const addBlock = addPlayerKey
        ? `      <player>
        <player_key>${esc(addPlayerKey)}</player_key>
        <transaction_data>
          <type>add</type>
          <destination_team_key>${esc(tk)}</destination_team_key>
        </transaction_data>
      </player>`
        : "";
      const dropBlock = dropPlayerKey
        ? `      <player>
        <player_key>${esc(dropPlayerKey)}</player_key>
        <transaction_data>
          <type>drop</type>
          <source_team_key>${esc(tk)}</source_team_key>
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

      const result = await ctx.client.post(`/league/${leagueKey}/transactions`, xml);
      const txnKey = str(result?.transaction?.transaction_key);
      return textResult(
        `Transaction submitted for team ${tk}: ${action}.` +
          (txnKey ? `\nYahoo transaction key: ${txnKey}` : "\nYahoo accepted the request."),
      );
    },
  );

  // -------------------------------------------------------------------------
  // set_lineup
  // -------------------------------------------------------------------------
  server.registerTool(
    "set_lineup",
    {
      title: "Set daily lineup",
      description:
        "DESTRUCTIVE: changes your real Yahoo roster positions for a given date. " +
        "Provide assignments mapping each playerKey to a roster position (e.g. " +
        "1B, OF, SP, Util, or BN for bench). Players not listed keep their current " +
        "slot. Defaults to your configured team and today's date. Confirm the " +
        "lineup with the user before calling this.",
      inputSchema: {
        assignments: z
          .array(
            z.object({
              playerKey: z.string().describe("Player key, e.g. 431.p.10642"),
              position: z
                .string()
                .describe("Roster position, e.g. 1B, OF, SP, Util, BN (bench)"),
            }),
          )
          .min(1)
          .describe("Player-to-position assignments"),
        date: z.string().optional().describe("Date as YYYY-MM-DD; defaults to today"),
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
        force: z
          .boolean()
          .optional()
          .describe("Set to true to attempt the action even though write access is not officially supported"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ assignments, date, teamKey, force }) => {
      if (!force) {
        return textResult(WRITE_NOT_SUPPORTED);
      }
      const tk = ctx.resolveTeamKey(teamKey);
      const d = date || today();

      const playerXml = assignments
        .map(
          (a) => `      <player>
        <player_key>${esc(a.playerKey)}</player_key>
        <position>${esc(a.position)}</position>
      </player>`,
        )
        .join("\n");

      const xml = `<?xml version="1.0"?>
<fantasy_content>
  <roster>
    <coverage_type>date</coverage_type>
    <date>${esc(d)}</date>
    <players>
${playerXml}
    </players>
  </roster>
</fantasy_content>`;

      await ctx.client.put(`/team/${tk}/roster`, xml);
      const summary = assignments
        .map((a) => `  ${a.playerKey} → ${a.position}`)
        .join("\n");
      return textResult(
        `Lineup updated for team ${tk} on ${d}:\n${summary}`,
      );
    },
  );
}
