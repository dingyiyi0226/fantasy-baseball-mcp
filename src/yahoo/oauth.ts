import axios, { isAxiosError } from "axios";
import type { Credentials } from "../app/config.js";
import { REDIRECT_URI } from "./callbackServer.js";

const TOKEN_ENDPOINT = "https://api.login.yahoo.com/oauth2/get_token";
export const AUTH_BASE = "https://api.login.yahoo.com/oauth2/request_auth";

/** Shape of the JSON body Yahoo returns from the token endpoint. */
interface YahooTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds, typically 3600
  token_type: string;
}

/** Build the authorization URL the user opens in their browser. */
export function buildAuthUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function postToken(
  clientId: string,
  clientSecret: string,
  body: Record<string, string>,
): Promise<YahooTokenResponse> {
  try {
    const res = await axios.post<YahooTokenResponse>(
      TOKEN_ENDPOINT,
      new URLSearchParams(body).toString(),
      {
        headers: {
          Authorization: `Basic ${basicAuthHeader(clientId, clientSecret)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
    return res.data;
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      const data = err.response.data;
      const detail =
        typeof data === "object" && data
          ? (data.error_description ?? data.error ?? JSON.stringify(data))
          : String(data);
      throw new Error(`Yahoo token request failed (${err.response.status}): ${detail}`);
    }
    throw err;
  }
}

/** Exchange a freshly-pasted authorization code for the first set of tokens. */
export function exchangeAuthCode(
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<YahooTokenResponse> {
  return postToken(clientId, clientSecret, {
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    code,
  });
}

/** Use a stored refresh token to mint a new access token. */
export function refreshTokens(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<YahooTokenResponse> {
  return postToken(clientId, clientSecret, {
    grant_type: "refresh_token",
    redirect_uri: REDIRECT_URI,
    refresh_token: refreshToken,
  });
}

/** Called when Yahoo rotates the refresh token, so the caller can persist it. */
export type RefreshTokenSink = (refreshToken: string) => Promise<void>;

/**
 * Caches the short-lived (~1h) access token in memory and refreshes it on demand.
 * Access tokens are never written to disk; only the long-lived refresh token is
 * persisted by the caller (and replaced if Yahoo rotates it).
 */
export class TokenManager {
  private accessToken: string | null = null;
  private expiresAt = 0; // epoch ms

  constructor(
    private readonly creds: Credentials,
    private refreshToken: string,
    private readonly onRefreshToken: RefreshTokenSink,
  ) {}

  /** Return a valid access token, refreshing if missing or near expiry. */
  async getAccessToken(): Promise<string> {
    // Refresh a little early (60s) to avoid races against the expiry boundary.
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }
    return this.forceRefresh();
  }

  /** Force a refresh regardless of cache. Used on a 401/token_expired retry. */
  async forceRefresh(): Promise<string> {
    const tokens = await refreshTokens(
      this.creds.clientId,
      this.creds.clientSecret,
      this.refreshToken,
    );
    this.accessToken = tokens.access_token;
    this.expiresAt = Date.now() + tokens.expires_in * 1000;

    // Persist a rotated refresh token so future runs keep working.
    if (tokens.refresh_token && tokens.refresh_token !== this.refreshToken) {
      this.refreshToken = tokens.refresh_token;
      await this.onRefreshToken(tokens.refresh_token);
    }
    return this.accessToken;
  }
}
