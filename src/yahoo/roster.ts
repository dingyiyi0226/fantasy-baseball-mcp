import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, textResult, type McpContext } from "../mcp.js";
import { asArray, today } from "../util.js";
import { liftStatsTable, mapCompactRosterPlayer, mapPlayerStatsProfile, mapRecordsTable } from "./mappers.js";
import { DESTRUCTIVE, WRITE_NOT_SUPPORTED } from "./writeSupport.js";
import { escapeXml } from "./utils.js";

const READ_ONLY = { readOnlyHint: true } as const;

function mapRosterTeam(team: any) {
  return {
    team_key: team.team_key,
    name: team.name,
    ...(team.is_owned_by_current_login ? { is_owned_by_current_login: 1 } : {}),
  };
}

export function mapRosterStats(data: any) {
  const team = data?.team;
  if (!team) return data;
  const players = asArray(team.roster?.players?.player).map((player: any) => ({
    ...mapPlayerStatsProfile(player),
    selected_position: player.selected_position?.position,
    status: player.status ?? null,
    is_flex: player.selected_position?.is_flex || undefined,
    is_starting: player.starting_status?.is_starting,
    ...liftStatsTable("player_stats", player.player_stats),
  }));
  return {
    team: mapRosterTeam(team),
    roster_date: team.roster?.date,
    players: mapRecordsTable(players),
  };
}

export function mapRosterCompact(data: any) {
  const team = data?.team;
  if (!team) return data;
  const players = asArray(team.roster?.players?.player).map((player: any) => ({
    ...mapCompactRosterPlayer(player),
    is_starting: player.starting_status?.is_starting,
  }));
  return {
    team: mapRosterTeam(team),
    roster_date: team.roster?.date,
    players: mapRecordsTable(players),
  };
}

export function mapRosterKeys(data: any) {
  const team = data?.team;
  if (!team) return data;
  return asArray(team.roster?.players?.player).map((player: any) => player.player_key);
}

export function registerRosterReadTools(server: McpServer, ctx: McpContext): void {
  // GET /team/{teamKey}/roster;date={date}/players[;out=stats]
  server.registerTool(
    "get_roster",
    {
      title: "Get team roster",
      description:
        "Get a team's roster for a date. By default, each player row contains player_key, name, " +
        "editorial_team_abbr, display_position, selected_position, status, and is_starting. " +
        "Set keyOnly=true to return only the player_key array.",
      inputSchema: {
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
        date: z.string().optional().describe("Date as YYYY-MM-DD; defaults to today"),
        keyOnly: z
          .boolean()
          .optional()
          .describe("Return only an array of player_key values"),
      },
      annotations: READ_ONLY,
    },
    async ({ teamKey, date, keyOnly = false }) => {
      const tk = ctx.resolveTeamKey(teamKey);
      const rosterDate = date || today();
      const data = await ctx.yahoo.get(`/team/${tk}/roster;date=${rosterDate}/players`);
      return jsonResult(keyOnly ? mapRosterKeys(data) : mapRosterCompact(data));
    },
  );

  // GET /team/{teamKey}/roster;date={date}/players;out=stats
  server.registerTool(
    "get_roster_stats",
    {
      title: "Get team roster with stats",
      description:
        "Get a team's roster and Yahoo player stats for a date. Each player includes the " +
        "detailed profile, injury, eligibility, lineup, and player_stats fields.",
      inputSchema: {
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
        date: z.string().optional().describe("Date as YYYY-MM-DD; defaults to today"),
      },
      annotations: READ_ONLY,
    },
    async ({ teamKey, date }) => {
      const tk = ctx.resolveTeamKey(teamKey);
      const rosterDate = date || today();
      const data = await ctx.yahoo.get(`/team/${tk}/roster;date=${rosterDate}/players;out=stats`);
      return jsonResult(mapRosterStats(data));
    },
  );
}

export function registerRosterWriteTools(server: McpServer, ctx: McpContext): void {
  // PUT /team/{teamKey}/roster
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
