import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";
import { htmlToMarkdown } from "../utils/html-to-markdown.js";
import { smartTruncate } from "../utils/truncate.js";
import { normalizeUrl } from "../utils/cache.js";
import { dismissOverlays } from "../utils/dismiss-overlays.js";
import { rewriteUrl } from "../utils/url-rewrite.js";
import { cleanDom } from "../utils/clean-dom.js";

function cacheKey(url: string, maxLength: number): string {
  return `fetch_page:${normalizeUrl(url)}:${maxLength}`;
}

export function register(server: McpServer, browser: BrowserManager, ctx: ToolContext): void {
  server.tool(
    "fetch_page",
    "Load a URL in the browser and return the full page content as Markdown",
    {
      url: z.string().url().describe("The URL to load"),
      wait_for: z.string().optional().describe("CSS selector to wait for before extraction"),
      timeout: z.number().optional().describe("Timeout in ms (default: 30000)"),
      max_length: z.number().optional().describe("Max content length in characters (default: 50000)"),
    },
    async ({ url, wait_for, timeout, max_length }) => {
      try {
        const effectiveUrl = rewriteUrl(url);
        const limit = max_length ?? ctx.config.maxContentLength;
        const key = cacheKey(url, limit);

        // Check cache (keyed by url + max_length)
        const cached = ctx.cache?.get(key);
        if (cached) {
          return {
            content: [{ type: "text" as const, text: cached }],
          };
        }

        const result = await browser.withPage(
          async (page) => {
            await page.goto(effectiveUrl, { waitUntil: "networkidle2", timeout: timeout ?? ctx.config.defaultTimeout });
            await dismissOverlays(page);
            await cleanDom(page);

            if (wait_for) {
              await page.waitForSelector(wait_for, { timeout: timeout ?? ctx.config.defaultTimeout });
            }

            const title = await page.title();
            const html = await page.content();
            const markdown = smartTruncate(htmlToMarkdown(html), limit);

            return {
              url: page.url(),
              title,
              content_markdown: markdown,
              content_length: markdown.length,
            };
          },
          { timeout: timeout ?? ctx.config.defaultTimeout }
        );

        const json = JSON.stringify(result, null, 2);
        // Cache by final URL too (handles redirects)
        ctx.cache?.set(key, json);
        if (result.url !== url) {
          ctx.cache?.set(cacheKey(result.url, limit), json);
        }

        return {
          content: [{ type: "text" as const, text: json }],
        };
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
