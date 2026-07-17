#!/usr/bin/env node
// Keeps package descriptions aligned across npm, Claude Desktop, and Codex.

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

if (process.argv.some((argument) => argument !== "--check" && argument !== process.argv[0] && argument !== process.argv[1])) {
  console.error("Usage: node scripts/sync-metadata.js [--check]");
  process.exit(1);
}

function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(root, relPath), "utf8"));
}

function readLongDescription() {
  const readme = readFileSync(resolve(root, "README.md"), "utf8");
  const beforeContents = readme.split("\n## Contents", 1)[0];
  const withoutTitle = beforeContents.replace(/^# [^\n]+\n+/, "");
  if (withoutTitle === beforeContents) {
    throw new Error("README title was not found.");
  }

  const withoutBadge = withoutTitle.replace(/^(?:\[[^\n]+\]\([^\n]+\)\s*\n)+/, "");
  if (withoutBadge === withoutTitle) {
    throw new Error("README npm badge was not found.");
  }

  return withoutBadge
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .join("\n\n");
}

const shortDescription = readJson("package.json").description;
const longDescription = readLongDescription();
const updates = [
  ["manifest.json", "description", shortDescription],
  ["manifest.json", "long_description", longDescription],
  [".codex-plugin/plugin.json", "description", shortDescription],
  [".codex-plugin/plugin.json", "shortDescription", shortDescription],
  [".codex-plugin/plugin.json", "longDescription", longDescription],
];

const changedFiles = new Set();

for (const [relPath, field, value] of updates) {
  const path = resolve(root, relPath);
  const contents = readFileSync(path, "utf8");
  const fieldPattern = new RegExp(`(\\"${field}\\"\\s*:\\s*)\\"(?:\\\\.|[^\\"\\\\])*\\"`);

  if (!fieldPattern.test(contents)) {
    throw new Error(`${relPath}: ${field} string not found.`);
  }

  const updated = contents.replace(fieldPattern, `$1${JSON.stringify(value)}`);
  if (updated === contents) continue;

  changedFiles.add(relPath);
  if (!checkOnly) writeFileSync(path, updated);
}

if (changedFiles.size > 0) {
  const files = [...changedFiles].join(", ");
  if (checkOnly) {
    console.error(`Package metadata is out of sync: ${files}. Run npm run metadata:sync.`);
    process.exit(1);
  }
  console.log(`Synced package metadata: ${files}`);
} else {
  console.log("Package metadata is already in sync.");
}
