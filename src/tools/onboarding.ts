import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Session, LeagueChoice } from "../session.js";
import { textResult } from "./context.js";

const VERBATIM_PREFIX = `[Claude: output the text below verbatim — do not paraphrase, summarize, rewrite, or restructure any part of it]\n\n`;

const NETWORK_ALLOWLIST = `Heads up (Claude Desktop): Claude runs this extension in a sandbox
that blocks outbound network by default, so you must allow the sites it uses. Go to
**Settings → Capabilities** (Team/Enterprise: **Organization settings → Capabilities**),
find the network-access / **Additional allowed domains** list, and add:
  • statsapi.mlb.com           (MLB Stats API — for "analyze ...")
  • baseballsavant.mlb.com      (Statcast / expected stats — for "analyze ...")
  • www.fangraphs.com          (FanGraphs WAR/wRC+ — for "analyze ...")
The Yahoo domains (api.login.yahoo.com, fantasysports.yahooapis.com) are usually already
allowed by default — only add them if Yahoo sign-in fails to connect. The same allowlist
applies whether you use this in a normal chat or in Cowork. (Picking **All domains** also
works, but the list above is the minimum.)`;

const YAHOO_APP_TUTORIAL = `${VERBATIM_PREFIX}${NETWORK_ALLOWLIST}

To let Claude manage your team, you need your own free Yahoo "app"
(this is how Yahoo gives you permission keys). One-time, ~3 minutes:

1. Go to  https://developer.yahoo.com/apps/create/
   (sign in with the same Yahoo account that has your fantasy team).
2. Fill in the form:
   • Application Name: anything, e.g. "My Fantasy Helper"
   • Homepage URL:     https://localhost:8488  (placeholder)
   • Redirect URI(s):  https://localhost:8488/callback
   • OAuth Client Type: choose **Confidential Client**
   • API Permissions: tick **Fantasy Sports**, and choose **Read**
3. Click **Create App**. Yahoo shows you a **Client ID (Consumer Key)** and a
   **Client Secret (Consumer Secret)**.
4. Put those two values into this extension's settings
   (Claude → Settings → Extensions → Yahoo Fantasy Baseball),
   OR just paste them to me here and I'll save them securely.`;

function authorizeSteps(url: string): string {
  return `${VERBATIM_PREFIX}Your Yahoo credentials are saved. Final step to connect:

1. Open this link and click **Agree** to allow access:
   ${url}
2. Your browser will warn about a self-signed certificate — click **Advanced → Proceed to localhost** to continue.
3. Once you see **"Authorization complete!"**, come back here and say **"fantasy authorize"**.`;
}

function listLeagues(choices: LeagueChoice[]): string {
  return choices
    .map((c, i) => {
      const team = c.teamName ? ` — your team: ${c.teamName}` : "";
      return `  ${i + 1}. ${c.leagueName} (${c.season})${team}\n     leagueKey=${c.leagueKey}${
        c.teamKey ? `  teamKey=${c.teamKey}` : ""
      }`;
    })
    .join("\n");
}

/**
 * Register the in-chat onboarding tools. These let a non-technical user complete
 * Yahoo's OAuth entirely inside Claude — no terminal required.
 */
export function registerOnboardingTools(server: McpServer, session: Session): void {
  server.registerTool(
    "fantasy_status",
    {
      title: "Check setup status",
      description:
        "Report whether Yahoo Fantasy is set up and what the next step is. Use " +
        "this for 'fantasy status'.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      if (session.isConfigured()) {
        const league = session.defaultLeagueKey ?? "(none)";
        const team = session.defaultTeamKey ?? "(none set — say 'fantasy choose team')";
        return textResult(
          `✅ Set up and connected to Yahoo.\n` +
            `  default league: ${league}\n  default team:   ${team}\n\n` +
            `Try: "fantasy show roster", "fantasy my matchup", or "fantasy who should I add".`,
        );
      }
      if (session.hasCredentials()) {
        return textResult(
          "⚙️ Credentials saved but not authorized yet.\n\n" +
            authorizeSteps(session.authorizeUrl()),
        );
      }
      return textResult("🚦 Not set up yet.\n\n" + YAHOO_APP_TUTORIAL);
    },
  );

  server.registerTool(
    "fantasy_login",
    {
      title: "Log in / start setup",
      description:
        "Begin or resume setup ('fantasy login' / 'fantasy start'). Shows how to " +
        "create a Yahoo app if needed, and returns the authorization link once " +
        "credentials are known. Optionally pass clientId/clientSecret to save them.",
      inputSchema: {
        clientId: z.string().optional().describe("Yahoo Client ID (Consumer Key)"),
        clientSecret: z.string().optional().describe("Yahoo Client Secret (Consumer Secret)"),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ clientId, clientSecret }) => {
      if (clientId && clientSecret) {
        await session.setCredentials(clientId.trim(), clientSecret.trim());
      }
      if (session.isConfigured()) {
        return textResult(
          "You're already set up! Say \"fantasy show roster\" to begin, or " +
            '"fantasy status" to see your defaults. (To reconnect a different ' +
            'account, give me new Yahoo credentials.)',
        );
      }
      if (!session.hasCredentials()) {
        return textResult(YAHOO_APP_TUTORIAL);
      }
      return textResult(authorizeSteps(session.authorizeUrl()));
    },
  );

  server.registerTool(
    "fantasy_authorize",
    {
      title: "Finish authorization with a code",
      description:
        "Complete setup using the verification code Yahoo displayed after the user " +
        "approved access. Optionally also accepts clientId/clientSecret. On success " +
        "it lists the user's leagues and sets a default automatically when there is " +
        "only one.",
      inputSchema: {
        code: z.string().optional().describe("The verification code from Yahoo — leave blank if you clicked the authorization link (the code is captured automatically)"),
        clientId: z.string().optional().describe("Yahoo Client ID, if not already saved"),
        clientSecret: z.string().optional().describe("Yahoo Client Secret, if not already saved"),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ code, clientId, clientSecret }) => {
      if (clientId && clientSecret) {
        await session.setCredentials(clientId.trim(), clientSecret.trim());
      }
      const choices = await session.completeAuthorization(code?.trim());

      if (choices.length === 0) {
        return textResult(
          "Authorized successfully, but no baseball leagues were found on this " +
            "account. If you expected some, double-check you signed in with the " +
            "right Yahoo account.",
        );
      }
      if (choices.length === 1) {
        const only = choices[0];
        await session.setDefaults(only.leagueKey, only.teamKey);
        return textResult(
          `🎉 All set! Connected to "${only.leagueName}"` +
            (only.teamName ? ` and your team "${only.teamName}".` : ".") +
            `\n\nIf you have multiple teams in this league, just ask me to change the default team.` +
            `\n\nTry: "fantasy show roster".`,
        );
      }
      return textResult(
        "🎉 Authorized! You're in multiple leagues — which should be the default?\n\n" +
          listLeagues(choices) +
          '\n\nTell me the number (or league name) and I\'ll set it.',
      );
    },
  );

  server.registerTool(
    "fantasy_logout",
    {
      title: "Log out / disconnect Yahoo",
      description:
        "Delete the saved Yahoo Client ID, Client Secret, and refresh token, then " +
        "show the setup instructions again. Use this for 'fantasy logout' / " +
        "'fantasy disconnect' to reset and start over.",
      inputSchema: {},
      annotations: { readOnlyHint: false },
    },
    async () => {
      await session.removeCredentials();
      return textResult(
        "✅ Credentials removed. Yahoo Fantasy is no longer connected.\n\n" +
          YAHOO_APP_TUTORIAL,
      );
    },
  );

  server.registerTool(
    "fantasy_select_team",
    {
      title: "Set default league/team",
      description:
        "Set the default league (and your team in it) used when later commands " +
        "omit keys. Use for 'fantasy choose team'.",
      inputSchema: {
        leagueKey: z.string().describe("League key, e.g. 431.l.12345"),
        teamKey: z.string().optional().describe("Your team key, e.g. 431.l.12345.t.2"),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ leagueKey, teamKey }) => {
      await session.setDefaults(leagueKey.trim(), teamKey?.trim());
      return textResult(
        `Default set:\n  league: ${leagueKey}` +
          (teamKey ? `\n  team:   ${teamKey}` : "") +
          `\n\nIf you have multiple teams in this league, just ask me to change the default team.` +
          `\n\nTry: "fantasy show roster".`,
      );
    },
  );
}
