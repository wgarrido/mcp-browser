import { type Config, type Logger } from "./config.js";
import { type LRUCache } from "./utils/cache.js";

/** Shared context passed to all tool register() functions */
export interface ToolContext {
  config: Config;
  logger: Logger;
  cache: LRUCache<string> | null;
}
