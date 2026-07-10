import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type McpContext } from "../mcp.js";
import { asArray, today } from "../util.js";
import { mapLeagueHeader, mapPlayerProfile } from "./mappers.js";

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
  return {
    players: asArray(data?.players?.player).map((player: any) => ({
      ...mapPlayerProfile(player),
      player_stats: player.player_stats,
    })),
  };
}

export function mapRankPlayers(data: any) {
  const league = data?.league;
  if (!league) return data;
  return {
    league: mapLeagueHeader(league),
    players: asArray(league.players?.player).map((player: any) => ({
      ...mapPlayerProfile(player),
      ...(player.starting_status?.is_starting !== undefined
        ? { is_starting: player.starting_status.is_starting }
        : {}),
      ...(player.batting_order?.order_num !== undefined
        ? { batting_order: player.batting_order.order_num }
        : {}),
      ownership: mapOwnership(player.ownership),
      player_stats: player.player_stats,
      player_advanced_stats: player.player_advanced_stats,
    })),
  };
}

export function mapPlayerList(data: any) {
  const league = data?.league;
  if (!league) return data;
  return {
    league: mapLeagueHeader(league),
    players: asArray(league.players?.player).map((player: any) => ({
      ...mapPlayerProfile(player),
      ownership: mapOwnership(player.ownership),
    })),
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
