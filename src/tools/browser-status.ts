import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";

export function register(server: McpServer, browser: BrowserManager, _ctx: ToolContext): void {
  server.tool(
    "browser_status",
    "Check if the browser connection is active and return status info",
    {},
    async () => {
      const status = await browser.getStatus();
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
      };
    }
  );
}
