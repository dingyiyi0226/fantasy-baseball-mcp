import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type McpContext } from "../mcp.js";
import type { YahooClient } from "./client.js";
import { asArray, str } from "../util.js";
import { mapRecordsTable } from "./mappers.js";

const READ_ONLY = { readOnlyHint: true } as const;

/** A Yahoo stat definition for one game (for example, 12 -> Home Runs in MLB). */
export interface GameStatCategory {
  stat_id: number;
  name?: string;
  display_name?: string;
  sort_order?: number;
  position_type?: string;
}

/** A baseball league plus the team the user owns in it (if any). */
export interface LeagueChoice {
  leagueKey: string;
  leagueName: string;
  season: string;
  teamKey?: string;
  teamName?: string;
}

/**
 * List the user's baseball leagues and their team in each league. Yahoo returns
 * the login user's own teams when the games resource includes `out=teams`.
 */
export async function listGames(client: YahooClient): Promise<LeagueChoice[]> {
  const content = await client.get("/users;use_login=1/games;out=leagues,teams");
  return mapListGames(content).leagues;
}

/** Map the list_games response to baseball leagues and their owned teams. */
export function mapListGames(data: any): { leagues: LeagueChoice[] } {
  const content = data;
  const games = asArray(content?.users?.user?.games?.game);

  const choices: LeagueChoice[] = [];
  for (const game of games) {
    if (str(game?.code) !== "mlb") continue;
    const season = str(game?.season);
    const ownedTeams = asArray(game?.teams?.team).map((team: any) => ({
      teamKey: str(team?.team_key),
      teamName: str(team?.name),
    }));
    for (const league of asArray(game?.leagues?.league)) {
      const leagueKey = str(league?.league_key);
      if (!leagueKey) continue;
      const owned = ownedTeams.find((team) => team.teamKey.startsWith(`${leagueKey}.t.`));
      choices.push({
        leagueKey,
        leagueName: str(league?.name) || leagueKey,
        season,
        teamKey: owned?.teamKey,
        teamName: owned?.teamName,
      });
    }
  }
  return { leagues: choices };
}

/** Map the complete get_game response. This endpoint is intentionally compact. */
export function mapGame(data: any) {
  const game = data?.game;
  if (!game) return data;

  return { game };
}

function mapGameStatCategoryRows(data: any): GameStatCategory[] {
  return asArray(data?.game?.stat_categories?.stats?.stat).map((stat: any) => ({
    stat_id: stat.stat_id,
    name: stat.name,
    display_name: stat.display_name,
    sort_order: stat.sort_order,
    position_type: stat.position_type,
  }));
}

/** Extract the game-scoped dictionary that gives meaning to player stat IDs. */
export function mapGameStatCategories(data: any) {
  const game = data?.game;
  if (!game) return data;
  return {
    game: {
      game_key: game.game_key,
      game_id: game.game_id,
      name: game.name,
      code: game.code,
      season: game.season,
    },
    stat_categories: mapRecordsTable(mapGameStatCategoryRows(data)),
  };
}

/** Fetch the stat-ID dictionary for a game. Stat IDs are not portable across sports. */
export async function fetchGameStatCategories(
  client: YahooClient,
  gameKey: string,
): Promise<GameStatCategory[]> {
  const data = await client.get(`/game/${gameKey}/stat_categories`);
  return mapGameStatCategoryRows(data);
}

export function registerGameTools(server: McpServer, ctx: McpContext): void {
  // GET /users;use_login=1/games;out=leagues,teams
  server.registerTool(
    "list_games",
    {
      title: "List my baseball games",
      description:
        "Discover the logged-in user's baseball leagues and the team they own in each. " +
        "Use this to choose a default league or team.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => jsonResult({ leagues: await listGames(ctx.yahoo) }),
  );

  // GET /game/{gameKey}
  server.registerTool(
    "get_game",
    {
      title: "Get game",
      description: "Get a fantasy game's details.",
      inputSchema: {
        gameKey: z.string().describe("Game key, e.g. 431"),
      },
      annotations: READ_ONLY,
    },
    async ({ gameKey }) => {
      const data = await ctx.yahoo.get(`/game/${gameKey}`);
      return jsonResult(mapGame(data));
    },
  );
}
