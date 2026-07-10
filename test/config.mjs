/** Regression checks for current and legacy local config paths. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const home = mkdtempSync(path.join(os.tmpdir(), "fantasy-baseball-mcp-config-"));
const originalHome = process.env.HOME;
process.env.HOME = home;

try {
  const { CONFIG_PATH, LEGACY_CONFIG_PATH, loadConfig, saveConfig } = await import(
    "../dist/app/config.js"
  );
  const legacyConfig = { clientId: "legacy-id", refreshToken: "legacy-token" };

  mkdirSync(path.dirname(LEGACY_CONFIG_PATH), { recursive: true });
  writeFileSync(LEGACY_CONFIG_PATH, JSON.stringify(legacyConfig));
  assert.deepEqual(await loadConfig(), legacyConfig, "loads the legacy config when no current config exists");

  const currentConfig = { clientId: "current-id", refreshToken: "current-token" };
  await saveConfig(currentConfig);
  assert.equal(existsSync(CONFIG_PATH), true, "saves to the current config path");
  assert.deepEqual(JSON.parse(readFileSync(CONFIG_PATH, "utf8")), currentConfig);
  assert.deepEqual(await loadConfig(), currentConfig, "prefers the current config over the legacy config");

  console.log("  ok   config paths");
} finally {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
}
