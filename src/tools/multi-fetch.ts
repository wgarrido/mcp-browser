import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";
import { fetchPageContent } from "../utils/fetch-core.js";

interface MultiFetchResult {
  url: string;
  status: "success" | "error";
  title?: string;
  content_markdown?: string;
  content_length?: number;
  error?: string;
}

export function register(server: McpServer, browser: BrowserManager, ctx: ToolContext): void {
  server.tool(
    "multi_fetch",
    "Fetch multiple URLs in parallel and return their content as Markdown. Useful for comparing sources or gathering information from several pages at once. Max 5 URLs.",
    {
      urls: z
        .array(z.string().url())
        .min(1)
        .max(5)
        .describe("List of URLs to fetch (max 5)"),
      wait_for: z.string().optional().describe("CSS selector to wait for on each page"),
      timeout: z.number().optional().describe("Timeout per page in ms (default: 30000)"),
      max_length_per_page: z
        .number()
        .optional()
        .describe("Max content length per page in characters (default: 15000)"),
    },
    async ({ urls, wait_for, timeout, max_length_per_page }) => {
      try {
        const effectiveTimeout = timeout ?? ctx.config.defaultTimeout;
        const perPageLimit = max_length_per_page ?? 15000;

        const promises = urls.map(async (url): Promise<MultiFetchResult> => {
          try {
            const result = await browser.withPage(
              async (page) => fetchPageContent(page, url, {
                waitFor: wait_for,
                timeout: effectiveTimeout,
                maxLength: perPageLimit,
              }),
              { timeout: effectiveTimeout }
            );
            return {
              url: result.url,
              status: "success",
              title: result.title,
              content_markdown: result.content_markdown,
              content_length: result.content_length,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { url, status: "error", error: message };
          }
        });

        const results = await Promise.allSettled(promises);
        const output = results.map((r) =>
          r.status === "fulfilled" ? r.value : { url: "unknown", status: "error" as const, error: String(r.reason) }
        );

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error in multi_fetch: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
