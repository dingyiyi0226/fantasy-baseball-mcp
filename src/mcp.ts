import type { Session } from "./app/session.js";
import type { ScoringCategory } from "./app/config.js";
import type { YahooClient } from "./yahoo/client.js";
import { fetchLeagueScoringCategories } from "./yahoo/league.js";
import { fetchGameStatCategories, type GameStatCategory } from "./yahoo/game.js";

export type { ScoringCategory };

/**
 * Shared application context for MCP tools. It delegates Yahoo state to the
 * live session so setup changes and configured defaults take effect without a
 * server restart.
 */
export class McpContext {
  private readonly gameStatCategoryRequests = new Map<string, Promise<GameStatCategory[]>>();

  constructor(private readonly session: Session) {}

  /** The Yahoo client, throwing a setup hint if Yahoo is not configured. */
  get yahoo(): YahooClient {
    return this.session.requireClient();
  }

  resolveLeagueKey(leagueKey?: string): string {
    return this.session.resolveLeagueKey(leagueKey);
  }

  resolveTeamKey(teamKey?: string): string {
    return this.session.resolveTeamKey(teamKey);
  }

  /** Return cached or freshly fetched scoring categories for a Yahoo league. */
  async getLeagueScoringCategories(leagueKey?: string): Promise<ScoringCategory[]> {
    try {
      const lk = this.session.resolveLeagueKey(leagueKey);
      const cached = this.session.getCachedLeagueScoringCategories(lk);
      if (cached) return cached;

      const categories = await fetchLeagueScoringCategories(this.yahoo, lk);
      await this.session.cacheLeagueScoringCategories(lk, categories);
      return categories;
    } catch {
      return [];
    }
  }

  /** Return game-wide stat definitions, fetching each game's stable dictionary once. */
  async getGameStatCategories(gameKey: string): Promise<GameStatCategory[]> {
    let request = this.gameStatCategoryRequests.get(gameKey);
    if (!request) {
      request = fetchGameStatCategories(this.yahoo, gameKey);
      this.gameStatCategoryRequests.set(gameKey, request);
    }
    try {
      return await request;
    } catch (error) {
      this.gameStatCategoryRequests.delete(gameKey);
      throw error;
    }
  }
}

/** Standard MCP text result carrying compact JSON. */
export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

/** Standard MCP result for human-readable text. */
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
