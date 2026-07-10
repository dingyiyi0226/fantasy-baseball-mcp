import type { YahooClient } from "../yahoo/client.js";
import type { ScoringCategory } from "../yahoo/config.js";
import type { Session } from "../yahoo/session.js";

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
