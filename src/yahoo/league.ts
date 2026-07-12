import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type McpContext } from "../mcp.js";
import type { ScoringCategory } from "../app/config.js";
import type { YahooClient } from "./client.js";
import { asArray, str } from "../util.js";
import { mapLeagueHeader, mapStatsTable } from "./mappers.js";

const READ_ONLY = { readOnlyHint: true } as const;

/** Fetch and normalize the scored stat categories for a league. */
export async function fetchLeagueScoringCategories(
  client: YahooClient,
  leagueKey: string,
): Promise<ScoringCategory[]> {
  const data = await client.get(`/league/${leagueKey}/settings`);
  const statList = asArray(data?.league?.settings?.stat_categories?.stats?.stat);

  return statList
    .filter((stat: any) => str(stat?.enabled) === "1")
    .map((stat: any) => ({
      statId: str(stat?.stat_id),
      displayName: str(stat?.display_name),
      positionType: str(stat?.position_type),
    }))
    .filter((category: ScoringCategory) => category.statId && category.displayName);
}

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
      teams: asArray(league.teams?.team).map((team: any) => ({
        team_key: team.team_key,
        name: team.name,
      })),
      settings,
      standings: asArray(league.standings?.teams?.team).map((team: any) => ({
        team_key: team.team_key,
        name: team.name,
        team_stats: mapStatsTable(team.team_stats),
        team_points: team.team_points,
        team_standings: team.team_standings,
      })),
    },
  };
}

/** Map the lightweight league-metadata response. */
export function mapLeagueMetadata(data: any) {
  const league = data?.league;
  if (!league) return data;

  return { league: mapLeagueHeader(league) };
}

/** Map the list_leagues response. */
export function mapListLeagues(data: any) {
  const games = asArray(data?.users?.user?.games?.game);
  return {
    games: games.map((game: any) => {
      const leagues = asArray(game.leagues?.league).map((league: any) => ({
        league_key: league.league_key,
        name: league.name,
      }));
      return {
        game_key: game.game_key,
        game_id: game.game_id,
        name: game.name,
        code: game.code,
        season: game.season,
        is_game_over: game.is_game_over,
        is_offseason: game.is_offseason,
        leagues: leagues.length ? leagues : undefined,
      };
    }),
  };
}

export function registerLeagueTools(server: McpServer, ctx: McpContext): void {
  // GET /users;use_login=1/games;out=leagues
  server.registerTool(
    "list_leagues",
    {
      title: "List my leagues",
      description:
        "List the league key and name for each fantasy league in the logged-in " +
        "Yahoo account. Call get_league for league details.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const data = await ctx.yahoo.get(
        "/users;use_login=1/games;out=leagues",
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
        "Get a league's settings and current standings, with each team limited to team_key " +
        "and name. Do not call this just to list teams; list_teams is sufficient for that. " +
        "Defaults to the configured league when leagueKey is omitted.",
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

  // GET /league/{leagueKey}
  server.registerTool(
    "get_league_metadata",
    {
      title: "Get league metadata",
      description:
        "Get lightweight league metadata such as the current matchup week and season dates. " +
        "Does not include teams, settings, or standings. Defaults to the configured league when " +
        "leagueKey is omitted.",
      inputSchema: {
        leagueKey: z.string().optional().describe("League key, e.g. 431.l.12345"),
      },
      annotations: READ_ONLY,
    },
    async ({ leagueKey }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const data = await ctx.yahoo.get(`/league/${lk}`);
      return jsonResult(mapLeagueMetadata(data));
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
