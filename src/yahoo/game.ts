import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type McpContext } from "../mcp.js";
import type { YahooClient } from "./client.js";
import { asArray, str } from "../util.js";

const READ_ONLY = { readOnlyHint: true } as const;

/** A baseball league plus the team the user owns in it (if any). */
export interface LeagueChoice {
  leagueKey: string;
  leagueName: string;
  season: string;
  teamKey?: string;
  teamName?: string;
}

/**
 * Find the user's baseball leagues and their team in each league. Yahoo returns
 * the login user's own teams when the games resource includes `out=teams`.
 */
export async function discoverLeagues(client: YahooClient): Promise<LeagueChoice[]> {
  const content = await client.get("/users;use_login=1/games;out=leagues,teams");
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
  return choices;
}

/** Map the complete get_game response. This endpoint is intentionally compact. */
export function mapGame(data: any) {
  const game = data?.game;
  if (!game) return data;

  return { game };
}

export function registerGameTools(server: McpServer, ctx: McpContext): void {
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
