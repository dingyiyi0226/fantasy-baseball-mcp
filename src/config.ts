import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Persistent, per-user configuration. Stored at ~/.yahoo-fantasy-mcp/config.json
 * with 0600 permissions. Holds the user's own Yahoo app credentials, a long-lived
 * refresh token, and the default league/team to operate on.
 *
 * Nothing here is ever shared or hosted: each user runs their own server locally.
 */
export interface Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  defaultLeagueKey?: string;
  defaultTeamKey?: string;
}

export const CONFIG_DIR = path.join(os.homedir(), ".yahoo-fantasy-mcp");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

/**
 * Load the saved config. Returns null when no config file exists yet so callers
 * can show a friendly "run auth first" message instead of a stack trace.
 */
export async function loadConfig(): Promise<Config | null> {
  let raw: string;
  try {
    raw = await fs.readFile(CONFIG_PATH, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }

  let parsed: Partial<Config>;
  try {
    parsed = JSON.parse(raw) as Partial<Config>;
  } catch {
    throw new Error(
      `Config at ${CONFIG_PATH} is not valid JSON. Re-run the \`auth\` command to recreate it.`,
    );
  }

  if (!parsed.clientId || !parsed.clientSecret || !parsed.refreshToken) {
    throw new Error(
      `Config at ${CONFIG_PATH} is missing required fields. Re-run the \`auth\` command.`,
    );
  }

  return parsed as Config;
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
 * Merge a partial update into the existing config and persist it. Used to store
 * a rotated refresh token returned by Yahoo during a refresh.
 */
export async function updateConfig(patch: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  if (!current) {
    throw new Error("No config to update. Run the `auth` command first.");
  }
  const next = { ...current, ...patch };
  await saveConfig(next);
  return next;
}
