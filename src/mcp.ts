import type { Session } from "./app/session.js";
import type { ScoringCategory } from "./app/config.js";
import type { YahooClient } from "./yahoo/client.js";

export type { ScoringCategory };

/**
 * Shared application context for MCP tools. It delegates Yahoo state to the
 * live session so setup changes and configured defaults take effect without a
 * server restart.
 */
export class McpContext {
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
      return await this.session.getLeagueScoringCategories(lk);
    } catch {
      return [];
    }
  }
}

/** Standard MCP text result carrying formatted JSON. */
export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** Standard MCP result for human-readable text. */
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
