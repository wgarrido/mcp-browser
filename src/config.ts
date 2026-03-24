export interface Config {
  cdpUrl: string;
  defaultTimeout: number;
  maxContentLength: number;
  maxConcurrentTabs: number;
  cacheEnabled: boolean;
  cacheTtl: number;
  searchEngine: "google" | "duckduckgo";
  logLevel: "debug" | "info" | "warn" | "error";
  sessionTimeoutMinutes: number;
  /** Named Chrome profiles mapping profile name → CDP URL. */
  profiles: Record<string, string>;
}

const VALID_SEARCH_ENGINES = ["google", "duckduckgo"] as const;
const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

function parseIntSafe(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseEnum<T extends string>(
  value: string | undefined,
  valid: readonly T[],
  fallback: T
): T {
  if (!value) return fallback;
  return valid.includes(value as T) ? (value as T) : fallback;
}

function parseProfiles(value: string | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const result: Record<string, string> = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val === "string") result[key] = val;
      }
      return result;
    }
  } catch {
    // Invalid JSON
  }
  return {};
}

export function getConfig(): Config {
  return {
    cdpUrl: process.env.CDP_URL ?? "http://localhost:9222",
    defaultTimeout: parseIntSafe(process.env.DEFAULT_TIMEOUT, 30000),
    maxContentLength: parseIntSafe(process.env.MAX_CONTENT_LENGTH, 50000),
    maxConcurrentTabs: parseIntSafe(process.env.MAX_CONCURRENT_TABS, 5),
    cacheEnabled: process.env.CACHE_ENABLED !== "false",
    cacheTtl: parseIntSafe(process.env.CACHE_TTL, 300),
    searchEngine: parseEnum(process.env.SEARCH_ENGINE, VALID_SEARCH_ENGINES, "google"),
    logLevel: parseEnum(process.env.LOG_LEVEL, VALID_LOG_LEVELS, "info"),
    sessionTimeoutMinutes: parseIntSafe(process.env.SESSION_TIMEOUT_MINUTES, 30),
    profiles: parseProfiles(process.env.CHROME_PROFILES),
  };
}

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

export function createLogger(config: Config) {
  const level = LOG_LEVELS[config.logLevel];
  return {
    debug: (...args: unknown[]) => {
      if (level <= 0) console.error("[DEBUG]", ...args);
    },
    info: (...args: unknown[]) => {
      if (level <= 1) console.error("[INFO]", ...args);
    },
    warn: (...args: unknown[]) => {
      if (level <= 2) console.error("[WARN]", ...args);
    },
    error: (...args: unknown[]) => {
      if (level <= 3) console.error("[ERROR]", ...args);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
