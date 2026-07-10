import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type McpContext } from "../mcp.js";
import { asArray } from "../util.js";
import { mapMatchup } from "./mappers.js";

const READ_ONLY = { readOnlyHint: true } as const;

function mapScoreboardTeam(team: any) {
  return { team_key: team.team_key, name: team.name };
}

function mapTeamMatchupTeam(team: any) {
  return {
    team_key: team.team_key,
    name: team.name,
    team_stats: team.team_stats,
  };
}

export function mapMatchups(data: any) {
  const league = data?.league;
  if (!league) return data;
  return {
    league: { league_key: league.league_key, name: league.name },
    scoreboard: {
      week: league.scoreboard?.week,
      matchups: asArray(league.scoreboard?.matchups?.matchup).map((matchup) =>
        mapMatchup(matchup, mapScoreboardTeam),
      ),
    },
  };
}

export function mapTeamMatchups(data: any) {
  const team = data?.team;
  if (!team) return data;
  return {
    team: { team_key: team.team_key, name: team.name, team_stats: team.team_stats },
    matchups: asArray(team.matchups?.matchup).map((matchup) =>
      mapMatchup(matchup, mapTeamMatchupTeam),
    ),
  };
}

export function registerMatchupTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    "get_league_scoreboard",
    {
      title: "Get one league scoreboard week",
      description:
        "Get every head-to-head pairing in the league for one scoring week. " +
        "Defaults to the current week.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key; defaults to configured league"),
        week: z.number().int().positive().optional().describe("Defaults to current week"),
      },
      annotations: READ_ONLY,
    },
    async ({ leagueKey, week }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const resource =
        week === undefined
          ? `/league/${lk}/scoreboard`
          : `/league/${lk}/scoreboard;week=${week}`;
      return jsonResult(mapMatchups(await ctx.yahoo.get(resource)));
    },
  );

  server.registerTool(
    "get_team_matchup_history",
    {
      title: "Get one team's detailed matchup history",
      description:
        "Get one team's season stats, matchup schedule, and weekly stats for both teams.",
      inputSchema: {
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
        weeks: z
          .array(z.number().int().positive())
          .optional()
          .describe("Specific week numbers; defaults to all weeks"),
      },
      annotations: READ_ONLY,
    },
    async ({ teamKey, weeks }) => {
      const tk = ctx.resolveTeamKey(teamKey);
      const resource =
        weeks && weeks.length > 0
          ? `/team/${tk};out=stats,matchups;weeks=${weeks.join(",")}`
          : `/team/${tk};out=stats,matchups`;
      return jsonResult(mapTeamMatchups(await ctx.yahoo.get(resource)));
    },
  );
}
