import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../mcp/context.js";
import { jsonResult, textResult } from "../mcp/results.js";
import { asArray, today } from "../util.js";
import { mapCompactRosterPlayer, mapPlayerProfile } from "./mappers.js";
import { DESTRUCTIVE, WRITE_NOT_SUPPORTED } from "./writeSupport.js";
import { escapeXml } from "./xml.js";

const READ_ONLY = { readOnlyHint: true } as const;

function mapRosterTeam(team: any) {
  return {
    team_key: team.team_key,
    team_id: team.team_id,
    name: team.name,
    ...(team.is_owned_by_current_login ? { is_owned_by_current_login: 1 } : {}),
  };
}

export function mapRosterCompactWithStats(data: any) {
  const team = data?.team;
  if (!team) return data;
  return {
    team: mapRosterTeam(team),
    roster_date: team.roster?.date,
    players: asArray(team.roster?.players?.player).map((player: any) => ({
      ...mapCompactRosterPlayer(player),
      player_stats: player.player_stats,
    })),
  };
}

export function mapRosterFull(data: any) {
  const team = data?.team;
  if (!team) return data;
  return {
    team: mapRosterTeam(team),
    roster_date: team.roster?.date,
    players: asArray(team.roster?.players?.player).map((player: any) => ({
      ...mapPlayerProfile(player),
      selected_position: player.selected_position?.position,
      is_flex: player.selected_position?.is_flex || undefined,
      is_starting: player.starting_status?.is_starting,
    })),
  };
}

export function mapRosterCompact(data: any) {
  const team = data?.team;
  if (!team) return data;
  return {
    team: mapRosterTeam(team),
    roster_date: team.roster?.date,
    players: asArray(team.roster?.players?.player).map(mapCompactRosterPlayer),
  };
}

export function registerRosterReadTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    "get_roster",
    {
      title: "Get team roster",
      description:
        "Get a team's roster for a date, including roster slots and player status. " +
        "Set full=true for standard details or includeStats=true for Yahoo stats.",
      inputSchema: {
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
        date: z.string().optional().describe("Date as YYYY-MM-DD; defaults to today"),
        includeStats: z
          .boolean()
          .optional()
          .describe("Add per-player Yahoo stats; cannot be combined with full=true"),
        full: z
          .boolean()
          .optional()
          .describe("Return standard roster details; cannot be combined with includeStats=true"),
      },
      annotations: READ_ONLY,
    },
    async ({ teamKey, date, includeStats = false, full = false }) => {
      if (full && includeStats) {
        throw new Error("get_roster accepts either full=true or includeStats=true, not both.");
      }
      const tk = ctx.resolveTeamKey(teamKey);
      const rosterDate = date || today();
      const statsSuffix = includeStats ? ";out=stats" : "";
      const data = await ctx.yahoo.get(
        `/team/${tk}/roster;date=${rosterDate}/players${statsSuffix}`,
      );
      return jsonResult(
        full
          ? mapRosterFull(data)
          : includeStats
            ? mapRosterCompactWithStats(data)
            : mapRosterCompact(data),
      );
    },
  );
}

export function registerRosterWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    "set_lineup",
    {
      title: "Set daily lineup",
      description:
        "DESTRUCTIVE: changes your real Yahoo roster positions for a given date. " +
        "Confirm the lineup with the user before calling this.",
      inputSchema: {
        assignments: z
          .array(
            z.object({
              playerKey: z.string().describe("Player key, e.g. 431.p.10642"),
              position: z.string().describe("Roster position, e.g. 1B, OF, SP, Util, BN"),
            }),
          )
          .min(1)
          .describe("Player-to-position assignments"),
        date: z.string().optional().describe("Date as YYYY-MM-DD; defaults to today"),
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
        force: z
          .boolean()
          .optional()
          .describe("Attempt the action even though write access is not officially supported"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ assignments, date, teamKey, force }) => {
      if (!force) return textResult(WRITE_NOT_SUPPORTED);
      const tk = ctx.resolveTeamKey(teamKey);
      const rosterDate = date || today();
      const players = assignments
        .map(
          (assignment) => `      <player>
        <player_key>${escapeXml(assignment.playerKey)}</player_key>
        <position>${escapeXml(assignment.position)}</position>
      </player>`,
        )
        .join("\n");
      const xml = `<?xml version="1.0"?>
<fantasy_content>
  <roster>
    <coverage_type>date</coverage_type>
    <date>${escapeXml(rosterDate)}</date>
    <players>
${players}
    </players>
  </roster>
</fantasy_content>`;

      await ctx.yahoo.put(`/team/${tk}/roster`, xml);
      const summary = assignments
        .map((assignment) => `  ${assignment.playerKey} → ${assignment.position}`)
        .join("\n");
      return textResult(`Lineup updated for team ${tk} on ${rosterDate}:\n${summary}`);
    },
  );
}
