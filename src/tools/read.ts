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
  mapRosterCompactWithStats,
  mapRosterFull,
  mapRosterCompact,
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
    "get_league_teams",
    {
      title: "Get league teams",
      description:
        "Get team metadata, season stats, and standings for one or more teams in a " +
        "league. This excludes matchup history; use get_league_scoreboard for one " +
        "league week or get_team_matchup_history for one team's detailed schedule.",
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
        "way to see how teams stack up; use get_league_teams only when you also " +
        "need team metadata or season totals.",
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
        "positions. By default, each player contains only player_key, name, " +
        "editorial_team_abbr, display_position, selected_position, and status. Set " +
        "full=true for the standard roster details, or includeStats=true to add Yahoo " +
        "stats to the compact player fields. Use analyze_roster_stats for advanced " +
        "stats. Defaults to the configured team and today's date.",
      inputSchema: {
        teamKey: z.string().optional().describe("Team key, e.g. 431.l.12345.t.2"),
        date: z
          .string()
          .optional()
          .describe("Date as YYYY-MM-DD; defaults to today"),
        includeStats: z
          .boolean()
          .optional()
          .describe("Add per-player Yahoo stats to the compact roster view. Cannot be combined with full=true."),
        full: z
          .boolean()
          .optional()
          .describe("Return the standard roster details instead of the compact default. Cannot be combined with includeStats=true."),
      },
      annotations: READ_ONLY,
    },
    async ({ teamKey, date, includeStats = false, full = false }) => {
      if (full && includeStats) {
        throw new Error("get_roster accepts either full=true or includeStats=true, not both.");
      }
      const tk = ctx.resolveTeamKey(teamKey);
      const d = date || today();
      const statsSuffix = includeStats ? ";out=stats" : "";
      const data = await ctx.client.get(`/team/${tk}/roster;date=${d}/players${statsSuffix}`);
      return jsonResult(
        full
          ? mapRosterFull(data)
          : includeStats
            ? mapRosterCompactWithStats(data)
            : mapRosterCompact(data),
      );
    },
  );

  server.registerTool(
    "get_team_stats",
    {
      title: "Get team stats",
      description:
        "Get a team's aggregated stats for a scoring week or the whole season. " +
        "Set period=week and provide week for a specific scoring week, or set " +
        "period=season for season totals.",
      inputSchema: {
        period: z
          .enum(["week", "season"])
          .describe("Stats period: week for one scoring week, or season for season totals"),
        week: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Week number; required only when period=week"),
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
      const data = await ctx.client.get(resource);
      return jsonResult(mapTeamStats(data));
    },
  );

  server.registerTool(
    "get_league_scoreboard",
    {
      title: "Get one league scoreboard week",
      description:
        "Get every head-to-head pairing in the league for exactly one scoring week. " +
        "It returns the schedule, score status, category winners, and team keys/names " +
        "only—no per-team matchup stats. Defaults to the current week. Use " +
        "get_team_matchup_history for detailed stats for one team's matchup.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key; defaults to configured league"),
        week: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("One scoring week; defaults to the current week"),
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
    "get_team_matchup_history",
    {
      title: "Get one team's detailed matchup history",
      description:
        "Get one team's season stats plus its matchup schedule and the weekly stats for " +
        "both teams in each pairing. Fetches all scoring weeks by default, or only " +
        "`weeks` when supplied. Use get_league_scoreboard instead to inspect every " +
        "pairing in one league week.",
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
    "search_players",
    {
      title: "Search players by name",
      description:
        "Find players by name (full or partial) and resolve them to player keys. " +
        "This is the way to turn a name the user typed into the `player_key` that " +
        "get_player_stats, analyze_player_stats, and any legacy Yahoo write tools need. " +
        "Returns name, position, eligible positions, injury status, and ownership " +
        "(free agent or owning team) — no stats. Optionally narrow by `status` " +
        "(e.g. FA to only see free agents) or `position` (e.g. SP, OF, 2B). Returns " +
        "up to 25 matches per call; page with `start`.",
      inputSchema: {
        name: z.string().min(1).describe("Player name to search for; full or partial"),
        leagueKey: z.string().optional().describe("League key; defaults to configured league"),
        status: z
          .enum(["A", "FA", "W", "T"])
          .optional()
          .describe(
            "Availability filter: A=available (free agents + waivers), FA=free agents, " +
              "W=on waivers, T=taken (rostered). Omit to search all players.",
          ),
        position: z.string().optional().describe("Position filter, e.g. SP, RP, C, 1B, OF, Util"),
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
    async ({ name, leagueKey, status, position, start, count }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const n = Math.min(count, 25);
      const filters = [
        // Encode only the name value (it may contain spaces); the semicolon
        // sub-resource separators must stay literal — see YahooClient docs.
        `search=${encodeURIComponent(name)}`,
        status ? `status=${status}` : null,
        position ? `position=${position}` : null,
        `start=${start}`,
        `count=${n}`,
      ]
        .filter(Boolean)
        .join(";");
      const data = await ctx.client.get(`/league/${lk}/players;${filters};out=ownership`);
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
