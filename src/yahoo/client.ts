import axios, { isAxiosError } from "axios";
import { XMLParser } from "fast-xml-parser";
import { TokenManager } from "./oauth.js";

export const BASE_URL = "https://fantasysports.yahooapis.com/fantasy/v2";

// Yahoo returns XML. We keep attributes off and let repeated elements collapse
// the same way the reference app consumed them (e.g. results.league.teams.team).
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });

/** True when an Axios error is Yahoo's "access token expired" 401. */
function isTokenExpired(err: unknown): boolean {
  if (!isAxiosError(err) || err.response?.status !== 401) return false;
  const data = err.response.data;
  const text = typeof data === "string" ? data : JSON.stringify(data ?? "");
  return text.includes("token_expired");
}

/** Map common Yahoo failure modes to clear, user-facing error messages. */
function toFriendlyError(err: unknown, resource: string): Error {
  if (isAxiosError(err) && err.response) {
    const status = err.response.status;
    if (status === 999) {
      return new Error(
        "Yahoo API rate limit hit (HTTP 999). Wait ~1 hour before trying again.",
      );
    }
    const data = err.response.data;
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    return new Error(`Yahoo API error ${status} for ${resource}: ${truncate(detail)}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function truncate(s: string, max = 400): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Thin wrapper over the Yahoo Fantasy Sports v2 REST API.
 *
 * `resource` arguments are the path segment after the base URL (e.g.
 * "/league/431.l.1.t.2/roster"). Yahoo's semicolon sub-resource separators are
 * literal and must NOT be URL-encoded, so callers pass already-built paths.
 *
 * Every request attaches a Bearer access token and transparently refreshes once
 * on a token_expired 401.
 */
export class YahooClient {
  constructor(private tokens: TokenManager) {}

  /** GET a resource and return the parsed `fantasy_content` node. */
  async get(resource: string): Promise<any> {
    return this.request("get", resource);
  }

  /** POST an XML body (used for transactions / add-drop). */
  async post(resource: string, xmlBody: string): Promise<any> {
    return this.request("post", resource, xmlBody);
  }

  /** PUT an XML body (used for roster / lineup changes). */
  async put(resource: string, xmlBody: string): Promise<any> {
    return this.request("put", resource, xmlBody);
  }

  private async request(
    method: "get" | "post" | "put",
    resource: string,
    xmlBody?: string,
    isRetry = false,
  ): Promise<any> {
    const url = `${BASE_URL}${resource}`;
    const accessToken = await this.tokens.getAccessToken();

    try {
      const res = await axios.request<string>({
        url,
        method,
        data: xmlBody,
        // Always get the raw XML string back so we parse it ourselves.
        responseType: "text",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(xmlBody ? { "Content-Type": "application/xml" } : {}),
        },
      });
      const parsed = parser.parse(res.data);
      return parsed?.fantasy_content ?? parsed;
    } catch (err) {
      if (isTokenExpired(err) && !isRetry) {
        await this.tokens.forceRefresh();
        return this.request(method, resource, xmlBody, true);
      }
      throw toFriendlyError(err, resource);
    }
  }
}
