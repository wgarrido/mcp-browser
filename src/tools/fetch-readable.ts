import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";
import { extractReadableContent } from "../utils/readability.js";
import { htmlToMarkdown } from "../utils/html-to-markdown.js";
import { smartTruncate } from "../utils/truncate.js";
import { normalizeUrl } from "../utils/cache.js";
import { dismissOverlays } from "../utils/dismiss-overlays.js";
import { cleanDom } from "../utils/clean-dom.js";
import { rewriteUrl } from "../utils/url-rewrite.js";
import { withPageOrSession } from "../utils/with-page-or-session.js";
import { waitForChallenge } from "../utils/wait-for-challenge.js";

const MIN_READABLE_LENGTH = 200;

function cacheKey(url: string, maxLength: number): string {
  return `fetch_readable:${normalizeUrl(url)}:${maxLength}`;
}

export function register(server: McpServer, browser: BrowserManager, ctx: ToolContext): void {
  server.tool(
    "fetch_readable",
    "Load a URL and extract the main article content (removes navigation, ads, sidebars). Falls back to full page content if extraction yields too little text. Supports persistent sessions via tab_id.",
    {
      url: z.string().url().optional().describe("The URL to load (optional if tab_id is provided)"),
      wait_for: z.string().optional().describe("CSS selector to wait for before extraction"),
      timeout: z.number().optional().describe("Timeout in ms (default: 30000)"),
      max_length: z.number().optional().describe("Max content length in characters (default: 30000)"),
      fallback_to_full: z
        .boolean()
        .optional()
        .describe("Fall back to full page content if Readability extraction is too short (default: true)"),
      tab_id: z.string().optional().describe("Reuse a persistent tab (from open_tab) instead of opening a new one"),
    },
    async ({ url, wait_for, timeout, max_length, fallback_to_full, tab_id }) => {
      try {
        if (!url && !tab_id) {
          return {
            content: [{ type: "text" as const, text: "Error: either url or tab_id must be provided" }],
            isError: true,
          };
        }

        const limit = max_length ?? 30000;
        const useFallback = fallback_to_full !== false;
        const effectiveTimeout = timeout ?? ctx.config.defaultTimeout;

        if (url && !tab_id) {
          const key = cacheKey(url, limit);
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
              await page.goto(rewriteUrl(url), { waitUntil: "networkidle2", timeout: effectiveTimeout });
              await waitForChallenge(page);
              await dismissOverlays(page);
            }

            if (wait_for) {
              await page.waitForSelector(wait_for, { timeout: effectiveTimeout });
            }

            const title = await page.title();
            const finalUrl = page.url();
            const html = await page.content();

            const readable = extractReadableContent(html, finalUrl);

            let contentMarkdown: string;
            let byline: string | null = null;
            let excerpt: string | null = null;
            let method: "readability" | "full";

            if (readable && readable.content.length >= MIN_READABLE_LENGTH) {
              contentMarkdown = htmlToMarkdown(readable.content);
              byline = readable.byline;
              excerpt = readable.excerpt;
              method = "readability";
            } else if (useFallback) {
              if (tab_id) {
                // For sessions: don't mutate the live DOM — convert raw HTML directly
                contentMarkdown = htmlToMarkdown(html);
              } else {
                // For ephemeral pages: safe to mutate the DOM for cleaner output
                await cleanDom(page);
                const fullHtml = await page.content();
                contentMarkdown = htmlToMarkdown(fullHtml);
              }
              method = "full";
            } else {
              contentMarkdown = readable ? htmlToMarkdown(readable.content) : "";
              byline = readable?.byline ?? null;
              excerpt = readable?.excerpt ?? null;
              method = "readability";
            }

            contentMarkdown = smartTruncate(contentMarkdown, limit);

            return {
              url: finalUrl,
              title: readable?.title ?? title,
              byline,
              excerpt,
              extraction_method: method,
              content_markdown: contentMarkdown,
              content_length: contentMarkdown.length,
            };
          }
        );

        const json = JSON.stringify(result, null, 2);
        if (url && !tab_id) {
          const key = cacheKey(url, limit);
          ctx.cache?.set(key, json);
          if (result.url !== url) {
            ctx.cache?.set(cacheKey(result.url, limit), json);
          }
        }

        return { content: [{ type: "text" as const, text: json }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error fetching readable content: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
