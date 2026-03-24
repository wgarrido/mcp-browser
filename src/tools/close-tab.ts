import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";

export function register(server: McpServer, _browser: BrowserManager, ctx: ToolContext): void {
  server.tool(
    "close_tab",
    "Close a persistent browser tab by its tab_id. Use this to clean up tabs opened with open_tab.",
    {
      tab_id: z.string().describe("The tab ID returned by open_tab"),
    },
    async ({ tab_id }) => {
      try {
        await ctx.sessions.closeTab(tab_id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ closed: true, tab_id }) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error closing tab: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
