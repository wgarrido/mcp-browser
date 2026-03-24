import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";
import { dismissOverlays } from "../utils/dismiss-overlays.js";
import { rewriteUrl } from "../utils/url-rewrite.js";
import { withPageOrSession } from "../utils/with-page-or-session.js";
import { waitForChallenge } from "../utils/wait-for-challenge.js";

const EXTRACT_TYPES = ["json_ld", "opengraph", "meta", "tables", "headings", "links"] as const;

export function register(server: McpServer, browser: BrowserManager, ctx: ToolContext): void {
  server.tool(
    "fetch_structured_data",
    "Extract structured data from a web page: JSON-LD, OpenGraph tags, meta tags, tables, headings, and links. Supports persistent sessions via tab_id.",
    {
      url: z.string().url().optional().describe("The URL to analyze (optional if tab_id is provided)"),
      extract: z
        .array(z.enum(EXTRACT_TYPES))
        .optional()
        .describe('Data types to extract (default: ["json_ld", "opengraph", "meta"])'),
      timeout: z.number().optional().describe("Timeout in ms (default: 30000)"),
      tab_id: z.string().optional().describe("Reuse a persistent tab (from open_tab) instead of opening a new one"),
    },
    async ({ url, extract, timeout, tab_id }) => {
      try {
        if (!url && !tab_id) {
          return {
            content: [{ type: "text" as const, text: "Error: either url or tab_id must be provided" }],
            isError: true,
          };
        }

        const effectiveTimeout = timeout ?? ctx.config.defaultTimeout;
        const types = extract ?? ["json_ld", "opengraph", "meta"];

        const result = await withPageOrSession(
          browser, ctx.sessions,
          { tabId: tab_id, timeout: effectiveTimeout },
          async (page) => {
            if (url) {
              await page.goto(rewriteUrl(url), { waitUntil: "networkidle2", timeout: effectiveTimeout });
              await waitForChallenge(page);
              await dismissOverlays(page);
            }

            return await page.evaluate((requestedTypes: string[]) => {
              const data: Record<string, unknown> = { url: location.href };

              if (requestedTypes.includes("json_ld")) {
                const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                const items: unknown[] = [];
                for (const script of scripts) {
                  try {
                    items.push(JSON.parse(script.textContent ?? ""));
                  } catch {
                    // Skip malformed JSON-LD
                  }
                }
                data.json_ld = items;
              }

              if (requestedTypes.includes("opengraph")) {
                const og: Record<string, string> = {};
                for (const meta of document.querySelectorAll('meta[property^="og:"]')) {
                  const prop = meta.getAttribute("property");
                  const content = meta.getAttribute("content");
                  if (prop && content) og[prop] = content;
                }
                data.opengraph = og;
              }

              if (requestedTypes.includes("meta")) {
                const metas: Record<string, string> = {};
                for (const meta of document.querySelectorAll("meta[name], meta[property]")) {
                  const key = meta.getAttribute("name") ?? meta.getAttribute("property");
                  const content = meta.getAttribute("content");
                  if (key && content && !key.startsWith("og:")) {
                    metas[key] = content;
                  }
                }
                data.meta = metas;
              }

              if (requestedTypes.includes("tables")) {
                const tables: Array<{ headers: string[]; rows: string[][] }> = [];
                for (const table of document.querySelectorAll("table")) {
                  const headers: string[] = [];
                  for (const th of table.querySelectorAll("thead th, tr:first-child th")) {
                    headers.push(th.textContent?.trim() ?? "");
                  }
                  const rows: string[][] = [];
                  const bodyRows = table.querySelectorAll("tbody tr, tr");
                  for (const tr of bodyRows) {
                    const cells: string[] = [];
                    for (const td of tr.querySelectorAll("td")) {
                      cells.push(td.textContent?.trim() ?? "");
                    }
                    if (cells.length > 0) rows.push(cells);
                  }
                  tables.push({ headers, rows });
                }
                data.tables = tables;
              }

              if (requestedTypes.includes("headings")) {
                const headings: Array<{ level: number; text: string }> = [];
                for (const h of document.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
                  headings.push({
                    level: parseInt(h.tagName[1]),
                    text: h.textContent?.trim() ?? "",
                  });
                }
                data.headings = headings;
              }

              if (requestedTypes.includes("links")) {
                const links: Array<{ href: string; text: string }> = [];
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
                  links.push({ href: fullUrl, text: a.textContent?.trim() ?? "" });
                }
                data.links = links;
              }

              return data;
            }, types);
          }
        );

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error extracting structured data: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
