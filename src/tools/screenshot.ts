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
    "screenshot",
    "Take a screenshot of a web page or a specific element. Returns a PNG image. Supports persistent sessions via tab_id — when using tab_id, url is optional (screenshots the current page).",
    {
      url: z.string().url().optional().describe("The URL to capture (optional if tab_id is provided)"),
      selector: z.string().optional().describe("CSS selector of a specific element to capture"),
      full_page: z.boolean().optional().describe("Capture the full scrollable page (default: false)"),
      width: z.number().optional().describe("Viewport width in pixels (default: 1280)"),
      height: z.number().optional().describe("Viewport height in pixels (default: 720)"),
      timeout: z.number().optional().describe("Timeout in ms (default: 30000)"),
      tab_id: z.string().optional().describe("Reuse a persistent tab (from open_tab) instead of opening a new one"),
    },
    async ({ url, selector, full_page, width, height, timeout, tab_id }) => {
      try {
        if (!url && !tab_id) {
          return {
            content: [{ type: "text" as const, text: "Error: either url or tab_id must be provided" }],
            isError: true,
          };
        }

        const effectiveTimeout = timeout ?? ctx.config.defaultTimeout;

        const base64 = await withPageOrSession(
          browser, ctx.sessions,
          { tabId: tab_id, timeout: effectiveTimeout },
          async (page) => {
            await page.setViewport({
              width: width ?? 1280,
              height: height ?? 720,
            });

            if (url) {
              await page.goto(rewriteUrl(url), { waitUntil: "networkidle2", timeout: effectiveTimeout });
              await waitForChallenge(page);
            }
            await dismissOverlays(page);

            if (selector) {
              const element = await page.waitForSelector(selector, { timeout: effectiveTimeout });
              if (!element) {
                throw new Error(`Element not found: ${selector}`);
              }
              return await element.screenshot({ encoding: "base64" }) as string;
            }

            return await page.screenshot({
              fullPage: full_page ?? false,
              encoding: "base64",
            }) as string;
          }
        );

        return {
          content: [{ type: "image" as const, data: base64, mimeType: "image/png" }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error taking screenshot: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
