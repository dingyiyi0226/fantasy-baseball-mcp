#!/usr/bin/env node
// Syncs the version from package.json into the Claude Desktop manifest
// (manifest.json), the Codex plugin manifest (.codex-plugin/plugin.json), and
// src/server.ts. Called automatically by the `postversion` npm hook.

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;

// Replace the first top-level `"version": "..."` in a JSON manifest.
function syncJsonVersion(relPath) {
  const path = resolve(root, relPath);
  const contents = readFileSync(path, "utf8");
  const re = /("version"\s*:\s*")[^"]+(")/;
  if (!re.test(contents)) {
    console.error(`${relPath}: version string not found — update manually.`);
    process.exit(1);
  }
  writeFileSync(path, contents.replace(re, (_, g1, g2) => `${g1}${version}${g2}`));
  console.log(`${relPath} → ${version}`);
}

// --- manifest.json (Claude Desktop) & .codex-plugin/plugin.json (Codex) ---
syncJsonVersion("manifest.json");
syncJsonVersion(".codex-plugin/plugin.json");

// --- src/server.ts ---
const serverPath = resolve(root, "src/server.ts");
const server = readFileSync(serverPath, "utf8");
const serverRe = /(export const VERSION = ")[^"]+(")/;
if (!serverRe.test(server)) {
  console.error("src/server.ts: version string not found — update manually.");
  process.exit(1);
}
const updated = server.replace(serverRe, (_, g1, g2) => `${g1}${version}${g2}`);
writeFileSync(serverPath, updated);
console.log(`src/server.ts  → ${version}`);
