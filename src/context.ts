import { type Config, type Logger } from "./config.js";
import { type LRUCache } from "./utils/cache.js";
import { type SessionManager } from "./session.js";
import { type PageMonitor } from "./monitor.js";

/** Shared context passed to all tool register() functions */
export interface ToolContext {
  config: Config;
  logger: Logger;
  cache: LRUCache<string> | null;
  sessions: SessionManager;
  monitor: PageMonitor;
}
