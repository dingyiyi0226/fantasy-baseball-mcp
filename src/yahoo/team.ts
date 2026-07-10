import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type McpContext } from "../mcp.js";
import { asArray, str } from "../util.js";
import { teamKeysForLeague } from "./utils.js";
import { mapTeamSummary } from "./mappers.js";

const READ_ONLY = { readOnlyHint: true } as const;

export function mapListTeams(data: any) {
  return {
    teams: asArray(data?.league?.teams?.team ?? data?.teams?.team).map((team: any) => ({
      team_key: team.team_key,
      name: team.name,
    })),
  };
}

export function mapTeam(data: any) {
  const team = data?.team;
  if (!team) return data;
  return {
    team: {
      ...mapTeamSummary(team),
      team_stats: team.team_stats,
      team_points: team.team_points,
      team_standings: team.team_standings,
    },
  };
}

export function mapStandings(data: any) {
  return {
    teams: asArray(data?.teams?.team).map((team: any) => ({
      team_key: team.team_key,
      team_id: team.team_id,
      name: team.name,
      ...(team.is_owned_by_current_login ? { is_owned_by_current_login: 1 } : {}),
      team_standings: team.team_standings,
      team_stats: team.team_stats,
    })),
  };
}

export function mapTeamStats(data: any) {
  const team = data?.team;
  if (!team) return data;
  return {
    team_key: team.team_key,
    name: team.name,
    ...(team.is_owned_by_current_login ? { is_owned_by_current_login: 1 } : {}),
    team_stats: team.team_stats,
    team_points: team.team_points,
  };
}

export function registerTeamTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    "list_teams",
    {
      title: "List league teams",
      description:
        "List the teams in a league with only team_key and name. Use get_team for " +
        "detailed information about one selected team.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key, e.g. 431.l.12345"),
      },
      annotations: READ_ONLY,
    },
    async ({ leagueKey }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const data = await ctx.yahoo.get(`/league/${lk}/teams`);
      return jsonResult(mapListTeams(data));
    },
  );

  server.registerTool(
    "get_team",
    {
      title: "Get one team's details",
      description:
        "Get detailed metadata, season stats, points, and standings for one team. " +
        "This excludes roster and matchup history.",
      inputSchema: {
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
      },
      annotations: READ_ONLY,
    },
    async ({ teamKey }) => {
      const tk = ctx.resolveTeamKey(teamKey);
      const data = await ctx.yahoo.get(`/team/${tk};out=stats,standings`);
      return jsonResult(mapTeam(data));
    },
  );

  server.registerTool(
    "get_standings",
    {
      title: "Get league standings",
      description:
        "Get the league standings table, including rank, record, games back, playoff " +
        "seed, and season category totals.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key, e.g. 431.l.12345"),
        teamKeys: z
          .array(z.string())
          .optional()
          .describe("Specific team keys; defaults to all teams in the league"),
      },
      annotations: READ_ONLY,
    },
    async ({ leagueKey, teamKeys }) => {
      let keys = teamKeys ?? [];
      if (keys.length === 0) {
        const lk = ctx.resolveLeagueKey(leagueKey);
        const league = await ctx.yahoo.get(`/league/${lk}`);
        const numTeams = Number(str(league?.league?.num_teams)) || 0;
        if (numTeams === 0) {
          throw new Error(`Could not determine number of teams for league ${lk}.`);
        }
        keys = teamKeysForLeague(lk, numTeams);
      }
      const data = await ctx.yahoo.get(
        `/teams;team_keys=${keys.join(",")};out=stats,standings`,
      );
      return jsonResult(mapStandings(data));
    },
  );

  server.registerTool(
    "get_team_stats",
    {
      title: "Get team stats",
      description:
        "Get a team's aggregated stats for a scoring week or the whole season.",
      inputSchema: {
        period: z
          .enum(["week", "season"])
          .describe("Stats period: week for one scoring week, or season for season totals"),
        week: z.number().int().positive().optional().describe("Required when period=week"),
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
      },
      annotations: READ_ONLY,
    },
    async ({ period, week, teamKey }) => {
      if (period === "week" && week === undefined) {
        throw new Error("get_team_stats requires week when period=week.");
      }
      if (period === "season" && week !== undefined) {
        throw new Error("get_team_stats does not accept week when period=season.");
      }
      const tk = ctx.resolveTeamKey(teamKey);
      const resource =
        period === "week"
          ? `/team/${tk}/stats;type=week;week=${week}`
          : `/team/${tk}/stats;type=season`;
      return jsonResult(mapTeamStats(await ctx.yahoo.get(resource)));
    },
  );
}
