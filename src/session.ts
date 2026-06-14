import {
  loadConfig,
  updateConfig,
  resolveCredentials,
  type Config,
  type Credentials,
  type ScoringCategory,
} from "./config.js";
import { exchangeAuthCode, buildAuthUrl, TokenManager } from "./tokenManager.js";
import { startCallbackServer } from "./callbackServer.js";
import { YahooClient } from "./yahooClient.js";
import { asArray, str } from "./util.js";

/** A baseball league plus the team the user owns in it (if any). */
export interface LeagueChoice {
  leagueKey: string;
  leagueName: string;
  season: string;
  teamKey?: string;
  teamName?: string;
}

const NOT_SET_UP =
  "Yahoo Fantasy isn't set up yet. Say `fantasy start` to begin setup.";

/**
 * Holds the live state of the server: the saved config and a Yahoo client built
 * from it. The client is rebuilt whenever credentials change, so in-chat setup
 * takes effect immediately without restarting the server.
 */
export class Session {
  private config: Config | null = null;
  private client: YahooClient | null = null;
  private pendingCode: Promise<string> | null = null;

  /** Load config from disk and (re)build the client. Call once at startup. */
  async init(): Promise<void> {
    this.config = await loadConfig();
    this.rebuild();
  }

  private rebuild(): void {
    const creds = resolveCredentials(this.config);
    if (creds && this.config?.refreshToken) {
      const tokens = new TokenManager(
        creds,
        this.config.refreshToken,
        async (refreshToken) => {
          this.config = await updateConfig({ refreshToken });
        },
      );
      this.client = new YahooClient(tokens);
    } else {
      this.client = null;
    }
  }

  /** True once we have credentials and a refresh token — i.e. ready to call Yahoo. */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /** True when we have the Yahoo app credentials (but maybe not yet authorized). */
  hasCredentials(): boolean {
    return resolveCredentials(this.config) !== null;
  }

  get defaultLeagueKey(): string | undefined {
    return this.config?.defaultLeagueKey;
  }

  get defaultTeamKey(): string | undefined {
    return this.config?.defaultTeamKey;
  }

  /** The Yahoo client, or a friendly setup error if not configured. */
  requireClient(): YahooClient {
    if (!this.client) throw new Error(NOT_SET_UP);
    return this.client;
  }

  resolveLeagueKey(leagueKey?: string): string {
    if (!this.isConfigured()) throw new Error(NOT_SET_UP);
    const key = leagueKey || this.config?.defaultLeagueKey;
    if (!key) {
      throw new Error(
        "No leagueKey provided and no default league set. Pass leagueKey, or say " +
          "`fantasy choose team` to pick a default.",
      );
    }
    return key;
  }

  resolveTeamKey(teamKey?: string): string {
    if (!this.isConfigured()) throw new Error(NOT_SET_UP);
    const key = teamKey || this.config?.defaultTeamKey;
    if (!key) {
      throw new Error(
        "No teamKey provided and no default team set. Pass teamKey, or say " +
          "`fantasy choose team` to pick a default.",
      );
    }
    return key;
  }

  // ---- league scoring categories -------------------------------------------

  /**
   * Return the scored stat categories for a league. Checks the persisted config
   * cache first; fetches from Yahoo and caches on miss. Categories rarely change
   * after a league is created, so a single disk write is the normal cost.
   */
  async getLeagueScoringCategories(leagueKey: string): Promise<ScoringCategory[]> {
    const cached = this.config?.scoringCategories?.[leagueKey];
    if (cached && cached.length > 0) return cached;

    const data = await this.requireClient().get(`/league/${leagueKey}/settings`);
    const statList = asArray(data?.league?.settings?.stat_categories?.stats?.stat);

    const categories: ScoringCategory[] = statList
      .filter((s: any) => str(s?.enabled) === "1")
      .map((s: any) => ({
        statId: str(s?.stat_id),
        displayName: str(s?.display_name),
        positionType: str(s?.position_type),
      }))
      .filter((c: ScoringCategory) => c.statId && c.displayName);

    const existing = this.config?.scoringCategories ?? {};
    this.config = await updateConfig({
      scoringCategories: { ...existing, [leagueKey]: categories },
    });

    return categories;
  }

  // ---- onboarding mutations -------------------------------------------------

  /** Remove stored credentials, refresh token, and league/team defaults, reverting to the unconfigured state. */
  async removeCredentials(): Promise<void> {
    this.config = await updateConfig({
      clientId: undefined,
      clientSecret: undefined,
      refreshToken: undefined,
      defaultLeagueKey: undefined,
      defaultTeamKey: undefined,
      scoringCategories: undefined,
    });
    this.rebuild();
  }

  /** Store the Yahoo app credentials (and rebuild the client if possible). */
  async setCredentials(clientId: string, clientSecret: string): Promise<void> {
    this.config = await updateConfig({ clientId, clientSecret });
    this.rebuild();
  }

  /** The browser authorization URL for the configured/env client id. Also starts
   *  the local callback server so Yahoo's redirect is captured automatically. */
  authorizeUrl(): string {
    const creds = resolveCredentials(this.config);
    if (!creds) {
      throw new Error(
        "Missing Yahoo Client ID/Secret. Provide them first (extension settings " +
          "or `fantasy setup`).",
      );
    }
    if (!this.pendingCode) {
      this.pendingCode = startCallbackServer().catch((err) => {
        this.pendingCode = null;
        throw err;
      });
    }
    return buildAuthUrl(creds.clientId);
  }

  /**
   * Exchange an authorization code for tokens, persist the refresh token,
   * rebuild the client, and return the discovered leagues so the caller can pick
   * a default. If no code is provided, waits for the local callback server to
   * capture it from Yahoo's redirect.
   */
  async completeAuthorization(code?: string): Promise<LeagueChoice[]> {
    const creds = resolveCredentials(this.config);
    if (!creds) {
      throw new Error(
        "Missing Yahoo Client ID/Secret. Provide them before authorizing.",
      );
    }
    let authCode: string;
    if (code) {
      authCode = code;
    } else if (this.pendingCode) {
      authCode = await this.pendingCode;
      this.pendingCode = null;
    } else {
      throw new Error(
        "No authorization code. Click the authorization link first, then say `fantasy authorize`.",
      );
    }
    const tokens = await exchangeAuthCode(creds.clientId, creds.clientSecret, authCode);
    if (!tokens.refresh_token) {
      throw new Error(
        "Yahoo did not return a refresh token. Make sure your app has the " +
          "Fantasy Sports read/write permission, then try again.",
      );
    }
    this.config = await updateConfig({ refreshToken: tokens.refresh_token });
    this.rebuild();
    return this.discoverLeagues();
  }

  /** Persist the chosen default league/team. */
  async setDefaults(leagueKey: string, teamKey?: string): Promise<void> {
    this.config = await updateConfig({
      defaultLeagueKey: leagueKey,
      defaultTeamKey: teamKey,
    });
    this.rebuild();
  }

  /**
   * Fetch the user's baseball leagues and the team they own in each. Yahoo
   * returns the login user's own teams under `;out=teams`, so a team whose key
   * is prefixed by a league key is that user's team in that league.
   */
  async discoverLeagues(): Promise<LeagueChoice[]> {
    const client = this.requireClient();
    const content = await client.get("/users;use_login=1/games;out=leagues,teams");
    const games = asArray(content?.users?.user?.games?.game);

    const choices: LeagueChoice[] = [];
    for (const game of games) {
      if (str(game?.code) !== "mlb") continue;
      const season = str(game?.season);
      const ownedTeams = asArray(game?.teams?.team).map((t: any) => ({
        teamKey: str(t?.team_key),
        teamName: str(t?.name),
      }));
      for (const league of asArray(game?.leagues?.league)) {
        const leagueKey = str(league?.league_key);
        if (!leagueKey) continue;
        const owned = ownedTeams.find((t) => t.teamKey.startsWith(`${leagueKey}.t.`));
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
}
