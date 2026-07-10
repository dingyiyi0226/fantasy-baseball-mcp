#!/usr/bin/env node
import { writeSync } from "node:fs";
import { runAuth } from "./commands/auth.js";
import { runServer } from "./server.js";

/**
 * Write to stderr synchronously. On Windows, writes to a pipe (which is how the
 * MCP host captures our stderr) are asynchronous, so the usual
 * `console.error(msg); process.exit(1)` loses the message when the process exits
 * before the write flushes — leaving startup crashes invisible in the host log.
 * fs.writeSync to fd 2 is synchronous on every platform.
 */
function logError(prefix: string, err: unknown): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  try {
    writeSync(2, `[fantasy-baseball-mcp] ${prefix}: ${detail}\n`);
  } catch {
    // Nothing more we can do if even stderr is gone.
  }
}

// Surface otherwise-silent startup failures (e.g. a dependency that fails to
// load, or a rejected promise during boot) instead of exiting with no output.
process.on("uncaughtException", (err) => {
  logError("uncaughtException", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  logError("unhandledRejection", err);
  process.exit(1);
});

const HELP = `fantasy-baseball-mcp — local MCP server for Yahoo Fantasy Baseball

Usage:
  fantasy-baseball-mcp auth [--client-id <id>] [--client-secret <secret>]
      One-time interactive setup: authorize with Yahoo and save your config.
      Credentials may also come from YF_CLIENT_ID / YF_CLIENT_SECRET env vars.

  fantasy-baseball-mcp serve        Run the MCP server over stdio (default).
  fantasy-baseball-mcp --help       Show this help.
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
  logError("fatal", err);
  process.exit(1);
});
