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
  // Try multiple selectors — Google changes these frequently
  const selectors = [
    'button[id="L2AGLb"]',
    'button[aria-label*="Accept all"]',
    'button[aria-label*="Tout accepter"]',
    'button[aria-label*="Accepter tout"]',
    'button[aria-label*="Accept"]',
    'button[aria-label*="Accepter"]',
  ];
  for (const selector of selectors) {
    const button = await page.$(selector);
    if (button) {
      await button.click();
      await page.waitForNetworkIdle({ timeout: 2000 }).catch(() => {});
      return;
    }
  }
}

/** Extract Google results from the current page. Runs inside page.evaluate. */
function evaluateGoogleResults(seenSerialized: string[], max: number) {
  const items: Array<{ title: string; url: string; snippet: string }> = [];
  const seen = new Set(seenSerialized);

  const allH3s = document.querySelectorAll("a[href] h3");
  for (const h3 of allH3s) {
    if (items.length >= max) break;
    const a = h3.closest("a");
    if (!a) continue;
    let href = a.getAttribute("href") ?? "";
    if (!href.startsWith("http")) continue;

    // Strip Google's text fragment highlights (e.g. #:~:text=...)
    href = href.replace(/#:~:text=.*$/, "");
    if (seen.has(href)) continue;
    seen.add(href);

    // Walk up to find the result container for the snippet.
    let snippet = "";
    const titleText = h3.textContent?.trim() ?? "";
    let container: Element | null = a;
    for (let level = 0; level < 6 && !snippet; level++) {
      container = container?.parentElement ?? null;
      if (!container) break;

      const candidates = container.querySelectorAll(
        "div.VwiC3b, [data-sncf], div[style*='line-clamp'], span.st, em, span"
      );
      for (const s of candidates) {
        const text = s.textContent?.trim() ?? "";
        if (
          text.length > 40 &&
          text !== titleText &&
          !text.startsWith("http") &&
          !text.includes("›")
        ) {
          snippet = text;
          break;
        }
      }
    }

    items.push({ title: titleText, url: href, snippet });
  }

  return items;
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
      const perPage = 10;
      const allResults: SearchResult[] = [];
      const seenUrls: string[] = [];

      // Load pages until we have enough results (max 5 pages to avoid abuse)
      const maxPages = Math.min(Math.ceil(maxResults / perPage), 5);

      for (let pageNum = 0; pageNum < maxPages; pageNum++) {
        const start = pageNum * perPage;
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${perPage}&start=${start}&hl=en`;
        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout });

        // Handle cookie consent popup on first page
        if (pageNum === 0) {
          await dismissCookieConsent(page);
        }

        const remaining = maxResults - allResults.length;
        const pageResults = await page.evaluate(
          evaluateGoogleResults,
          seenUrls,
          remaining
        );

        for (const r of pageResults) {
          if (allResults.length >= maxResults) break;
          seenUrls.push(r.url);
          allResults.push(r);
        }

        // Stop if this page returned few results (no more pages available)
        if (pageResults.length < 3) break;
        if (allResults.length >= maxResults) break;
      }

      // Detect CAPTCHA / blocked page — trigger fallback
      if (allResults.length === 0) {
        const isCaptcha = await page.evaluate(() => {
          const body = document.body?.innerText?.slice(0, 1000).toLowerCase() ?? "";
          if (document.querySelector("#captcha-form, #recaptcha, .g-recaptcha")) return true;
          if (body.includes("unusual traffic") || body.includes("automated requests")) return true;
          if (body.includes("trafic inhabituel") || body.includes("requêtes automatisées")) return true;
          return false;
        });
        if (isCaptcha) {
          throw new Error("Google CAPTCHA detected");
        }
      }

      logger.info(`Google search: "${query}" → ${allResults.length} results`);
      return allResults;
    },
    { timeout }
  );
}

/** Adapt a Google-style query for DuckDuckGo by converting unsupported operators */
function adaptQueryForDuckDuckGo(query: string): string {
  let adapted = query;

  // inurl:xxx → just include the term (DDG doesn't support inurl:)
  adapted = adapted.replace(/inurl:(\S+)/gi, "$1");

  // cache:url → just the URL
  adapted = adapted.replace(/cache:(\S+)/gi, "$1");

  // related:url → just the URL
  adapted = adapted.replace(/related:(\S+)/gi, "$1");

  // info:url → just the URL
  adapted = adapted.replace(/info:(\S+)/gi, "$1");

  // before:YYYY-MM-DD / after:YYYY-MM-DD → remove (DDG doesn't support date operators)
  adapted = adapted.replace(/(?:before|after):\S+/gi, "");

  // Clean up extra whitespace
  adapted = adapted.replace(/\s{2,}/g, " ").trim();

  return adapted;
}

/** Extract DuckDuckGo results from the current page. Runs inside page.evaluate. */
function evaluateDDGResults(seenSerialized: string[], max: number) {
  const items: Array<{ title: string; url: string; snippet: string }> = [];
  const seenUrls = new Set(seenSerialized);

  const resultElements = document.querySelectorAll(
    '[data-testid="result"], article[data-testid="result"], .result'
  );
  for (const el of resultElements) {
    if (items.length >= max) break;

    const allLinks = el.querySelectorAll("a[href]");
    let linkEl: Element | null = null;
    for (const a of allLinks) {
      const h = a.getAttribute("href") ?? "";
      if (h.startsWith("http") && !h.includes("duckduckgo.com")) {
        linkEl = a;
        break;
      }
    }
    if (!linkEl) continue;

    const href = linkEl.getAttribute("href") ?? "";
    if (seenUrls.has(href)) continue;
    seenUrls.add(href);

    const titleEl = el.querySelector("h2, h3") ?? linkEl;
    let snippet = "";
    const snippetEl = el.querySelector('span[style*="line-clamp"], [data-result="snippet"], .result__snippet');
    if (snippetEl) {
      snippet = snippetEl.textContent?.trim() ?? "";
    }

    items.push({
      title: titleEl?.textContent?.trim() ?? "",
      url: href,
      snippet,
    });
  }
  return items;
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

      const allResults: SearchResult[] = [];
      const seenUrls: string[] = [];

      // Extract first page of results
      const firstPage = await page.evaluate(
        evaluateDDGResults,
        seenUrls,
        maxResults
      );
      for (const r of firstPage) {
        seenUrls.push(r.url);
        allResults.push(r);
      }

      // Click "More Results" to load additional pages (max 4 clicks)
      const maxClicks = Math.min(Math.ceil((maxResults - allResults.length) / 10), 4);
      for (let click = 0; click < maxClicks && allResults.length < maxResults; click++) {
        const moreButton = await page.$('button[id="more-results"], a[id="more-results"], button.result--more, [data-testid="more-results"]');
        if (!moreButton) break;

        await moreButton.click();
        await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 500));

        const remaining = maxResults - allResults.length;
        const newResults = await page.evaluate(
          evaluateDDGResults,
          seenUrls,
          remaining
        );

        if (newResults.length === 0) break;
        for (const r of newResults) {
          if (allResults.length >= maxResults) break;
          seenUrls.push(r.url);
          allResults.push(r);
        }
      }

      logger.info(`DuckDuckGo search: "${query}" → ${allResults.length} results`);
      return allResults;
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
          const adaptedQuery = adaptQueryForDuckDuckGo(query);
          results = await searchDuckDuckGo(browser, adaptedQuery, maxResults, timeout, logger);
        } else {
          // Google with DuckDuckGo fallback
          try {
            results = await searchGoogle(browser, query, maxResults, timeout, logger);
          } catch (googleError) {
            const adaptedQuery = adaptQueryForDuckDuckGo(query);
            const queryNote = adaptedQuery !== query ? ` (query adapted: "${adaptedQuery}")` : "";
            logger.warn(`Google search failed, falling back to DuckDuckGo: ${googleError}${queryNote}`);
            results = await searchDuckDuckGo(browser, adaptedQuery, maxResults, timeout, logger);
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
