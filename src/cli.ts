#!/usr/bin/env node
import { runAuth } from "./auth.js";
import { runServer } from "./server.js";

const HELP = `yahoo-fantasy-baseball-mcp — local MCP server for Yahoo Fantasy Baseball

Usage:
  yahoo-fantasy-mcp auth [--client-id <id>] [--client-secret <secret>]
      One-time interactive setup: authorize with Yahoo and save your config.
      Credentials may also come from YF_CLIENT_ID / YF_CLIENT_SECRET env vars.

  yahoo-fantasy-mcp serve        Run the MCP server over stdio (default).
  yahoo-fantasy-mcp --help       Show this help.
`;

/** Minimal flag parser: supports "--key value" and "--key=value". */
function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[arg.slice(2)] = next;
        i++;
      } else {
        flags[arg.slice(2)] = "true";
      }
    }
  }
  return flags;
}

async function main(): Promise<void> {
  const [, , rawCommand, ...rest] = process.argv;
  const command = rawCommand ?? "serve";

  if (command === "-h" || command === "--help" || command === "help") {
    process.stdout.write(HELP);
    return;
  }

  switch (command) {
    case "auth": {
      const flags = parseFlags(rest);
      await runAuth({
        clientId: flags["client-id"],
        clientSecret: flags["client-secret"],
      });
      break;
    }
    case "serve":
      await runServer();
      break;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
