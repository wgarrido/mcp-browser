import { type Page } from "puppeteer-core";
import { type BrowserManager } from "../browser.js";
import { type SessionManager } from "../session.js";

/**
 * Helper that either reuses a persistent session page (if tabId is provided)
 * or opens a new ephemeral page via withPage().
 *
 * IMPORTANT: This helper does NOT navigate — the callback is responsible for
 * any navigation. This avoids double-navigation when tools have their own
 * navigation logic (e.g. fetchPageContent, rewriteUrl).
 *
 * When using a session, the page is NOT closed after the callback.
 * When using an ephemeral page, it is closed automatically (via withPage).
 */
export async function withPageOrSession<T>(
  browser: BrowserManager,
  sessions: SessionManager,
  options: { tabId?: string; timeout?: number },
  fn: (page: Page) => Promise<T>
): Promise<T> {
  if (options.tabId) {
    const page = await sessions.getPage(options.tabId);
    return await fn(page);
  }

  return browser.withPage(fn, { timeout: options.timeout });
}
