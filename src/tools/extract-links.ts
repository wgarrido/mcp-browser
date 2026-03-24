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
    "extract_links",
    "Extract all links from a web page. Can filter by regex pattern. Supports persistent sessions via tab_id.",
    {
      url: z.string().url().optional().describe("The URL to extract links from (optional if tab_id is provided)"),
      tab_id: z.string().optional().describe("Reuse a persistent tab (from open_tab)"),
      filter: z.string().optional().describe("Regex pattern to filter URLs (applied to the full URL)"),
      max_results: z.number().optional().describe("Max number of links to return (default: 100)"),
      timeout: z.number().optional().describe("Timeout in ms (default: 30000)"),
    },
    async ({ url, tab_id, filter, max_results, timeout }) => {
      try {
        if (!url && !tab_id) {
          return {
            content: [{ type: "text" as const, text: "Error: either url or tab_id must be provided" }],
            isError: true,
          };
        }

        const effectiveTimeout = timeout ?? ctx.config.defaultTimeout;
        const limit = max_results ?? 100;

        const links = await withPageOrSession(
          browser, ctx.sessions,
          { tabId: tab_id, timeout: effectiveTimeout },
          async (page) => {
            if (url) {
              await page.goto(rewriteUrl(url), { waitUntil: "networkidle2", timeout: effectiveTimeout });
              await waitForChallenge(page);
              await dismissOverlays(page);
            }

            return await page.evaluate(() => {
              const results: Array<{ href: string; text: string }> = [];
              const seen = new Set<string>();

              for (const a of document.querySelectorAll("a[href]")) {
                const href = a.getAttribute("href") ?? "";
                if (href.startsWith("javascript:") || href === "#" || href.startsWith("mailto:")) continue;

                let fullUrl: string;
                try {
                  fullUrl = new URL(href, location.href).href;
                } catch {
                  continue;
                }

                if (seen.has(fullUrl)) continue;
                seen.add(fullUrl);
                results.push({ href: fullUrl, text: a.textContent?.trim() ?? "" });
              }

              return results;
            });
          }
        );

        let filtered = links;
        if (filter) {
          const regex = new RegExp(filter);
          filtered = links.filter((link) => regex.test(link.href));
        }

        const result = {
          page_url: url ?? (tab_id ? "session" : "unknown"),
          total_links: links.length,
          filtered_count: filtered.length,
          links: filtered.slice(0, limit),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error extracting links: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
