import type { Session } from "../session.js";
import type { YahooClient } from "../yahooClient.js";
import type { ScoringCategory } from "../config.js";

export type { ScoringCategory };

/**
 * Thin adapter the read/write tools use. Delegates to the live Session so that
 * a tool called before setup gets a friendly "say fantasy start" error, and so
 * default league/team resolution always reflects the current config.
 */
export class ToolContext {
  constructor(private readonly session: Session) {}

  /** The Yahoo client, throwing a setup hint if not yet configured. */
  get client(): YahooClient {
    return this.session.requireClient();
  }

  resolveLeagueKey(leagueKey?: string): string {
    return this.session.resolveLeagueKey(leagueKey);
  }

  resolveTeamKey(teamKey?: string): string {
    return this.session.resolveTeamKey(teamKey);
  }

  /**
   * Return scoring categories for a league, using the config cache when
   * available. Pass undefined to fall back to the configured default league.
   * Returns an empty array if no league is configured or the fetch fails.
   */
  async getLeagueScoringCategories(leagueKey?: string): Promise<ScoringCategory[]> {
    try {
      const lk = this.session.resolveLeagueKey(leagueKey);
      return await this.session.getLeagueScoringCategories(lk);
    } catch {
      return [];
    }
  }
}

/** Standard MCP text result carrying JSON for Claude to read. */
export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** Standard MCP text result for human-readable summaries (write/onboarding tools). */
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
