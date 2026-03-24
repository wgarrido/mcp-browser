import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { type Config, type Logger } from "./config.js";

class Semaphore {
  private count: number;
  private readonly queue: Array<() => void> = [];

  constructor(max: number) {
    this.count = max;
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.count++;
    }
  }
}

export class BrowserManager {
  private browser: Browser | null = null;
  private connected = false;
  private connectingPromise: Promise<Browser> | null = null;
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly semaphore: Semaphore;
  private readonly managedPages = new Set<Page>();

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.semaphore = new Semaphore(config.maxConcurrentTabs);
  }

  async ensureConnected(): Promise<Browser> {
    if (this.browser && this.connected) {
      return this.browser;
    }

    // Deduplicate concurrent connection attempts
    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = this.doConnect();
    try {
      return await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async doConnect(): Promise<Browser> {
    this.logger.info(`Connecting to Chrome via CDP at ${this.config.cdpUrl}...`);

    try {
      this.browser = await puppeteer.connect({
        browserURL: this.config.cdpUrl,
      });
      this.connected = true;

      this.browser.on("disconnected", () => {
        this.logger.warn("Browser disconnected");
        this.connected = false;
        this.browser = null;
      });

      const version = await this.browser.version();
      this.logger.info(`Connected to ${version}`);
      return this.browser;
    } catch (error) {
      this.connected = false;
      this.browser = null;
      throw new Error(
        `Cannot connect to Chrome at ${this.config.cdpUrl}. ` +
          `Make sure Chrome is running with: google-chrome --remote-debugging-port=9222\n` +
          `On Mac: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --no-first-run`
      );
    }
  }

  async withPage<T>(
    fn: (page: Page) => Promise<T>,
    options?: { timeout?: number }
  ): Promise<T> {
    await this.semaphore.acquire();
    let page: Page | null = null;

    try {
      const browser = await this.ensureConnected();
      page = await browser.newPage();
      this.managedPages.add(page);

      // Hide webdriver flag to avoid bot detection on sites like Reddit
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => false,
        });
      });

      if (options?.timeout) {
        page.setDefaultTimeout(options.timeout);
        page.setDefaultNavigationTimeout(options.timeout);
      }

      return await fn(page);
    } finally {
      if (page) {
        this.managedPages.delete(page);
        try {
          await page.close();
        } catch {
          // Page may already be closed
        }
      }
      this.semaphore.release();
    }
  }

  async getPages(): Promise<Array<{ id: string; url: string; title: string }>> {
    const browser = await this.ensureConnected();
    const pages = await browser.pages();
    const results: Array<{ id: string; url: string; title: string }> = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      try {
        results.push({
          id: `tab_${i}`,
          url: page.url(),
          title: await page.title(),
        });
      } catch {
        // Skip pages that error
      }
    }
    return results;
  }

  async getStatus(): Promise<{
    connected: boolean;
    browser_version: string | null;
    active_tabs_count: number;
    debug_url: string;
  }> {
    try {
      const browser = await this.ensureConnected();
      const version = await browser.version();
      const pages = await browser.pages();
      return {
        connected: true,
        browser_version: version,
        active_tabs_count: pages.length,
        debug_url: this.config.cdpUrl,
      };
    } catch {
      return {
        connected: false,
        browser_version: null,
        active_tabs_count: 0,
        debug_url: this.config.cdpUrl,
      };
    }
  }

  async disconnect(): Promise<void> {
    for (const page of this.managedPages) {
      try {
        await page.close();
      } catch {
        // Ignore
      }
    }
    this.managedPages.clear();

    if (this.browser) {
      try {
        this.browser.disconnect();
      } catch {
        // Ignore
      }
      this.browser = null;
      this.connected = false;
    }
  }
}
