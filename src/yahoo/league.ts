import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type McpContext } from "../mcp.js";
import { asArray } from "../util.js";
import { mapLeagueHeader, mapTeamSummary } from "./mappers.js";

const READ_ONLY = { readOnlyHint: true } as const;

/** Map the get_league response. */
export function mapLeague(data: any) {
  const league = data?.league;
  if (!league) return data;

  const settings = league.settings
    ? {
        draft_type: league.settings.draft_type,
        is_auction_draft: league.settings.is_auction_draft,
        scoring_type: league.settings.scoring_type,
        uses_playoff: league.settings.uses_playoff,
        playoff_start_week: league.settings.playoff_start_week,
        num_playoff_teams: league.settings.num_playoff_teams,
        uses_playoff_reseeding: league.settings.uses_playoff_reseeding,
        uses_lock_eliminated_teams: league.settings.uses_lock_eliminated_teams,
        num_playoff_consolation_teams: league.settings.num_playoff_consolation_teams,
        has_multiweek_championship: league.settings.has_multiweek_championship,
        waiver_type: league.settings.waiver_type,
        waiver_rule: league.settings.waiver_rule,
        uses_faab: league.settings.uses_faab,
        waiver_time: league.settings.waiver_time,
        max_weekly_adds: league.settings.max_weekly_adds,
        trade_end_date: league.settings.trade_end_date,
        trade_ratify_type: league.settings.trade_ratify_type,
        trade_reject_time: league.settings.trade_reject_time,
        player_pool: league.settings.player_pool,
        cant_cut_list: league.settings.cant_cut_list,
        uses_median_score: league.settings.uses_median_score,
        season_type: league.settings.season_type,
        min_innings_pitched: league.settings.min_innings_pitched,
        post_draft_players: league.settings.post_draft_players,
        roster_positions: asArray(league.settings.roster_positions?.roster_position).map(
          (position: any) => ({
            position: position.position,
            ...(position.position_type ? { position_type: position.position_type } : {}),
            count: position.count,
            is_starting_position: position.is_starting_position,
          }),
        ),
        stat_categories: asArray(league.settings.stat_categories?.stats?.stat).map(
          (stat: any) => ({
            stat_id: stat.stat_id,
            display_name: stat.display_name,
            position_type: stat.position_type,
            sort_order: stat.sort_order,
            ...(stat.is_only_display_stat ? { is_only_display_stat: 1 } : {}),
          }),
        ),
      }
    : undefined;

  return {
    league: {
      ...mapLeagueHeader(league),
      teams: asArray(league.teams?.team).map(mapTeamSummary),
      settings,
      standings: asArray(league.standings?.teams?.team).map((team: any) => ({
        team_key: team.team_key,
        name: team.name,
        team_stats: team.team_stats,
        team_points: team.team_points,
        team_standings: team.team_standings,
      })),
    },
  };
}

/** Map the list_leagues response. */
export function mapListLeagues(data: any) {
  const games = asArray(data?.users?.user?.games?.game);
  return {
    games: games.map((game: any) => {
      const leagues = asArray(game.leagues?.league).map(mapLeagueHeader);
      const gameWeeks = asArray(game.game_weeks?.game_week).map((week: any) => ({
        week: week.week,
        start: week.start,
        end: week.end,
      }));
      return {
        game_key: game.game_key,
        game_id: game.game_id,
        name: game.name,
        code: game.code,
        season: game.season,
        is_game_over: game.is_game_over,
        is_offseason: game.is_offseason,
        game_weeks: gameWeeks.length ? gameWeeks : undefined,
        leagues: leagues.length ? leagues : undefined,
      };
    }),
  };
}

export function registerLeagueTools(server: McpServer, ctx: McpContext): void {
  // GET /users;use_login=1/games;out=game_weeks,stat_categories,leagues
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
      const data = await ctx.yahoo.get(
        "/users;use_login=1/games;out=game_weeks,stat_categories,leagues",
      );
      return jsonResult(mapListLeagues(data));
    },
  );

  // GET /league/{leagueKey};out=teams,settings,standings
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
      const data = await ctx.yahoo.get(`/league/${lk};out=teams,settings,standings`);
      return jsonResult(mapLeague(data));
    },
  );

  // GET /league/{leagueKey}/settings (on cache miss)
  server.registerTool(
    "get_league_scoring_categories",
    {
      title: "Get league scoring categories",
      description:
        "Return the stat categories used for scoring in this league. Always call this " +
        "before giving roster add/drop advice so recommendations reflect what scores. " +
        "Results are cached because categories rarely change after league creation.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key; defaults to configured league"),
      },
      annotations: READ_ONLY,
    },
    async ({ leagueKey }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const categories = await ctx.getLeagueScoringCategories(leagueKey);
      const batting = categories.filter((c) => c.positionType === "B").map((c) => c.displayName);
      const pitching = categories.filter((c) => c.positionType === "P").map((c) => c.displayName);
      return jsonResult({ leagueKey: lk, batting, pitching });
    },
  );
}
