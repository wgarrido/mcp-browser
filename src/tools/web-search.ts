import { z } from "zod";
import { type Page } from "puppeteer-core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";
import { type Logger } from "../config.js";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function dismissCookieConsent(page: Page): Promise<void> {
  // Non-blocking: try to click immediately, don't wait 3s for a popup that's rarely there
  const button = await page.$(
    'button[id="L2AGLb"], button[aria-label*="Accept"], button[aria-label*="Accepter"]'
  );
  if (button) {
    await button.click();
    await page.waitForNetworkIdle({ timeout: 2000 }).catch(() => {});
  }
}

async function searchGoogle(
  browser: BrowserManager,
  query: string,
  maxResults: number,
  timeout: number,
  logger: Logger
): Promise<SearchResult[]> {
  return browser.withPage(
    async (page) => {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${maxResults}&hl=en`;
      await page.goto(searchUrl, { waitUntil: "networkidle2", timeout });

      // Handle cookie consent popup (GDPR) — non-blocking instant check
      await dismissCookieConsent(page);

      const results = await page.evaluate((max: number) => {
        const items: Array<{ title: string; url: string; snippet: string }> = [];

        // Primary selectors for Google search results
        const resultElements = document.querySelectorAll("div.g");
        for (const el of resultElements) {
          if (items.length >= max) break;

          const titleEl = el.querySelector("h3");
          const linkEl = el.querySelector("a[href]");
          const snippetEl = el.querySelector('[data-sncf], span.st, div[style*="line-clamp"], div.VwiC3b');

          if (titleEl && linkEl) {
            const href = linkEl.getAttribute("href") ?? "";
            if (href.startsWith("http")) {
              items.push({
                title: titleEl.textContent?.trim() ?? "",
                url: href,
                snippet: snippetEl?.textContent?.trim() ?? "",
              });
            }
          }
        }

        // Fallback: broader selector if primary found nothing
        if (items.length === 0) {
          const allLinks = document.querySelectorAll("a[href] h3");
          for (const h3 of allLinks) {
            if (items.length >= max) break;
            const a = h3.closest("a");
            if (!a) continue;
            const href = a.getAttribute("href") ?? "";
            if (!href.startsWith("http")) continue;

            const parent = a.closest("[data-ved]") ?? a.parentElement?.parentElement;
            items.push({
              title: h3.textContent?.trim() ?? "",
              url: href,
              snippet: parent?.querySelector("span, div")?.textContent?.trim() ?? "",
            });
          }
        }

        return items;
      }, maxResults);

      logger.info(`Google search: "${query}" → ${results.length} results`);
      return results;
    },
    { timeout }
  );
}

async function searchDuckDuckGo(
  browser: BrowserManager,
  query: string,
  maxResults: number,
  timeout: number,
  logger: Logger
): Promise<SearchResult[]> {
  return browser.withPage(
    async (page) => {
      const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: "networkidle2", timeout });

      // Wait for results to load
      await page.waitForSelector('[data-testid="result"], .result, article', { timeout: 10000 }).catch(() => {});

      const results = await page.evaluate((max: number) => {
        const items: Array<{ title: string; url: string; snippet: string }> = [];

        const resultElements = document.querySelectorAll(
          '[data-testid="result"], article[data-testid="result"], .result'
        );
        for (const el of resultElements) {
          if (items.length >= max) break;

          const linkEl = el.querySelector("a[href]");
          const titleEl = el.querySelector("h2, h3") ?? linkEl;
          const snippetEl = el.querySelector('[data-result="snippet"], .result__snippet, span');

          if (linkEl) {
            const href = linkEl.getAttribute("href") ?? "";
            if (href.startsWith("http")) {
              items.push({
                title: titleEl?.textContent?.trim() ?? "",
                url: href,
                snippet: snippetEl?.textContent?.trim() ?? "",
              });
            }
          }
        }
        return items;
      }, maxResults);

      logger.info(`DuckDuckGo search: "${query}" → ${results.length} results`);
      return results;
    },
    { timeout }
  );
}

export function register(server: McpServer, browser: BrowserManager, ctx: ToolContext): void {
  const { config, logger } = ctx;

  server.tool(
    "web_search",
    "Search the web using Google or DuckDuckGo through the user's real browser. Returns structured results with title, URL, and snippet.",
    {
      query: z.string().describe("The search query"),
      engine: z
        .enum(["google", "duckduckgo"])
        .optional()
        .describe('Search engine to use (default: "google")'),
      max_results: z.number().optional().describe("Max number of results to return (default: 10)"),
    },
    async ({ query, engine, max_results }) => {
      const searchEngine = engine ?? config.searchEngine;
      const maxResults = max_results ?? 10;
      const timeout = config.defaultTimeout;

      try {
        let results: SearchResult[];

        if (searchEngine === "duckduckgo") {
          results = await searchDuckDuckGo(browser, query, maxResults, timeout, logger);
        } else {
          // Google with DuckDuckGo fallback
          try {
            results = await searchGoogle(browser, query, maxResults, timeout, logger);
          } catch (googleError) {
            logger.warn(`Google search failed, falling back to DuckDuckGo: ${googleError}`);
            results = await searchDuckDuckGo(browser, query, maxResults, timeout, logger);
          }
        }

        if (results.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No results found for this query." }],
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error performing search: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
