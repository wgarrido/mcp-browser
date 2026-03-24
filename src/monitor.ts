import crypto from "node:crypto";
import { type BrowserManager } from "./browser.js";
import { type Logger } from "./config.js";
import { rewriteUrl } from "./utils/url-rewrite.js";
import { dismissOverlays } from "./utils/dismiss-overlays.js";
import { waitForChallenge } from "./utils/wait-for-challenge.js";

interface Change {
  timestamp: number;
  old_content: string;
  new_content: string;
}

interface MonitorTask {
  id: string;
  url: string;
  selector: string;
  intervalMs: number;
  lastContent: string | null;
  changes: Change[];
  timer: NodeJS.Timeout;
  active: boolean;
}

const MAX_CHANGES_PER_MONITOR = 100;

export class PageMonitor {
  private readonly tasks = new Map<string, MonitorTask>();

  constructor(
    private readonly browser: BrowserManager,
    private readonly logger: Logger
  ) {}

  /** Start monitoring a URL for changes. Returns the monitor_id. */
  startMonitor(
    url: string,
    selector?: string,
    intervalSeconds?: number
  ): string {
    const id = crypto.randomUUID();
    const effectiveSelector = selector ?? "body";
    const intervalMs = (intervalSeconds ?? 30) * 1000;

    const task: MonitorTask = {
      id,
      url,
      selector: effectiveSelector,
      intervalMs,
      lastContent: null,
      changes: [],
      timer: null!,
      active: true,
    };

    task.timer = setInterval(() => this.poll(id), intervalMs);
    task.timer.unref();

    this.tasks.set(id, task);
    this.logger.info(`Monitor started: ${id} → ${url} (selector: ${effectiveSelector}, interval: ${intervalSeconds ?? 30}s)`);

    // Run the first poll immediately
    this.poll(id);

    return id;
  }

  /** Get changes accumulated since the last check. */
  getChanges(monitorId: string, since?: number): { active: boolean; url: string; changes: Change[] } {
    const task = this.tasks.get(monitorId);
    if (!task) {
      throw new Error(`Monitor not found: ${monitorId}`);
    }

    let changes: Change[];
    if (since) {
      changes = task.changes.filter((c) => c.timestamp > since);
    } else {
      changes = [...task.changes];
    }

    // Clear returned changes
    task.changes = task.changes.filter((c) => !changes.includes(c));

    return { active: task.active, url: task.url, changes };
  }

  /** Stop monitoring. */
  stopMonitor(monitorId: string): void {
    const task = this.tasks.get(monitorId);
    if (!task) {
      throw new Error(`Monitor not found: ${monitorId}`);
    }

    clearInterval(task.timer);
    task.active = false;
    this.tasks.delete(monitorId);
    this.logger.info(`Monitor stopped: ${monitorId}`);
  }

  /** Stop all monitors. */
  stopAll(): void {
    // Snapshot keys to avoid modifying Map during iteration
    const ids = [...this.tasks.keys()];
    for (const id of ids) {
      this.stopMonitor(id);
    }
  }

  /** List active monitors. */
  listMonitors(): Array<{ id: string; url: string; selector: string; pending_changes: number }> {
    const result: Array<{ id: string; url: string; selector: string; pending_changes: number }> = [];
    for (const task of this.tasks.values()) {
      result.push({
        id: task.id,
        url: task.url,
        selector: task.selector,
        pending_changes: task.changes.length,
      });
    }
    return result;
  }

  private async poll(monitorId: string): Promise<void> {
    const task = this.tasks.get(monitorId);
    if (!task || !task.active) return;

    try {
      const content = await this.browser.withPage(
        async (page) => {
          await page.goto(rewriteUrl(task.url), { waitUntil: "networkidle2", timeout: 15000 });
          await waitForChallenge(page);
          await dismissOverlays(page);
          const el = await page.$(task.selector);
          if (!el) return null;
          return await el.evaluate((node) => node.textContent?.trim() ?? "");
        },
        { timeout: 20000 }
      );

      if (content === null) return;

      if (task.lastContent !== null && content !== task.lastContent) {
        task.changes.push({
          timestamp: Date.now(),
          old_content: task.lastContent.slice(0, 500),
          new_content: content.slice(0, 500),
        });

        // Evict oldest changes if over limit
        if (task.changes.length > MAX_CHANGES_PER_MONITOR) {
          task.changes = task.changes.slice(-MAX_CHANGES_PER_MONITOR);
        }

        this.logger.info(`Monitor ${monitorId}: change detected on ${task.url}`);
      }

      task.lastContent = content;
    } catch (error) {
      this.logger.warn(`Monitor ${monitorId} poll failed: ${error}`);
    }
  }
}
