import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";

export function register(server: McpServer, _browser: BrowserManager, ctx: ToolContext): void {
  server.tool(
    "monitor_page",
    "Monitor a web page for content changes. Use 'start' to begin monitoring, 'check' to retrieve changes, 'stop' to end monitoring, or 'list' to see all active monitors.",
    {
      action: z.enum(["start", "check", "stop", "list"]).describe("Action to perform"),
      monitor_id: z.string().optional().describe("Monitor ID (required for 'check' and 'stop')"),
      url: z.string().url().optional().describe("URL to monitor (required for 'start')"),
      selector: z.string().optional().describe("CSS selector to monitor for changes (default: 'body')"),
      interval_seconds: z.number().optional().describe("Polling interval in seconds (default: 30)"),
    },
    async ({ action, monitor_id, url, selector, interval_seconds }) => {
      try {
        switch (action) {
          case "start": {
            if (!url) {
              return {
                content: [{ type: "text" as const, text: "Error: 'url' is required for 'start' action" }],
                isError: true,
              };
            }
            const id = ctx.monitor.startMonitor(url, selector, interval_seconds);
            return {
              content: [{
                type: "text" as const,
                text: JSON.stringify({
                  monitor_id: id,
                  url,
                  selector: selector ?? "body",
                  interval_seconds: interval_seconds ?? 30,
                  status: "started",
                }, null, 2),
              }],
            };
          }
          case "check": {
            if (!monitor_id) {
              return {
                content: [{ type: "text" as const, text: "Error: 'monitor_id' is required for 'check' action" }],
                isError: true,
              };
            }
            const result = ctx.monitor.getChanges(monitor_id);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
            };
          }
          case "stop": {
            if (!monitor_id) {
              return {
                content: [{ type: "text" as const, text: "Error: 'monitor_id' is required for 'stop' action" }],
                isError: true,
              };
            }
            ctx.monitor.stopMonitor(monitor_id);
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ monitor_id, status: "stopped" }) }],
            };
          }
          case "list": {
            const monitors = ctx.monitor.listMonitors();
            return {
              content: [{ type: "text" as const, text: JSON.stringify(monitors, null, 2) }],
            };
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error in monitor: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
