import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";
import { normalizeUrl } from "../utils/cache.js";
import { fetchPageContent } from "../utils/fetch-core.js";
import { withPageOrSession } from "../utils/with-page-or-session.js";
import { htmlToMarkdown } from "../utils/html-to-markdown.js";
import { smartTruncate } from "../utils/truncate.js";

function cacheKey(url: string, waitFor: string | undefined, maxLength: number): string {
  const wf = waitFor ? `:wf=${waitFor}` : "";
  return `fetch_page:${normalizeUrl(url)}${wf}:${maxLength}`;
}

export function register(server: McpServer, browser: BrowserManager, ctx: ToolContext): void {
  server.tool(
    "fetch_page",
    "Load a URL in the browser and return the full page content as Markdown. Supports persistent sessions via tab_id.",
    {
      url: z.string().url().optional().describe("The URL to load (optional if tab_id is provided)"),
      wait_for: z.string().optional().describe("CSS selector to wait for before extraction"),
      timeout: z.number().optional().describe("Timeout in ms (default: 30000)"),
      max_length: z.number().optional().describe("Max content length in characters (default: 50000)"),
      tab_id: z.string().optional().describe("Reuse a persistent tab (from open_tab) instead of opening a new one"),
    },
    async ({ url, wait_for, timeout, max_length, tab_id }) => {
      try {
        if (!url && !tab_id) {
          return {
            content: [{ type: "text" as const, text: "Error: either url or tab_id must be provided" }],
            isError: true,
          };
        }

        const limit = max_length ?? ctx.config.maxContentLength;
        const effectiveTimeout = timeout ?? ctx.config.defaultTimeout;

        if (url && !tab_id) {
          const key = cacheKey(url, wait_for, limit);
          const cached = ctx.cache?.get(key);
          if (cached) {
            return { content: [{ type: "text" as const, text: cached }] };
          }
        }

        const result = await withPageOrSession(
          browser, ctx.sessions,
          { tabId: tab_id, timeout: effectiveTimeout },
          async (page) => {
            if (url) {
              // Navigate and extract using the shared pipeline
              return fetchPageContent(page, url, {
                waitFor: wait_for,
                timeout: effectiveTimeout,
                maxLength: limit,
              });
            }

            // No URL: extract content from the current session page
            if (wait_for) {
              await page.waitForSelector(wait_for, { timeout: effectiveTimeout });
            }
            const title = await page.title();
            const html = await page.content();
            // Don't mutate the live DOM for persistent sessions
            const markdown = smartTruncate(htmlToMarkdown(html), limit);
            return {
              url: page.url(),
              title,
              content_markdown: markdown,
              content_length: markdown.length,
            };
          }
        );

        const json = JSON.stringify(result, null, 2);
        if (url && !tab_id) {
          const key = cacheKey(url, wait_for, limit);
          ctx.cache?.set(key, json);
          if (result.url !== url) {
            ctx.cache?.set(cacheKey(result.url, wait_for, limit), json);
          }
        }

        return { content: [{ type: "text" as const, text: json }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error fetching page: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
