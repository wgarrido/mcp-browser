import { type Page } from "puppeteer-core";

/**
 * Remove noisy DOM elements (navigation, sidebars, footers, ads)
 * before content extraction. Runs in the browser context.
 */
export async function cleanDom(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Generic selectors for noise elements
    const noiseSelectors = [
      "nav",
      "header",
      "footer",
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      ".sidebar",
      "#sidebar",
      ".side",
      ".nav",
      ".footer",
      ".header",
      '[class*="cookie"]',
      '[class*="consent"]',
      '[class*="popup"]',
      '[class*="modal"]',
      '[class*="overlay"]',
      '[class*="banner"]',
      '[class*="advert"]',
      '[class*="promo"]',
      '[id*="cookie"]',
      '[id*="consent"]',
      '[id*="ad-"]',
      '[id*="advertisement"]',
      // old.reddit.com specific
      ".listing-chooser",
      ".footer-parent",
      "#header",
      ".side",
      ".bottommenu",
      ".debuginfo",
      ".sr-list",
      "#sr-header-area",
      ".login-form-side",
      ".readnext",
      ".morelink",
      // Generic "related", "recommended" sections
      '[class*="related"]',
      '[class*="recommend"]',
      '[class*="suggested"]',
      // old.reddit.com: login prompts and action links
      ".login-form-side",
      ".infobar",
      ".organic-listing",
      // Login/signup interstitials
      '[class*="login"]',
      '[class*="signup"]',
    ];

    for (const selector of noiseSelectors) {
      for (const el of document.querySelectorAll(selector)) {
        // Don't remove elements that contain the main content
        if (
          !el.querySelector("article") &&
          !el.matches('[role="main"]') &&
          !el.querySelector('[role="main"]')
        ) {
          el.remove();
        }
      }
    }

    // Remove action links (share, save, report, reply, embed, etc.)
    // These are noise in the extracted content
    for (const el of document.querySelectorAll(".flat-list, .buttons")) {
      el.remove();
    }

    // Remove all links that point to javascript:void
    for (const el of document.querySelectorAll('a[href^="javascript:"]')) {
      el.remove();
    }
  });
}
