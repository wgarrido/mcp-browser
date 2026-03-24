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

interface BrowserConnection {
  browser: Browser;
  connected: boolean;
}

export class BrowserManager {
  /** Default (unnamed) browser connection */
  private browser: Browser | null = null;
  private connected = false;
  private connectingPromise: Promise<Browser> | null = null;

  /** Named profile connections (profile name → connection) */
  private readonly profileConnections = new Map<string, BrowserConnection>();
  private readonly profileConnecting = new Map<string, Promise<Browser>>();

  private readonly config: Config;
  private readonly logger: Logger;
  private readonly semaphore: Semaphore;
  private readonly managedPages = new Set<Page>();

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.semaphore = new Semaphore(config.maxConcurrentTabs);
  }

  /** Get available profile names. */
  getProfileNames(): string[] {
    return Object.keys(this.config.profiles);
  }

  async ensureConnected(profile?: string): Promise<Browser> {
    if (!profile) {
      return this.ensureDefaultConnected();
    }

    const cdpUrl = this.config.profiles[profile];
    if (!cdpUrl) {
      throw new Error(
        `Unknown profile: "${profile}". Available profiles: ${this.getProfileNames().join(", ") || "none configured"}`
      );
    }

    return this.ensureProfileConnected(profile, cdpUrl);
  }

  private async ensureDefaultConnected(): Promise<Browser> {
    if (this.browser && this.connected) {
      return this.browser;
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = this.doConnect(this.config.cdpUrl);
    try {
      const b = await this.connectingPromise;
      this.browser = b;
      this.connected = true;

      b.on("disconnected", () => {
        this.logger.warn("Default browser disconnected");
        this.connected = false;
        this.browser = null;
      });

      return b;
    } catch (error) {
      this.connected = false;
      this.browser = null;
      throw error;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async ensureProfileConnected(profile: string, cdpUrl: string): Promise<Browser> {
    const existing = this.profileConnections.get(profile);
    if (existing?.connected) {
      return existing.browser;
    }

    const connecting = this.profileConnecting.get(profile);
    if (connecting) {
      return connecting;
    }

    const promise = this.doConnect(cdpUrl);
    this.profileConnecting.set(profile, promise);

    try {
      const b = await promise;
      const conn: BrowserConnection = { browser: b, connected: true };
      this.profileConnections.set(profile, conn);

      b.on("disconnected", () => {
        this.logger.warn(`Profile "${profile}" browser disconnected`);
        conn.connected = false;
      });

      return b;
    } catch (error) {
      this.profileConnections.delete(profile);
      throw error;
    } finally {
      this.profileConnecting.delete(profile);
    }
  }

  private async doConnect(cdpUrl: string): Promise<Browser> {
    this.logger.info(`Connecting to Chrome via CDP at ${cdpUrl}...`);

    try {
      const browser = await puppeteer.connect({ browserURL: cdpUrl });
      const version = await browser.version();
      this.logger.info(`Connected to ${version}`);
      return browser;
    } catch {
      throw new Error(
        `Cannot connect to Chrome at ${cdpUrl}. ` +
          `Make sure Chrome is running with: google-chrome --remote-debugging-port=9222\n` +
          `On Mac: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --no-first-run`
      );
    }
  }

  /** Apply anti-bot measures to a page (hide webdriver flag, etc.) */
  async setupPage(page: Page, options?: { timeout?: number }): Promise<void> {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
    });

    if (options?.timeout) {
      page.setDefaultTimeout(options.timeout);
      page.setDefaultNavigationTimeout(options.timeout);
    }
  }

  /** Create a new page without using the semaphore (for persistent sessions). */
  async createPage(options?: { timeout?: number; profile?: string }): Promise<Page> {
    const browser = await this.ensureConnected(options?.profile);
    const page = await browser.newPage();
    this.managedPages.add(page);
    await this.setupPage(page, options);
    return page;
  }

  /** Remove a page from the managed set (called when sessions close their pages). */
  untrackPage(page: Page): void {
    this.managedPages.delete(page);
  }

  async withPage<T>(
    fn: (page: Page) => Promise<T>,
    options?: { timeout?: number; profile?: string }
  ): Promise<T> {
    await this.semaphore.acquire();
    let page: Page | null = null;

    try {
      const browser = await this.ensureConnected(options?.profile);
      page = await browser.newPage();
      this.managedPages.add(page);
      await this.setupPage(page, options);

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

  /** Returns current status without attempting a new connection. */
  async getStatus(): Promise<{
    connected: boolean;
    browser_version: string | null;
    active_tabs_count: number;
    debug_url: string;
    profiles: Record<string, boolean>;
  }> {
    const profileStatus: Record<string, boolean> = {};
    for (const [name, conn] of this.profileConnections) {
      profileStatus[name] = conn.connected;
    }

    // Don't attempt connection — just report current state
    if (!this.browser || !this.connected) {
      return {
        connected: false,
        browser_version: null,
        active_tabs_count: 0,
        debug_url: this.config.cdpUrl,
        profiles: profileStatus,
      };
    }

    try {
      const version = await this.browser.version();
      const pages = await this.browser.pages();
      return {
        connected: true,
        browser_version: version,
        active_tabs_count: pages.length,
        debug_url: this.config.cdpUrl,
        profiles: profileStatus,
      };
    } catch {
      return {
        connected: false,
        browser_version: null,
        active_tabs_count: 0,
        debug_url: this.config.cdpUrl,
        profiles: profileStatus,
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

    // Disconnect default browser
    if (this.browser) {
      try {
        this.browser.disconnect();
      } catch {
        // Ignore
      }
      this.browser = null;
      this.connected = false;
    }

    // Disconnect all profile browsers
    for (const [, conn] of this.profileConnections) {
      try {
        conn.browser.disconnect();
      } catch {
        // Ignore
      }
      conn.connected = false;
    }
    this.profileConnections.clear();
  }
}
