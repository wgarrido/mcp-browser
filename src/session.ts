import crypto from "node:crypto";
import { type Page } from "puppeteer-core";
import { type BrowserManager } from "./browser.js";
import { type Logger } from "./config.js";
import { waitForChallenge } from "./utils/wait-for-challenge.js";

interface Session {
  id: string;
  page: Page;
  lastAccessed: number;
  createdAt: number;
}

const DEFAULT_MAX_SESSIONS = 20;

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly timeoutMs: number;
  private readonly maxSessions: number;

  constructor(
    private readonly browser: BrowserManager,
    private readonly logger: Logger,
    sessionTimeoutMinutes: number,
    maxSessions?: number
  ) {
    this.timeoutMs = sessionTimeoutMinutes * 60 * 1000;
    this.maxSessions = maxSessions ?? DEFAULT_MAX_SESSIONS;
  }

  /** Open a new persistent tab, optionally navigating to a URL. */
  async openTab(url?: string, timeout?: number): Promise<{ tab_id: string; url: string; title: string }> {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Maximum number of sessions reached (${this.maxSessions}). Close some tabs before opening new ones.`
      );
    }

    const page = await this.browser.createPage({ timeout });
    const id = crypto.randomUUID();

    try {
      if (url) {
        await page.goto(url, { waitUntil: "networkidle2", timeout: timeout ?? 30000 });
        await waitForChallenge(page);
      }
    } catch (error) {
      // Navigation failed — close the orphaned page to prevent leaks
      this.browser.untrackPage(page);
      try { await page.close(); } catch { /* already closed */ }
      throw error;
    }

    const session: Session = {
      id,
      page,
      lastAccessed: Date.now(),
      createdAt: Date.now(),
    };
    this.sessions.set(id, session);

    this.logger.info(`Session opened: ${id} → ${url ?? "about:blank"}`);

    return {
      tab_id: id,
      url: page.url(),
      title: await page.title(),
    };
  }

  /** Get the page for an existing session. Throws if not found. */
  async getPage(tabId: string): Promise<Page> {
    const session = this.sessions.get(tabId);
    if (!session) {
      throw new Error(`Session not found: ${tabId}. Use open_tab to create a new session.`);
    }
    session.lastAccessed = Date.now();
    return session.page;
  }

  /** Close a persistent tab by ID. */
  async closeTab(tabId: string): Promise<void> {
    const session = this.sessions.get(tabId);
    if (!session) {
      throw new Error(`Session not found: ${tabId}`);
    }

    this.sessions.delete(tabId);
    this.browser.untrackPage(session.page);
    try {
      await session.page.close();
    } catch {
      // Page may already be closed
    }
    this.logger.info(`Session closed: ${tabId}`);
  }

  /** List all active sessions. */
  listSessions(): Array<{ id: string; url: string; lastAccessed: number; createdAt: number }> {
    const result: Array<{ id: string; url: string; lastAccessed: number; createdAt: number }> = [];
    for (const session of this.sessions.values()) {
      result.push({
        id: session.id,
        url: session.page.url(),
        lastAccessed: session.lastAccessed,
        createdAt: session.createdAt,
      });
    }
    return result;
  }

  /** Close all sessions. */
  async closeAll(): Promise<void> {
    // Snapshot keys to avoid modifying Map during iteration
    const ids = [...this.sessions.keys()];
    for (const id of ids) {
      await this.closeTab(id).catch(() => {});
    }
  }

  /** Start the periodic cleanup of expired sessions. */
  startCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60_000);
    this.cleanupTimer.unref();
  }

  /** Stop the cleanup timer. */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private async cleanupExpired(): Promise<void> {
    const now = Date.now();
    // Snapshot keys to avoid modifying Map during iteration
    const ids = [...this.sessions.keys()];
    for (const id of ids) {
      const session = this.sessions.get(id);
      if (session && now - session.lastAccessed > this.timeoutMs) {
        this.logger.info(`Session expired: ${id} (inactive for ${Math.round((now - session.lastAccessed) / 60000)}min)`);
        await this.closeTab(id).catch(() => {});
      }
    }
  }
}
