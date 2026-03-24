import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";
import { dismissOverlays } from "../utils/dismiss-overlays.js";
import { rewriteUrl } from "../utils/url-rewrite.js";
import { withPageOrSession } from "../utils/with-page-or-session.js";
import { waitForChallenge } from "../utils/wait-for-challenge.js";

export function register(server: McpServer, browser: BrowserManager, ctx: ToolContext): void {
  server.tool(
    "execute_javascript",
    "Execute arbitrary JavaScript in the context of a loaded web page. The script runs in the browser and must return a JSON-serializable value. Supports persistent sessions via tab_id — when using a tab_id, the url parameter is optional (executes on the current page).",
    {
      url: z.string().url().optional().describe("The URL to load before executing the script (optional if tab_id is provided)"),
      script: z.string().describe("JavaScript code to execute. The last expression is returned, or use 'return' explicitly."),
      timeout: z.number().optional().describe("Timeout in ms (default: 30000)"),
      tab_id: z.string().optional().describe("Reuse a persistent tab (from open_tab) instead of opening a new one"),
    },
    async ({ url, script, timeout, tab_id }) => {
      try {
        if (!url && !tab_id) {
          return {
            content: [{ type: "text" as const, text: "Error: either url or tab_id must be provided" }],
            isError: true,
          };
        }

        const effectiveTimeout = timeout ?? ctx.config.defaultTimeout;

        const result = await withPageOrSession(
          browser, ctx.sessions,
          { tabId: tab_id, timeout: effectiveTimeout },
          async (page) => {
            if (url) {
              await page.goto(rewriteUrl(url), { waitUntil: "networkidle2", timeout: effectiveTimeout });
              await waitForChallenge(page);
              await dismissOverlays(page);
            }
            // Pass the script directly to page.evaluate — puppeteer handles string evaluation.
            // No wrapping needed: page.evaluate with a string executes it as-is and returns the result.
            return await page.evaluate(script);
          }
        );

        let serialized: string;
        try {
          serialized = JSON.stringify(result, null, 2);
        } catch {
          serialized = String(result);
        }

        // Handle undefined (non-serializable returns)
        if (serialized === undefined) {
          serialized = "undefined";
        }

        return {
          content: [{ type: "text" as const, text: serialized }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error executing JavaScript: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
