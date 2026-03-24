import { type Page } from "puppeteer-core";

/**
 * Attempt to dismiss cookie banners and consent overlays
 * by clicking common "accept" buttons.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  const selectors = [
    // Generic cookie consent buttons
    'button[id*="accept" i]',
    'button[class*="accept" i]',
    'button[data-testid*="accept" i]',
    'a[id*="accept" i]',
    // "Accept all" variants
    'button[id*="acceptAll" i]',
    'button[class*="acceptAll" i]',
    'button[class*="accept-all" i]',
    'button[class*="accept_all" i]',
    // Common cookie consent frameworks
    '[class*="cookie"] button[class*="accept" i]',
    '[class*="cookie"] button[class*="agree" i]',
    '[class*="consent"] button[class*="accept" i]',
    '[class*="consent"] button[class*="agree" i]',
    '[id*="cookie"] button',
    '[id*="consent"] button',
    // Reddit-specific
    'button[name="accept"]',
    'shreddit-interstitial-confirmation button',
    // GDPR banners
    '[class*="gdpr"] button[class*="accept" i]',
    '[class*="gdpr"] button[class*="agree" i]',
    // CMP (Consent Management Platform) buttons
    '#onetrust-accept-btn-handler',
    '.onetrust-close-btn-handler',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '[data-cookiefirst-action="accept"]',
    '.cc-accept',
    '.cc-btn.cc-allow',
  ];

  try {
    for (const selector of selectors) {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        // Wait briefly for overlay to dismiss
        await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
        return;
      }
    }
  } catch {
    // Overlay dismissal is best-effort
  }
}
