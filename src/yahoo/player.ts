import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type McpContext } from "../mcp.js";
import { asArray, today } from "../util.js";
import { liftStatsTable, mapPlayerProfile, mapPlayerStatsProfile, mapRecordsTable } from "./mappers.js";
import { gameIdFromLeagueKey } from "./utils.js";
import type { GameStatCategory } from "./game.js";

const READ_ONLY = { readOnlyHint: true } as const;

function mapOwnership(ownership: any) {
  if (!ownership) return undefined;
  return {
    ownership_type: ownership.ownership_type,
    ...(ownership.owner_team_key ? { owner_team_key: ownership.owner_team_key } : {}),
    ...(ownership.owner_team_name ? { owner_team_name: ownership.owner_team_name } : {}),
  };
}

export function mapPlayerStats(data: any) {
  const players = asArray(data?.players?.player).map((player: any) => ({
    ...mapPlayerStatsProfile(player),
    ...liftStatsTable("player_stats", player.player_stats),
  }));
  return {
    players: mapRecordsTable(players),
  };
}

export function mapRankPlayers(data: any) {
  const league = data?.league;
  if (!league) return data;
  const players = asArray(league.players?.player).map((player: any) => {
    const profile = mapPlayerStatsProfile(player);
    const { player_id: _playerId, ...profileWithoutPlayerId } = profile;
    return {
      ...profileWithoutPlayerId,
      ...(player.starting_status?.is_starting !== undefined
        ? { is_starting: player.starting_status.is_starting }
        : {}),
      ownership: mapOwnership(player.ownership),
      ...liftStatsTable("player_stats", player.player_stats),
      ...liftStatsTable("player_advanced_stats", player.player_advanced_stats),
    };
  });
  return {
    league: { league_key: league.league_key, name: league.name },
    players: mapRecordsTable(players),
  };
}

/** Lift game-wide player stats while preserving Yahoo's stat-category labels. */
function liftStatsWithCategories(playerStats: any, categoriesById: Map<number, GameStatCategory>) {
  return liftStatsTable(
    "player_stats",
    playerStats,
    ["stat_id", "name", "display_name", "value"],
    (stat: any) => {
      const category = categoriesById.get(stat.stat_id);
      return {
        stat_id: stat.stat_id,
        name: category?.name,
        display_name: category?.display_name,
        value: stat.value,
      };
    },
  );
}

export function mapGameRankPlayers(data: any, statCategories: GameStatCategory[] = []) {
  const game = data?.game;
  if (!game) return data;
  const categoriesById = new Map(statCategories.map((category) => [category.stat_id, category]));
  const players = asArray(game.players?.player).map((player: any) => ({
    ...mapPlayerStatsProfile(player),
    ...liftStatsWithCategories(player.player_stats, categoriesById),
    ...liftStatsTable("player_advanced_stats", player.player_advanced_stats),
  }));
  return {
    game: {
      game_key: game.game_key,
      game_id: game.game_id,
      name: game.name,
      code: game.code,
      season: game.season,
    },
    players: mapRecordsTable(players),
  };
}

export function mapPlayerList(data: any) {
  const league = data?.league;
  if (!league) return data;
  const players = asArray(league.players?.player).map((player: any) => ({
    ...mapPlayerProfile(player),
    ownership: mapOwnership(player.ownership),
  }));
  return {
    league: { league_key: league.league_key, name: league.name },
    players: mapRecordsTable(players),
  };
}

const paginationSchema = {
  start: z.number().int().min(0).default(0).describe("Pagination offset"),
  count: z.number().int().min(1).max(25).default(25).describe("Number to return (max 25)"),
};

const rankingSchema = {
  leagueKey: z.string().optional().describe("League key; defaults to configured league"),
  sort: z.string().default("AR").describe("Stat id, or AR / OR / PTS"),
  sortType: z
    .enum(["season", "lastweek", "lastmonth", "date"])
    .default("season")
    .describe("Ranking window"),
  ...paginationSchema,
};

const freeAgentBatterRankingSchema = {
  leagueKey: z.string().optional().describe("League key; defaults to configured league"),
  sort: z.string().default("AR").describe("Batting stat id, or AR / OR / PTS"),
  period: z
    .enum(["lastweek", "lastmonth"])
    .default("lastweek")
    .describe("Recent Yahoo stat window to rank and return"),
  ...paginationSchema,
};

export function freeAgentBatterRankingResource(
  leagueKey: string,
  sort: string,
  period: "lastweek" | "lastmonth",
  start: number,
  count: number,
): string {
  return (
    `/league/${leagueKey}/players;status=FA;position=B;sort=${sort};sort_type=${period};` +
    `start=${start};count=${Math.min(count, 25)};out=ownership/stats;type=${period}`
  );
}

export function registerPlayerTools(server: McpServer, ctx: McpContext): void {
  // GET /players;player_keys={playerKeys}/stats;type=date;date={date}
  server.registerTool(
    "get_player_stats",
    {
      title: "Get player stats by date",
      description: "Get stats for one or more players on a specific date.",
      inputSchema: {
        playerKeys: z.array(z.string()).min(1).describe("Player keys, e.g. 431.p.10642"),
        date: z.string().optional().describe("Date as YYYY-MM-DD; defaults to today"),
      },
      annotations: READ_ONLY,
    },
    async ({ playerKeys, date }) => {
      const statDate = date || today();
      const data = await ctx.yahoo.get(
        `/players;player_keys=${playerKeys.join(",")}/stats;type=date;date=${statDate}`,
      );
      return jsonResult(mapPlayerStats(data));
    },
  );

  // GET /league/{leagueKey}/players;sort={sort};sort_type={sortType};...;out=ownership,stats
  server.registerTool(
    "rank_players",
    {
      title: "Rank / search players",
      description:
        "Rank league players, including free agents, by a stat or ranking key. " +
        "Returns ownership and stats, with up to 25 players per call.",
      inputSchema: rankingSchema,
      annotations: READ_ONLY,
    },
    async ({ leagueKey, sort, sortType, start, count }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const data = await ctx.yahoo.get(
        `/league/${lk}/players;sort=${sort};sort_type=${sortType};start=${start};count=${Math.min(count, 25)};out=ownership,stats`,
      );
      return jsonResult(mapRankPlayers(data));
    },
  );

  // GET /league/{leagueKey}/players;status=FA;position=B;...;out=ownership/stats;type={period}
  server.registerTool(
    "rank_free_agent_batters",
    {
      title: "Rank free-agent batters",
      description:
        "Rank only free-agent batters in a league by recent Yahoo performance. " +
        "Returns ownership, eligibility, same-day starting status when available, and the actual " +
        "last-week or last-month stat values used for the ranking.",
      inputSchema: freeAgentBatterRankingSchema,
      annotations: READ_ONLY,
    },
    async ({ leagueKey, sort, period, start, count }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const data = await ctx.yahoo.get(
        freeAgentBatterRankingResource(lk, sort, period, start, count),
      );
      return jsonResult(mapRankPlayers(data));
    },
  );

  // GET /game/{gameKey}/players;sort={sort};sort_type={sortType};...;out=stats
  server.registerTool(
    "rank_game_players",
    {
      title: "Rank all Yahoo baseball players",
      description:
        "Rank the current game's player pool by a Yahoo stat or ranking key. " +
        "Unlike rank_players, this is not league-specific: it has no ownership, waiver, " +
        "or custom league-scoring context, and returns up to 25 players per call.",
      inputSchema: {
        gameKey: z
          .string()
          .optional()
          .describe("Yahoo game key; defaults to the game from the configured league"),
        sort: z.string().default("AR").describe("Stat id, or AR / OR / PTS"),
        sortType: z
          .enum(["season", "lastweek", "lastmonth", "date"])
          .default("season")
          .describe("Ranking window"),
        ...paginationSchema,
      },
      annotations: READ_ONLY,
    },
    async ({ gameKey, sort, sortType, start, count }) => {
      const gk = gameKey ?? gameIdFromLeagueKey(ctx.resolveLeagueKey());
      const [data, statCategories] = await Promise.all([
        ctx.yahoo.get(
          `/game/${gk}/players;sort=${sort};sort_type=${sortType};start=${start};count=${Math.min(count, 25)};out=stats`,
        ),
        ctx.getGameStatCategories(gk),
      ]);
      return jsonResult(mapGameRankPlayers(data, statCategories));
    },
  );

  // GET /league/{leagueKey}/players;sort={sort};sort_type={sortType};...;out=ownership
  server.registerTool(
    "list_players",
    {
      title: "List / browse players",
      description:
        "List league players with identity, positions, status, and ownership but no stats. " +
        "Returns up to 25 players per call.",
      inputSchema: rankingSchema,
      annotations: READ_ONLY,
    },
    async ({ leagueKey, sort, sortType, start, count }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const data = await ctx.yahoo.get(
        `/league/${lk}/players;sort=${sort};sort_type=${sortType};start=${start};count=${Math.min(count, 25)};out=ownership`,
      );
      return jsonResult(mapPlayerList(data));
    },
  );

  // GET /league/{leagueKey}/players;search={name};...;out=ownership
  server.registerTool(
    "search_players",
    {
      title: "Search players by name",
      description:
        "Find players by full or partial name and resolve them to Yahoo player keys. " +
        "Optionally filter by availability or position.",
      inputSchema: {
        name: z.string().min(1).describe("Player name to search for; full or partial"),
        leagueKey: z.string().optional().describe("League key; defaults to configured league"),
        status: z
          .enum(["A", "FA", "W", "T"])
          .optional()
          .describe("A=available, FA=free agent, W=waivers, T=taken"),
        position: z.string().optional().describe("Position filter, e.g. SP, RP, C, 1B, OF"),
        ...paginationSchema,
      },
      annotations: READ_ONLY,
    },
    async ({ name, leagueKey, status, position, start, count }) => {
      const lk = ctx.resolveLeagueKey(leagueKey);
      const filters = [
        `search=${encodeURIComponent(name)}`,
        status ? `status=${status}` : null,
        position ? `position=${position}` : null,
        `start=${start}`,
        `count=${Math.min(count, 25)}`,
      ]
        .filter(Boolean)
        .join(";");
      const data = await ctx.yahoo.get(`/league/${lk}/players;${filters};out=ownership`);
      return jsonResult(mapPlayerList(data));
    },
  );
}
