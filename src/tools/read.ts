import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { teamKeysForLeague } from "../yahooClient.js";
import { today, str } from "../util.js";
import { ToolContext, jsonResult } from "./context.js";
import {
  mapLeague,
  mapListLeagues,
  mapTeams,
  mapStandings,
  mapRosterStats,
  mapRoster,
  mapTeamStats,
  mapMatchups,
  mapTeamMatchups,
  mapPlayerStats,
  mapRankPlayers,
  mapPlayerList,
  mapTransactions,
} from "./mappers.js";

const READ_ONLY = { readOnlyHint: true } as const;

/**
 * Register all read-only tools. Each accepts an optional leagueKey/teamKey that
 * falls back to the configured defaults. Resource paths are passed through to
 * Yahoo verbatim — the literal semicolons are sub-resource separators and are
 * intentionally not URL-encoded.
 */
export function registerReadTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_leagues",
    {
      title: "List my leagues",
      description:
        "List all fantasy leagues (and game weeks / stat categories) for the " +
        "logged-in Yahoo account. Use this to discover league_key and team_key values.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const data = await ctx.client.get(
        "/users;use_login=1/games;out=game_weeks,stat_categories,leagues",
      );
      return jsonResult(mapListLeagues(data));
    },
  );

  server.registerTool(
    "get_league",
    {
      title: "Get league overview",
      description:
        "Get a league's teams, settings, and current standings. Defaults to the " +
        "configured league when leagueKey is omitted.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key, e.g. 431.l.12345"),
      },
      annotations: READ_ONLY,
    },
    async ({ leagueKey }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const data = await ctx.client.get(`/league/${lk};out=teams,settings,standings`);
      return jsonResult(mapLeague(data));
    },
  );

  server.registerTool(
    "get_teams",
    {
      title: "Get all teams in a league",
      description:
        "Get stats, standings, and matchups for every team in a league. Pass " +
        "explicit teamKeys to limit the set, otherwise all teams in the league are fetched.",
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
        const league = await ctx.client.get(`/league/${lk}`);
        const numTeams = Number(str(league?.league?.num_teams)) || 0;
        if (numTeams === 0) {
          throw new Error(`Could not determine number of teams for league ${lk}.`);
        }
        keys = teamKeysForLeague(lk, numTeams);
      }
      const data = await ctx.client.get(
        `/teams;team_keys=${keys.join(",")};out=stats,standings,matchups`,
      );
      return jsonResult(mapTeams(data));
    },
  );

  server.registerTool(
    "get_standings",
    {
      title: "Get league standings",
      description:
        "Get the league standings table — each team's rank, win/loss record, " +
        "games back, playoff seed, and season category totals. This is the light " +
        "way to see how teams stack up; use get_teams when you also need every " +
        "team's full matchup history.",
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
        const league = await ctx.client.get(`/league/${lk}`);
        const numTeams = Number(str(league?.league?.num_teams)) || 0;
        if (numTeams === 0) {
          throw new Error(`Could not determine number of teams for league ${lk}.`);
        }
        keys = teamKeysForLeague(lk, numTeams);
      }
      const data = await ctx.client.get(
        `/teams;team_keys=${keys.join(",")};out=stats,standings`,
      );
      return jsonResult(mapStandings(data));
    },
  );

  server.registerTool(
    "get_roster",
    {
      title: "Get team roster",
      description:
        "Get a team's roster for a date — each player's roster slot (starting " +
        "position or BN/IL bench), starting status, injury status, and eligible " +
        "positions, without any stats. Use this to see who is on the team and who " +
        "is starting or benched. For per-date Yahoo stats use get_roster_stats; " +
        "for advanced stats use analyze_roster_stats. Defaults to the configured " +
        "team and today's date.",
      inputSchema: {
        teamKey: z.string().optional().describe("Team key, e.g. 431.l.12345.t.2"),
        date: z
          .string()
          .optional()
          .describe("Date as YYYY-MM-DD; defaults to today"),
      },
      annotations: READ_ONLY,
    },
    async ({ teamKey, date }) => {
      const tk = ctx.resolveTeamKey(teamKey);
      const d = date || today();
      const data = await ctx.client.get(`/team/${tk}/roster;date=${d}/players`);
      return jsonResult(mapRoster(data));
    },
  );

  server.registerTool(
    "get_roster_stats",
    {
      title: "Get team roster with stats",
      description:
        "Get a team's roster with each player's Yahoo stats for a given date. Like " +
        "get_roster but heavier — use get_roster when you only need slots/status, " +
        "or analyze_roster_stats for advanced (Statcast/FanGraphs) stats. Defaults " +
        "to the configured team and today's date.",
      inputSchema: {
        teamKey: z.string().optional().describe("Team key, e.g. 431.l.12345.t.2"),
        date: z
          .string()
          .optional()
          .describe("Date as YYYY-MM-DD; defaults to today"),
      },
      annotations: READ_ONLY,
    },
    async ({ teamKey, date }) => {
      const tk = ctx.resolveTeamKey(teamKey);
      const d = date || today();
      const data = await ctx.client.get(`/team/${tk}/roster;date=${d}/players;out=stats`);
      return jsonResult(mapRosterStats(data));
    },
  );

  server.registerTool(
    "get_team_stats_week",
    {
      title: "Get team weekly stats",
      description: "Get a team's aggregated stats for a specific scoring week.",
      inputSchema: {
        week: z.number().int().positive().describe("Week number"),
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
      },
      annotations: READ_ONLY,
    },
    async ({ week, teamKey }) => {
      const tk = ctx.resolveTeamKey(teamKey);
      const data = await ctx.client.get(`/team/${tk}/stats;type=week;week=${week}`);
      return jsonResult(mapTeamStats(data));
    },
  );

  server.registerTool(
    "get_team_stats_season",
    {
      title: "Get team season stats",
      description: "Get a team's aggregated stats for the whole season.",
      inputSchema: {
        teamKey: z.string().optional().describe("Team key; defaults to configured team"),
      },
      annotations: READ_ONLY,
    },
    async ({ teamKey }) => {
      const tk = ctx.resolveTeamKey(teamKey);
      const data = await ctx.client.get(`/team/${tk}/stats;type=season`);
      return jsonResult(mapTeamStats(data));
    },
  );

  server.registerTool(
    "get_matchups",
    {
      title: "Get league scoreboard",
      description:
        "Get the league scoreboard (all head-to-head matchups). Pass a week to " +
        "view a specific week, otherwise the current week is returned.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key; defaults to configured league"),
        week: z.number().int().positive().optional().describe("Week number"),
      },
      annotations: READ_ONLY,
    },
    async ({ leagueKey, week }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const resource =
        week === undefined
          ? `/league/${lk}/scoreboard`
          : `/league/${lk}/scoreboard;week=${week}`;
      const data = await ctx.client.get(resource);
      return jsonResult(mapMatchups(data));
    },
  );

  server.registerTool(
    "get_team_matchups",
    {
      title: "Get a team's matchups",
      description:
        "Get a team's matchups across the season, or only the listed weeks when " +
        "`weeks` is provided.",
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
          ? `/team/${tk}/matchups;weeks=${weeks.join(",")}`
          : `/team/${tk}/matchups`;
      const data = await ctx.client.get(resource);
      return jsonResult(mapTeamMatchups(data));
    },
  );

  server.registerTool(
    "get_player_stats",
    {
      title: "Get player stats by date",
      description:
        "Get stats for one or more players on a specific date. Player keys look " +
        "like 431.p.10642.",
      inputSchema: {
        playerKeys: z.array(z.string()).min(1).describe("Player keys, e.g. 431.p.10642"),
        date: z.string().optional().describe("Date as YYYY-MM-DD; defaults to today"),
      },
      annotations: READ_ONLY,
    },
    async ({ playerKeys, date }) => {
      const d = date || today();
      const data = await ctx.client.get(
        `/players;player_keys=${playerKeys.join(",")}/stats;type=date;date=${d}`,
      );
      return jsonResult(mapPlayerStats(data));
    },
  );

  server.registerTool(
    "rank_players",
    {
      title: "Rank / search players",
      description:
        "Rank league players (including free agents) by a sort key. `sort` is a " +
        "stat id or one of AR (actual rank), OR (overall rank), PTS. `sortType` " +
        "scopes the ranking window. Use this to find waiver/free-agent targets. " +
        "Returns up to 25 players per call; page with `start`.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key; defaults to configured league"),
        sort: z.string().default("AR").describe("Stat id, or AR / OR / PTS"),
        sortType: z
          .enum(["season", "lastweek", "lastmonth", "date"])
          .default("season")
          .describe("Ranking window"),
        start: z.number().int().min(0).default(0).describe("Pagination offset"),
        count: z
          .number()
          .int()
          .min(1)
          .max(25)
          .default(25)
          .describe("Number of players to return (max 25)"),
      },
      annotations: READ_ONLY,
    },
    async ({ leagueKey, sort, sortType, start, count }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const n = Math.min(count, 25);
      const data = await ctx.client.get(
        `/league/${lk}/players;sort=${sort};sort_type=${sortType};start=${start};count=${n};out=ownership,stats`,
      );
      return jsonResult(mapRankPlayers(data));
    },
  );

  server.registerTool(
    "list_players",
    {
      title: "List / browse players",
      description:
        "List league players (including free agents) in ranked order with their " +
        "name, position, eligible positions, status, and ownership (free agent or " +
        "owning team) — but no stats. This is the light way to scan waiver/free-agent " +
        "targets; once you have candidates, use analyze_player_stats or rank_players " +
        "for their stats. `sort` is a stat id or AR / OR / PTS. Returns up to 25 " +
        "players per call; page with `start`.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key; defaults to configured league"),
        sort: z.string().default("AR").describe("Stat id, or AR / OR / PTS"),
        sortType: z
          .enum(["season", "lastweek", "lastmonth", "date"])
          .default("season")
          .describe("Ranking window"),
        start: z.number().int().min(0).default(0).describe("Pagination offset"),
        count: z
          .number()
          .int()
          .min(1)
          .max(25)
          .default(25)
          .describe("Number of players to return (max 25)"),
      },
      annotations: READ_ONLY,
    },
    async ({ leagueKey, sort, sortType, start, count }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const n = Math.min(count, 25);
      const data = await ctx.client.get(
        `/league/${lk}/players;sort=${sort};sort_type=${sortType};start=${start};count=${n};out=ownership`,
      );
      return jsonResult(mapPlayerList(data));
    },
  );

  server.registerTool(
    "get_league_scoring_categories",
    {
      title: "Get league scoring categories",
      description:
        "Return the stat categories used for scoring in this league (e.g. R, HR, RBI, SB, AVG " +
        "for batting; W, ERA, WHIP, K, SV, HLD for pitching). Always call this before giving " +
        "roster add/drop advice so recommendations reflect what actually scores in this league. " +
        "Results are cached in config since categories rarely change after league creation. " +
        "Pass leagueKey to force-refresh a different league.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key; defaults to configured league"),
      },
      annotations: READ_ONLY,
    },
    async ({ leagueKey }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const categories = await ctx.getLeagueScoringCategories(leagueKey);
      const batting = categories.filter(c => c.positionType === "B").map(c => c.displayName);
      const pitching = categories.filter(c => c.positionType === "P").map(c => c.displayName);
      return jsonResult({ leagueKey: lk, batting, pitching });
    },
  );

  server.registerTool(
    "get_transactions",
    {
      title: "Get league transactions",
      description:
        "Get recent transactions (adds, drops, trades) in a league. Pass teamKey " +
        "to filter to a single team's transactions.",
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
      const data = await ctx.client.get(resource);
      return jsonResult(mapTransactions(data));
    },
  );
}
