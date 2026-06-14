import type { Config } from "../config.js";
import { YahooClient } from "../yahooClient.js";

/**
 * Shared state handed to every tool: the API client plus the configured default
 * league/team so that "manage my team" works without the caller passing keys.
 */
export class ToolContext {
  constructor(
    public readonly client: YahooClient,
    private readonly config: Config,
  ) {}

  /** Use the provided league key, else the configured default, else error. */
  resolveLeagueKey(leagueKey?: string): string {
    const key = leagueKey || this.config.defaultLeagueKey;
    if (!key) {
      throw new Error(
        "No leagueKey provided and no default league configured. " +
          "Pass leagueKey or re-run `auth` to set a default.",
      );
    }
    return key;
  }

  /** Use the provided team key, else the configured default, else error. */
  resolveTeamKey(teamKey?: string): string {
    const key = teamKey || this.config.defaultTeamKey;
    if (!key) {
      throw new Error(
        "No teamKey provided and no default team configured. " +
          "Pass teamKey or re-run `auth` to set a default.",
      );
    }
    return key;
  }
}

/** Standard MCP text result carrying JSON for Claude to read. */
export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** Standard MCP text result for human-readable summaries (write tools). */
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
