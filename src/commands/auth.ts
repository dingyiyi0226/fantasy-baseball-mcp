import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CONFIG_PATH } from "../app/config.js";
import { Session } from "../app/session.js";
import { listGames, type LeagueChoice } from "../yahoo/game.js";

export interface AuthFlags {
  clientId?: string;
  clientSecret?: string;
}

/**
 * One-time interactive terminal setup. The same flow is also available entirely
 * inside Claude/Codex via the `fantasy_*` tools; this command exists for users who
 * prefer the shell. Opens a local callback server on
 * localhost:8488, prints the Yahoo authorization URL, then waits for the browser
 * redirect to capture the code automatically.
 */
export async function runAuth(flags: AuthFlags): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const session = new Session();
    await session.init();

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
    await session.setCredentials(clientId, clientSecret);

    console.log("\n── Step 1: Authorize ──────────────────────────────────────");
    console.log("Open this URL in your browser, sign in, and allow access:\n");
    console.log(`  ${session.authorizeUrl()}\n`);
    console.log("Waiting for Yahoo to redirect to localhost… (up to 5 minutes)");

    await session.completeAuthorization();
    const choices = await listGames(session.requireClient());

    if (choices.length === 0) {
      console.log(
        "\nNo baseball leagues found for this account. Saved your credentials " +
          `to ${CONFIG_PATH}; you can set a default league/team later.`,
      );
      return;
    }

    console.log("\n── Step 2: Pick your default league ──────────────────────");
    choices.forEach((c, i) => printChoice(c, i));
    const pick = await promptIndex(rl, "\nSelect your default league", choices.length);
    const chosen = choices[pick];
    await session.setDefaults(chosen.leagueKey, chosen.teamKey);

    console.log("\n── Done ──────────────────────────────────────────────────");
    console.log(`Saved configuration to ${CONFIG_PATH}`);
    console.log(`  default league: ${chosen.leagueName} (${chosen.leagueKey})`);
    if (chosen.teamKey) {
      console.log(`  default team:   ${chosen.teamName} (${chosen.teamKey})`);
    } else {
      console.log("  (no owned team detected in this league)");
    }
    console.log("\nYou can now run the MCP server (`serve`) and connect it to Claude/Codex.");
  } finally {
    rl.close();
  }
}

function printChoice(c: LeagueChoice, i: number): void {
  const team = c.teamName ? ` — your team: ${c.teamName}` : "";
  console.log(`  [${i + 1}] ${c.leagueName} (${c.season})${team}`);
  console.log(
    `        league_key=${c.leagueKey}${c.teamKey ? `  team_key=${c.teamKey}` : ""}`,
  );
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
