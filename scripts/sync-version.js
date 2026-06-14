#!/usr/bin/env node
// Syncs the version from package.json into manifest.json and src/server.ts.
// Called automatically by the `postversion` npm hook.

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;

// --- manifest.json ---
const manifestPath = resolve(root, "manifest.json");
const manifest = readFileSync(manifestPath, "utf8");
const manifestRe = /("version"\s*:\s*")[^"]+(")/;
if (!manifestRe.test(manifest)) {
  console.error("manifest.json: version string not found — update manually.");
  process.exit(1);
}
writeFileSync(manifestPath, manifest.replace(manifestRe, (_, g1, g2) => `${g1}${version}${g2}`));
console.log(`manifest.json → ${version}`);

// --- src/server.ts ---
const serverPath = resolve(root, "src/server.ts");
const server = readFileSync(serverPath, "utf8");
const serverRe = /(name:\s*"yahoo-fantasy-baseball",\s*version:\s*")[^"]+(")/;
if (!serverRe.test(server)) {
  console.error("src/server.ts: version string not found — update manually.");
  process.exit(1);
}
const updated = server.replace(serverRe, (_, g1, g2) => `${g1}${version}${g2}`);
writeFileSync(serverPath, updated);
console.log(`src/server.ts  → ${version}`);
