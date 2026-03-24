import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type BrowserManager } from "../browser.js";
import { type ToolContext } from "../context.js";
import { dismissOverlays } from "../utils/dismiss-overlays.js";

export function register(server: McpServer, _browser: BrowserManager, ctx: ToolContext): void {
  server.tool(
    "click_and_navigate",
    "Interact with a persistent browser tab: click elements, type text, select options, submit forms, or scroll. Requires a tab_id from open_tab. Returns the page state after the action.",
    {
      tab_id: z.string().describe("The persistent tab ID (from open_tab)"),
      action: z.enum(["click", "type", "select", "submit", "scroll"]).describe("Action to perform"),
      selector: z.string().describe("CSS selector for the target element"),
      value: z.string().optional().describe("Text to type (for 'type'), option value (for 'select')"),
      wait_after: z.string().optional().describe("CSS selector to wait for after the action completes"),
      timeout: z.number().optional().describe("Timeout in ms (default: 30000)"),
    },
    async ({ tab_id, action, selector, value, wait_after, timeout }) => {
      try {
        const effectiveTimeout = timeout ?? ctx.config.defaultTimeout;
        const page = await ctx.sessions.getPage(tab_id);

        // Dismiss cookie banners that may block interaction
        await dismissOverlays(page);

        await page.waitForSelector(selector, { timeout: effectiveTimeout });

        switch (action) {
          case "click": {
            await page.click(selector);
            // Wait for potential navigation (non-blocking — page may or may not navigate)
            await page.waitForNetworkIdle({ timeout: 3000 }).catch(() => {});
            break;
          }
          case "type": {
            if (!value) {
              return {
                content: [{ type: "text" as const, text: "Error: 'value' is required for the 'type' action" }],
                isError: true,
              };
            }
            // Clear existing content: triple-click to select all, then type over it
            await page.evaluate((sel: string) => {
              const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
              if (el && "select" in el) el.select();
            }, selector);
            await page.type(selector, value);
            break;
          }
          case "select": {
            if (!value) {
              return {
                content: [{ type: "text" as const, text: "Error: 'value' is required for the 'select' action" }],
                isError: true,
              };
            }
            await page.select(selector, value);
            break;
          }
          case "submit": {
            await page.evaluate((sel: string) => {
              const el = document.querySelector(sel);
              const form = el?.closest("form");
              if (form) {
                form.submit();
              } else {
                throw new Error("No form found containing the specified element");
              }
            }, selector);
            await page.waitForNetworkIdle({ timeout: effectiveTimeout }).catch(() => {});
            break;
          }
          case "scroll": {
            await page.evaluate((sel: string) => {
              const el = document.querySelector(sel);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
              } else {
                throw new Error(`Element not found: ${sel}`);
              }
            }, selector);
            break;
          }
        }

        if (wait_after) {
          await page.waitForSelector(wait_after, { timeout: effectiveTimeout });
        }

        // Return current page state
        const state = await page.evaluate(() => {
          const body = document.body;
          return {
            text_snippet: body?.innerText?.slice(0, 500) ?? "",
          };
        });

        const result = {
          url: page.url(),
          title: await page.title(),
          action_performed: action,
          snippet: state.text_snippet,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error during interaction: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
