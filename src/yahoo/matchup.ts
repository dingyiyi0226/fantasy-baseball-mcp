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

export function teamMatchupHistoryResource(teamKey: string, weeks?: number[]) {
  return weeks && weeks.length > 0
    ? `/team/${teamKey}/matchups;weeks=${weeks.join(",")}`
    : `/team/${teamKey}/matchups`;
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

export function mapTeamMatchups(data: any, weeks?: number[]) {
  const team = data?.team;
  if (!team) return data;
  const requestedWeeks = weeks && weeks.length > 0 ? new Set(weeks) : undefined;
  return {
    team: { team_key: team.team_key, name: team.name, team_stats: team.team_stats },
    matchups: asArray(team.matchups?.matchup)
      .filter((matchup) => !requestedWeeks || requestedWeeks.has(Number(matchup.week)))
      .map((matchup) => mapMatchup(matchup, mapTeamMatchupTeam)),
  };
}

export function registerMatchupTools(server: McpServer, ctx: McpContext): void {
  // GET /league/{leagueKey}/scoreboard[;week={week}]
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

  // GET /team/{teamKey}/matchups[;weeks={weeks}]
  server.registerTool(
    "get_team_matchup_history",
    {
      title: "Get one team's detailed matchup history",
      description:
        "Get one team's matchup schedule and weekly stats for both teams.",
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
      const resource = teamMatchupHistoryResource(tk, weeks);
      return jsonResult(mapTeamMatchups(await ctx.yahoo.get(resource), weeks));
    },
  );
}
