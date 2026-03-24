import { type Page } from "puppeteer-core";
import { dismissOverlays } from "./dismiss-overlays.js";
import { cleanDom } from "./clean-dom.js";
import { htmlToMarkdown } from "./html-to-markdown.js";
import { smartTruncate } from "./truncate.js";
import { rewriteUrl } from "./url-rewrite.js";
import { waitForChallenge } from "./wait-for-challenge.js";

export interface FetchPageResult {
  url: string;
  title: string;
  content_markdown: string;
  content_length: number;
}

/**
 * Shared pipeline for loading a page and converting to Markdown.
 * Used by fetch_page, multi_fetch, and other tools that need full-page content.
 */
export async function fetchPageContent(
  page: Page,
  url: string,
  options: {
    waitFor?: string;
    timeout?: number;
    maxLength: number;
  }
): Promise<FetchPageResult> {
  const effectiveUrl = rewriteUrl(url);
  const timeout = options.timeout ?? 30000;

  await page.goto(effectiveUrl, { waitUntil: "networkidle2", timeout });
  await waitForChallenge(page, { timeout: 15000 });
  await dismissOverlays(page);
  await cleanDom(page);

  if (options.waitFor) {
    await page.waitForSelector(options.waitFor, { timeout });
  }

  const title = await page.title();
  const html = await page.content();
  const markdown = smartTruncate(htmlToMarkdown(html), options.maxLength);

  return {
    url: page.url(),
    title,
    content_markdown: markdown,
    content_length: markdown.length,
  };
}
