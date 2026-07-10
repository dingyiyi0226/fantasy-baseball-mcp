/**
 * Ensures the tools registered in the default server configuration stay in
 * sync with the extension manifest. The optional Yahoo write tools are
 * intentionally excluded because they require ENABLE_YAHOO_WRITE_API=true.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerDefaultTools } from "../dist/server.js";

const registeredTools = [];
const server = {
  registerTool(name) {
    registeredTools.push(name);
  },
};

registerDefaultTools(server);

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url)));
const manifestTools = manifest.tools.map(({ name }) => name).sort();

assert.deepEqual(
  registeredTools.sort(),
  manifestTools,
  "default registered tools must exactly match manifest.json",
);

console.log(`  ok   ${manifestTools.length} default registered tools match manifest.json`);
