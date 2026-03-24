import { type Page } from "puppeteer-core";

/**
 * Detect if the current page is a Cloudflare (or similar) challenge/interstitial
 * and wait for it to resolve automatically.
 *
 * Detection signals:
 * - Page title "Just a moment" (Cloudflare english)
 * - Cloudflare Turnstile iframe or challenge elements
 * - Body text matching common challenge phrases
 *
 * Strategy: poll every 1s until the challenge disappears or timeout is reached.
 * Returns true if a challenge was detected (whether resolved or not).
 */
export async function waitForChallenge(
  page: Page,
  options?: { timeout?: number }
): Promise<boolean> {
  const maxWait = options?.timeout ?? 15000;

  const isChallenge = await page.evaluate(() => {
    const title = document.title.toLowerCase();
    // Cloudflare "Just a moment..." interstitial
    if (title.includes("just a moment")) return true;
    // Cloudflare challenge DOM markers
    if (document.querySelector("#challenge-running")) return true;
    if (document.querySelector("#challenge-stage")) return true;
    if (document.querySelector("#cf-challenge-running")) return true;
    if (document.querySelector(".cf-turnstile")) return true;
    if (document.querySelector("iframe[src*='challenges.cloudflare.com']")) return true;
    // Generic "checking your browser" / "vérification" text
    const bodyText = document.body?.innerText?.slice(0, 500).toLowerCase() ?? "";
    if (bodyText.includes("checking your browser") || bodyText.includes("vérification de sécurité")) return true;
    return false;
  });

  if (!isChallenge) return false;

  // Challenge detected — wait for it to resolve
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 1000));

    const stillChallenge = await page.evaluate(() => {
      const title = document.title.toLowerCase();
      if (title.includes("just a moment")) return true;
      if (document.querySelector("#challenge-running")) return true;
      if (document.querySelector("#challenge-stage")) return true;
      if (document.querySelector("#cf-challenge-running")) return true;
      return false;
    }).catch(() => false); // Page may have navigated

    if (!stillChallenge) {
      // Challenge resolved — wait for the new page to settle
      await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
      return true;
    }
  }

  // Timeout — challenge didn't resolve
  return true;
}
