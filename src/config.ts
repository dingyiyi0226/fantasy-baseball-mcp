import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Persistent, per-user configuration. Stored at ~/.yahoo-fantasy-mcp/config.json
 * with 0600 permissions. Holds the user's own Yahoo app credentials, a long-lived
 * refresh token, and the default league/team to operate on.
 *
 * Every field is optional because setup happens incrementally (and credentials
 * may instead arrive via environment variables, e.g. from the desktop extension
 * settings form). Nothing here is ever shared or hosted: each user runs their
 * own server locally.
 */
export interface Config {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  defaultLeagueKey?: string;
  defaultTeamKey?: string;
}

/** A resolved Yahoo app credential pair (from config file or environment). */
export interface Credentials {
  clientId: string;
  clientSecret: string;
}

export const CONFIG_DIR = path.join(os.homedir(), ".yahoo-fantasy-mcp");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

/**
 * Load the saved config, or null when no file exists yet. Does not throw on
 * missing fields — callers decide what is "configured enough" to operate.
 */
export async function loadConfig(): Promise<Config | null> {
  let raw: string;
  try {
    raw = await fs.readFile(CONFIG_PATH, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }

  try {
    return JSON.parse(raw) as Config;
  } catch {
    throw new Error(
      `Config at ${CONFIG_PATH} is not valid JSON. Delete it and run setup again.`,
    );
  }
}

/**
 * Resolve the Yahoo app credentials, preferring the saved config and falling
 * back to YF_CLIENT_ID / YF_CLIENT_SECRET (set by the desktop extension form or
 * the shell). Returns null when either half is missing.
 */
export function resolveCredentials(config: Config | null): Credentials | null {
  const clientId = clean(config?.clientId) ?? clean(process.env.YF_CLIENT_ID);
  const clientSecret = clean(config?.clientSecret) ?? clean(process.env.YF_CLIENT_SECRET);
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

/**
 * Treat blank or unsubstituted-template values as missing. When the desktop
 * extension is installed without filling the settings form, the client may pass
 * the literal "${user_config.client_id}" as the env value.
 */
function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("${")) return undefined;
  return trimmed;
}

/**
 * Write the config, creating the directory and locking the file to 0600 so the
 * stored credentials are only readable by the current user.
 */
export async function saveConfig(config: Config): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  // writeFile only applies mode when creating; enforce it on existing files too.
  await fs.chmod(CONFIG_PATH, 0o600);
}

/**
 * Merge a partial update into the existing config (or an empty one) and persist
 * it. Used during incremental setup and to store a rotated refresh token.
 */
export async function updateConfig(patch: Partial<Config>): Promise<Config> {
  const current = (await loadConfig()) ?? {};
  const next = { ...current, ...patch };
  await saveConfig(next);
  return next;
}
