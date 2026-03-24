import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";
import { rewriteUrl } from "../utils/url-rewrite.js";

export function register(server: McpServer, _browser: BrowserManager, ctx: ToolContext): void {
  server.tool(
    "open_tab",
    "Open a new persistent browser tab. Returns a tab_id that can be used with other tools for multi-step workflows (login, navigation, form filling). The tab stays open until explicitly closed or the session expires.",
    {
      url: z.string().url().optional().describe("URL to navigate to (optional, opens blank tab if omitted)"),
      timeout: z.number().optional().describe("Navigation timeout in ms (default: 30000)"),
    },
    async ({ url, timeout }) => {
      try {
        const effectiveUrl = url ? rewriteUrl(url) : undefined;
        const result = await ctx.sessions.openTab(effectiveUrl, timeout ?? ctx.config.defaultTimeout);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error opening tab: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
