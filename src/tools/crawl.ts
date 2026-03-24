import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";
import { fetchPageContent } from "../utils/fetch-core.js";
import { rewriteUrl } from "../utils/url-rewrite.js";
import { dismissOverlays } from "../utils/dismiss-overlays.js";
import { waitForChallenge } from "../utils/wait-for-challenge.js";

interface CrawlResult {
  url: string;
  title: string;
  depth: number;
  content_summary?: string;
  error?: string;
}

export function register(server: McpServer, browser: BrowserManager, ctx: ToolContext): void {
  server.tool(
    "crawl",
    "Crawl a website starting from a URL, following links up to a specified depth. Returns a list of discovered pages with titles and optional content summaries. Respects same-domain and link filter constraints.",
    {
      url: z.string().url().describe("Starting URL for the crawl"),
      max_depth: z.number().optional().describe("Maximum link depth to follow (default: 2)"),
      max_pages: z.number().optional().describe("Maximum total pages to crawl (default: 10)"),
      link_filter: z.string().optional().describe("Regex pattern to filter which links to follow"),
      include_content: z.boolean().optional().describe("Include a markdown content summary per page (default: false)"),
      max_length_per_page: z.number().optional().describe("Max content length per page when include_content is true (default: 5000)"),
      timeout: z.number().optional().describe("Timeout per page in ms (default: 30000)"),
    },
    async ({ url, max_depth, max_pages, link_filter, include_content, max_length_per_page, timeout }) => {
      try {
        const maxDepth = max_depth ?? 2;
        const maxPages = Math.min(max_pages ?? 10, 50); // Hard cap at 50
        const perPageLimit = max_length_per_page ?? 5000;
        const effectiveTimeout = timeout ?? ctx.config.defaultTimeout;
        const filterRegex = link_filter ? new RegExp(link_filter) : null;

        // Enforce same-domain constraint
        const startDomain = new URL(url).hostname;

        const visited = new Set<string>();
        const results: CrawlResult[] = [];
        let queue: Array<{ url: string; depth: number }> = [{ url, depth: 0 }];

        while (queue.length > 0 && results.length < maxPages) {
          const currentBatch = queue.splice(0, Math.min(queue.length, maxPages - results.length));
          const nextQueue: Array<{ url: string; depth: number }> = [];

          const promises = currentBatch.map(async ({ url: pageUrl, depth }) => {
            const normalized = new URL(pageUrl).href;
            if (visited.has(normalized)) return;
            visited.add(normalized);

            try {
              const result = await browser.withPage(
                async (page) => {
                  // fetchPageContent handles rewriteUrl internally
                  const content = include_content
                    ? await fetchPageContent(page, pageUrl, {
                        timeout: effectiveTimeout,
                        maxLength: perPageLimit,
                      })
                    : null;

                  if (!content) {
                    await page.goto(rewriteUrl(pageUrl), { waitUntil: "networkidle2", timeout: effectiveTimeout });
                    await waitForChallenge(page);
                    await dismissOverlays(page);
                  }

                  const title = await page.title();
                  const finalUrl = page.url();

                  // Extract links for next depth level
                  let links: string[] = [];
                  if (depth < maxDepth) {
                    links = await page.evaluate((domain: string) => {
                      const hrefs: string[] = [];
                      for (const a of document.querySelectorAll("a[href]")) {
                        const href = a.getAttribute("href") ?? "";
                        if (href.startsWith("javascript:") || href === "#" || href.startsWith("mailto:")) continue;
                        try {
                          const resolved = new URL(href, location.href);
                          if (resolved.hostname === domain) {
                            hrefs.push(resolved.href);
                          }
                        } catch {
                          // Skip invalid URLs
                        }
                      }
                      return [...new Set(hrefs)];
                    }, startDomain);
                  }

                  return { title, finalUrl, links, content };
                },
                { timeout: effectiveTimeout }
              );

              const crawlResult: CrawlResult = {
                url: result.finalUrl,
                title: result.title,
                depth,
              };
              if (include_content && result.content) {
                crawlResult.content_summary = result.content.content_markdown;
              }
              results.push(crawlResult);

              // Queue discovered links for next depth
              if (depth < maxDepth) {
                for (const link of result.links) {
                  if (!visited.has(link)) {
                    if (filterRegex && !filterRegex.test(link)) continue;
                    nextQueue.push({ url: link, depth: depth + 1 });
                  }
                }
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              results.push({ url: pageUrl, title: "", depth, error: message });
            }
          });

          await Promise.allSettled(promises);
          queue.push(...nextQueue);
        }

        const output = {
          start_url: url,
          pages_crawled: results.length,
          max_depth: maxDepth,
          results,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error during crawl: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
