import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, CONFIG_PATH } from "./config.js";
import { TokenManager } from "./tokenManager.js";
import { YahooClient } from "./yahooClient.js";
import { ToolContext } from "./tools/context.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";

/**
 * Boot the MCP server over stdio. Requires a config produced by `auth`; if it's
 * missing we exit with a clear instruction rather than a stack trace.
 *
 * Note: stdio transport owns stdout, so all diagnostics go to stderr.
 */
export async function runServer(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.error(
      `No Yahoo Fantasy config found at ${CONFIG_PATH}.\n` +
        "Run `npx yahoo-fantasy-baseball-mcp auth` once to set up your credentials.",
    );
    process.exit(1);
  }

  const tokenManager = new TokenManager(config);
  const client = new YahooClient(tokenManager);
  const ctx = new ToolContext(client, config);

  const server = new McpServer({
    name: "yahoo-fantasy-baseball",
    version: "0.1.0",
  });

  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Yahoo Fantasy Baseball MCP server running on stdio.");
}
