import { existsSync, readFileSync } from "fs";
import { join } from "path";
import os from "os";

const PLACEHOLDER_USER_AGENT = "OpenClawStockScreener/1.0 (stock-screener@example.com)";

export interface BuffettThresholds {
  roe: number;
  debtToEquity: number;
  currentRatio: number;
  operatingMargin: number;
  assetTurnover: number;
  interestCoverage: number;
}

export interface ScreeningWeights {
  tech: number;
  fundamental: number;
}

export interface DcfConfig {
  discountRate: number;
  terminalGrowth: number;
  horizonYears: number;
  useLiveRiskFreeRate: boolean;
}

export interface YahooConfig {
  rateLimitMs: number;
  maxRetries: number;
  concurrency: number;
}

export interface Config {
  secUserAgent: string;
  watchlistFile: string;
  dbPath: {
    sec: string;
    price: string;
  };
  logLevel: string;
  yahoo: YahooConfig;
  buffett: BuffettThresholds;
  screening: ScreeningWeights;
  dcf: DcfConfig;
}

const DEFAULT_CONFIG: Config = {
  secUserAgent: PLACEHOLDER_USER_AGENT,
  watchlistFile: join(os.homedir(), ".claw-screener-watchlist.json"),
  dbPath: {
    sec: "sec_cache.db",
    price: "price_cache.db",
  },
  logLevel: "info",
  yahoo: {
    rateLimitMs: 250,
    maxRetries: 4,
    concurrency: 4,
  },
  buffett: {
    roe: 15,
    debtToEquity: 0.5,
    currentRatio: 1.5,
    operatingMargin: 12,
    assetTurnover: 0.5,
    interestCoverage: 3,
  },
  screening: {
    tech: 0.3,
    fundamental: 0.7,
  },
  dcf: {
    discountRate: 0.1,
    terminalGrowth: 0.025,
    horizonYears: 10,
    useLiveRiskFreeRate: true,
  },
};

const CONFIG_FILE_PATHS = [
  process.env.CLAW_SCREENER_CONFIG,
  join(os.homedir(), ".claw-screener", "config.json"),
  ".claw-screener.json",
].filter(Boolean) as string[];

export function loadConfigFile(path?: string): Partial<Config> {
  const filePath = path ?? CONFIG_FILE_PATHS.find((p) => existsSync(p));
  if (!filePath) return {};

  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Partial<Config>;
  } catch {
    return {};
  }
}

function applyEnvVars(base: Config): Config {
  const env = process.env;
  const config = { ...base };

  if (env.SEC_USER_AGENT) {
    config.secUserAgent = env.SEC_USER_AGENT;
  }
  if (env.CLAW_SCREENER_WATCHLIST_FILE) {
    config.watchlistFile = env.CLAW_SCREENER_WATCHLIST_FILE;
  }
  if (env.SEC_DB_PATH) {
    config.dbPath.sec = env.SEC_DB_PATH;
  }
  if (env.PRICE_DB_PATH) {
    config.dbPath.price = env.PRICE_DB_PATH;
  }
  if (env.LOG_LEVEL) {
    config.logLevel = env.LOG_LEVEL;
  }
  if (env.YAHOO_RATE_LIMIT_MS) {
    config.yahoo.rateLimitMs = parseInt(env.YAHOO_RATE_LIMIT_MS, 10);
  }
  if (env.YAHOO_MAX_RETRIES) {
    config.yahoo.maxRetries = parseInt(env.YAHOO_MAX_RETRIES, 10);
  }
  if (env.YAHOO_CONCURRENCY) {
    config.yahoo.concurrency = parseInt(env.YAHOO_CONCURRENCY, 10);
  }
  if (env.DCF_DISCOUNT_RATE) {
    config.dcf.discountRate = parseFloat(env.DCF_DISCOUNT_RATE);
    config.dcf.useLiveRiskFreeRate = false;
  }
  if (env.DCF_TERMINAL_GROWTH) {
    config.dcf.terminalGrowth = parseFloat(env.DCF_TERMINAL_GROWTH);
  }

  return config;
}

export function resolveConfig(fileOverride?: string): Config {
  const fileConfig = loadConfigFile(fileOverride);
  const merged = deepMerge(DEFAULT_CONFIG, fileConfig);
  return applyEnvVars(merged);
}

function deepMerge<T>(base: T, override: Partial<T>): T {
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(override) as Array<keyof T & string>) {
    const overrideValue = (override as Record<string, unknown>)[key];
    const baseValue = (base as Record<string, unknown>)[key];
    if (
      overrideValue !== undefined &&
      typeof baseValue === "object" &&
      baseValue !== null &&
      !Array.isArray(baseValue) &&
      typeof overrideValue === "object" &&
      overrideValue !== null
    ) {
      result[key] = deepMerge(baseValue, overrideValue);
    } else if (overrideValue !== undefined) {
      result[key] = overrideValue;
    }
  }
  return result as T;
}

export function isPlaceholderUserAgent(userAgent: string): boolean {
  return userAgent === PLACEHOLDER_USER_AGENT;
}

export type { OutputFormat } from "./types.js";
