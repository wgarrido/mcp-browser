#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig, createLogger } from "./config.js";
import { type ToolContext } from "./context.js";
import { BrowserManager } from "./browser.js";
import { SessionManager } from "./session.js";
import { PageMonitor } from "./monitor.js";
import { LRUCache } from "./utils/cache.js";
import { register as registerBrowserStatus } from "./tools/browser-status.js";
import { register as registerFetchPage } from "./tools/fetch-page.js";
import { register as registerWebSearch } from "./tools/web-search.js";
import { register as registerListTabs } from "./tools/list-tabs.js";
import { register as registerFetchReadable } from "./tools/fetch-readable.js";
import { register as registerScreenshot } from "./tools/screenshot.js";
import { register as registerExecuteJavascript } from "./tools/execute-javascript.js";
import { register as registerMultiFetch } from "./tools/multi-fetch.js";
import { register as registerFetchStructuredData } from "./tools/fetch-structured-data.js";
import { register as registerOpenTab } from "./tools/open-tab.js";
import { register as registerCloseTab } from "./tools/close-tab.js";
import { register as registerInteract } from "./tools/interact.js";
import { register as registerExtractLinks } from "./tools/extract-links.js";
import { register as registerCrawl } from "./tools/crawl.js";
import { register as registerMonitorPage } from "./tools/monitor-page.js";

const config = getConfig();
const logger = createLogger(config);

const browser = new BrowserManager(config, logger);
const sessions = new SessionManager(browser, logger, config.sessionTimeoutMinutes);
const monitor = new PageMonitor(browser, logger);
sessions.startCleanup();

const ctx: ToolContext = {
  config,
  logger,
  cache: config.cacheEnabled
    ? new LRUCache<string>({ maxSize: 100, ttlSeconds: config.cacheTtl })
    : null,
  sessions,
  monitor,
};

const server = new McpServer({
  name: "browser-mcp-proxy",
  version: "2.0.0",
});

// Register all tools — they share the same context
registerBrowserStatus(server, browser, ctx);
registerFetchPage(server, browser, ctx);
registerWebSearch(server, browser, ctx);
registerListTabs(server, browser, ctx);
registerFetchReadable(server, browser, ctx);
registerScreenshot(server, browser, ctx);
registerExecuteJavascript(server, browser, ctx);
registerMultiFetch(server, browser, ctx);
registerFetchStructuredData(server, browser, ctx);
registerOpenTab(server, browser, ctx);
registerCloseTab(server, browser, ctx);
registerInteract(server, browser, ctx);
registerExtractLinks(server, browser, ctx);
registerCrawl(server, browser, ctx);
registerMonitorPage(server, browser, ctx);

// Graceful shutdown: cleanup monitors, sessions, browser, then close MCP server
async function shutdown() {
  logger.info("Shutting down...");
  monitor.stopAll();
  sessions.stopCleanup();
  await sessions.closeAll();
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
