import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";

export function register(server: McpServer, browser: BrowserManager, _ctx: ToolContext): void {
  server.tool(
    "list_tabs",
    "List all open browser tabs with their URLs and titles",
    {},
    async () => {
      try {
        const tabs = await browser.getPages();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(tabs, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error listing tabs: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
