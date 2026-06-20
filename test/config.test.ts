import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resolveConfig, loadConfigFile, isPlaceholderUserAgent } from "../src/config.js";

const tempDirs: string[] = [];
const savedEnv: Record<string, string | undefined> = {};

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "claw-config-"));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  for (const key of [
    "SEC_USER_AGENT",
    "CLAW_SCREENER_WATCHLIST_FILE",
    "SEC_DB_PATH",
    "PRICE_DB_PATH",
    "LOG_LEVEL",
    "YAHOO_RATE_LIMIT_MS",
    "YAHOO_MAX_RETRIES",
    "YAHOO_CONCURRENCY",
    "DCF_DISCOUNT_RATE",
    "DCF_TERMINAL_GROWTH",
    "CLAW_SCREENER_CONFIG",
  ]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("loadConfigFile", () => {
  it("loads a JSON config file", () => {
    const dir = createTempDir();
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ secUserAgent: "Test/1.0 (test@test.com)" }));

    const config = loadConfigFile(path);
    assert.equal(config.secUserAgent, "Test/1.0 (test@test.com)");
  });

  it("returns empty object for missing file", () => {
    assert.deepEqual(loadConfigFile("/nonexistent/path.json"), {});
  });

  it("returns empty object for invalid JSON", () => {
    const dir = createTempDir();
    const path = join(dir, "config.json");
    writeFileSync(path, "{not valid json");
    assert.deepEqual(loadConfigFile(path), {});
  });
});

describe("resolveConfig", () => {
  it("returns defaults when no config or env is set", () => {
    const config = resolveConfig();
    assert.equal(config.buffett.roe, 15);
    assert.equal(config.buffett.debtToEquity, 0.5);
    assert.equal(config.dcf.discountRate, 0.1);
    assert.equal(config.dcf.terminalGrowth, 0.025);
    assert.equal(config.dcf.horizonYears, 10);
    assert.equal(config.screening.tech, 0.3);
    assert.equal(config.screening.fundamental, 0.7);
    assert.equal(config.yahoo.concurrency, 4);
  });

  it("merges config file values over defaults", () => {
    const dir = createTempDir();
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ buffett: { roe: 20 } }));

    const config = resolveConfig(path);
    assert.equal(config.buffett.roe, 20);
    assert.equal(config.buffett.debtToEquity, 0.5);
  });

  it("env vars override config file values", () => {
    const dir = createTempDir();
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ secUserAgent: "FromFile/1.0" }));
    process.env.SEC_USER_AGENT = "FromEnv/1.0 (env@test.com)";

    const config = resolveConfig(path);
    assert.equal(config.secUserAgent, "FromEnv/1.0 (env@test.com)");
  });

  it("DCF_DISCOUNT_RATE env overrides and disables live rate", () => {
    process.env.DCF_DISCOUNT_RATE = "0.08";
    const config = resolveConfig();
    assert.equal(config.dcf.discountRate, 0.08);
    assert.equal(config.dcf.useLiveRiskFreeRate, false);
  });

  it("deep-merges nested objects", () => {
    const dir = createTempDir();
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ yahoo: { concurrency: 8 }, screening: { tech: 0.4 } }));

    const config = resolveConfig(path);
    assert.equal(config.yahoo.concurrency, 8);
    assert.equal(config.yahoo.rateLimitMs, 250);
    assert.equal(config.screening.tech, 0.4);
    assert.equal(config.screening.fundamental, 0.7);
  });
});

describe("isPlaceholderUserAgent", () => {
  it("returns true for the default placeholder", () => {
    assert.ok(isPlaceholderUserAgent("OpenClawStockScreener/1.0 (stock-screener@example.com)"));
  });

  it("returns false for a custom user agent", () => {
    assert.equal(isPlaceholderUserAgent("MyApp/1.0 (me@test.com)"), false);
  });
});
