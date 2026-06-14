import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { buildAuthUrl, exchangeAuthCode, TokenManager } from "./tokenManager.js";
import { saveConfig, CONFIG_PATH, type Config } from "./config.js";
import { YahooClient } from "./yahooClient.js";
import { asArray, str } from "./util.js";

export interface AuthFlags {
  clientId?: string;
  clientSecret?: string;
}

interface LeagueChoice {
  leagueKey: string;
  leagueName: string;
  season: string;
  teamKey?: string;
  teamName?: string;
}

/**
 * One-time interactive setup. Walks the user through Yahoo's out-of-band OAuth
 * flow, discovers their baseball leagues and the team they own in each, and
 * saves everything to ~/.yahoo-fantasy-mcp/config.json.
 */
export async function runAuth(flags: AuthFlags): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const clientId =
      flags.clientId ||
      process.env.YF_CLIENT_ID ||
      (await rl.question("Yahoo Client ID (Consumer Key): ")).trim();
    const clientSecret =
      flags.clientSecret ||
      process.env.YF_CLIENT_SECRET ||
      (await rl.question("Yahoo Client Secret (Consumer Secret): ")).trim();

    if (!clientId || !clientSecret) {
      throw new Error("Both Client ID and Client Secret are required.");
    }

    console.log("\n── Step 1: Authorize ──────────────────────────────────────");
    console.log("Open this URL in your browser, sign in, and allow access:\n");
    console.log(`  ${buildAuthUrl(clientId)}\n`);
    console.log("Yahoo will then display a short verification code.");
    const code = (await rl.question("\nPaste the verification code here: ")).trim();
    if (!code) throw new Error("No verification code entered.");

    console.log("\nExchanging code for tokens…");
    const tokens = await exchangeAuthCode(clientId, clientSecret, code);
    if (!tokens.refresh_token) {
      throw new Error(
        "Yahoo did not return a refresh token. Make sure your app has the " +
          "Fantasy Sports (read/write) permission and try again.",
      );
    }

    // Persist the minimum config so the token manager can rotate-and-save later.
    let config: Config = {
      clientId,
      clientSecret,
      refreshToken: tokens.refresh_token,
    };
    await saveConfig(config);

    const tokenManager = new TokenManager(config);
    const client = new YahooClient(tokenManager);

    console.log("\n── Step 2: Discover your leagues ─────────────────────────");
    const choices = await fetchLeagueChoices(client);
    if (choices.length === 0) {
      console.log(
        "\nNo baseball leagues found for this Yahoo account. Saved your " +
          `credentials to ${CONFIG_PATH}; you can set league/team keys later.`,
      );
      return;
    }

    choices.forEach((c, i) => {
      const team = c.teamName ? ` — your team: ${c.teamName}` : "";
      console.log(`  [${i + 1}] ${c.leagueName} (${c.season})${team}`);
      console.log(`        league_key=${c.leagueKey}${c.teamKey ? `  team_key=${c.teamKey}` : ""}`);
    });

    const pick = await promptIndex(rl, "\nSelect your default league", choices.length);
    const chosen = choices[pick];

    config = {
      ...config,
      defaultLeagueKey: chosen.leagueKey,
      defaultTeamKey: chosen.teamKey,
    };
    await saveConfig(config);

    console.log("\n── Done ──────────────────────────────────────────────────");
    console.log(`Saved configuration to ${CONFIG_PATH}`);
    console.log(`  default league: ${chosen.leagueName} (${chosen.leagueKey})`);
    if (chosen.teamKey) {
      console.log(`  default team:   ${chosen.teamName} (${chosen.teamKey})`);
    } else {
      console.log("  (no owned team detected in this league)");
    }
    console.log("\nYou can now run the MCP server (`serve`) and connect it to Claude.");
  } finally {
    rl.close();
  }
}

/**
 * Pull the user's baseball leagues plus the team they own in each. Yahoo returns
 * the login user's own teams under `;out=teams`, so a team whose key is prefixed
 * by a league key is that user's team in that league.
 */
async function fetchLeagueChoices(client: YahooClient): Promise<LeagueChoice[]> {
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

async function promptIndex(
  rl: readline.Interface,
  label: string,
  count: number,
): Promise<number> {
  while (true) {
    const answer = (await rl.question(`${label} [1-${count}]: `)).trim();
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= count) return n - 1;
    console.log(`Please enter a number between 1 and ${count}.`);
  }
}
