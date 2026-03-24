#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig, createLogger } from "./config.js";
import { type ToolContext } from "./context.js";
import { BrowserManager } from "./browser.js";
import { LRUCache } from "./utils/cache.js";
import { register as registerBrowserStatus } from "./tools/browser-status.js";
import { register as registerFetchPage } from "./tools/fetch-page.js";

import { register as registerWebSearch } from "./tools/web-search.js";

const config = getConfig();
const logger = createLogger(config);

const ctx: ToolContext = {
  config,
  logger,
  cache: config.cacheEnabled
    ? new LRUCache<string>({ maxSize: 100, ttlSeconds: config.cacheTtl })
    : null,
};

const server = new McpServer({
  name: "browser-mcp-proxy",
  version: "1.0.0",
});

const browser = new BrowserManager(config, logger);

// Register tools — all share the same context
registerBrowserStatus(server, browser, ctx);
registerFetchPage(server, browser, ctx);

registerWebSearch(server, browser, ctx);

// Graceful shutdown: cleanup browser, close MCP server, then exit
async function shutdown() {
  logger.info("Shutting down...");
  await browser.disconnect();
  await server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Browser MCP Proxy server started (stdio)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
