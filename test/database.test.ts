import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import initSqlJs from "sql.js";
import { PriceDataManager, SECDataManager, type OHLC } from "../src/database.js";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "claw-cache-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function samplePrices(): OHLC[] {
  return [
    { Date: "2024-01-01", Open: 100, High: 105, Low: 95, Close: 102, Volume: 1000 },
    { Date: "2024-01-02", Open: 102, High: 108, Low: 100, Close: 106, Volume: 2000 },
  ];
}

async function writeRawDb(
  dbPath: string,
  fn: (db: ReturnType<Awaited<ReturnType<typeof initSqlJs>>>["Database"]) => void
): Promise<void> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  fn(db);
  const buffer = Buffer.from(db.export());
  const { writeFileSync } = await import("node:fs");
  writeFileSync(dbPath, buffer);
  db.close();
}

describe("PriceDataManager", () => {
  it("stores and retrieves prices", async () => {
    const dir = createTempDir();
    const dbPath = join(dir, "price.db");
    const manager = new PriceDataManager(dbPath, 1);

    await manager.setPrices("AAPL", samplePrices());
    const retrieved = await manager.getPrices("AAPL");

    assert.deepEqual(retrieved, samplePrices());
    manager.close();
  });

  it("returns null for a missing ticker", async () => {
    const dir = createTempDir();
    const manager = new PriceDataManager(join(dir, "price.db"), 1);
    const retrieved = await manager.getPrices("NONEXIST");
    assert.equal(retrieved, null);
    manager.close();
  });

  it("returns null for expired entries", async () => {
    const dir = createTempDir();
    const dbPath = join(dir, "price.db");

    const expired = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await writeRawDb(dbPath, (db) => {
      db.run(`
        CREATE TABLE price_data (ticker TEXT PRIMARY KEY, data_json TEXT NOT NULL, fetched_at TEXT NOT NULL)
      `);
      db.run(`INSERT INTO price_data (ticker, data_json, fetched_at) VALUES (?, ?, ?)`, [
        "AAPL",
        JSON.stringify(samplePrices()),
        expired,
      ]);
    });

    const manager = new PriceDataManager(dbPath, 1);
    const retrieved = await manager.getPrices("AAPL");
    assert.equal(retrieved, null);
    manager.close();
  });

  it("returns null on corrupt JSON without crashing", async () => {
    const dir = createTempDir();
    const dbPath = join(dir, "price.db");

    await writeRawDb(dbPath, (db) => {
      db.run(`
        CREATE TABLE price_data (ticker TEXT PRIMARY KEY, data_json TEXT NOT NULL, fetched_at TEXT NOT NULL)
      `);
      db.run(`INSERT INTO price_data (ticker, data_json, fetched_at) VALUES (?, ?, ?)`, [
        "BAD",
        "{not valid json",
        new Date().toISOString(),
      ]);
    });

    const manager = new PriceDataManager(dbPath, 1);
    const retrieved = await manager.getPrices("BAD");
    assert.equal(retrieved, null);
    manager.close();
  });

  it("persists across manager instances", async () => {
    const dir = createTempDir();
    const dbPath = join(dir, "price.db");
    const manager = new PriceDataManager(dbPath, 1);
    await manager.setPrices("AAPL", samplePrices());
    manager.close();

    const manager2 = new PriceDataManager(dbPath, 1);
    const retrieved = await manager2.getPrices("AAPL");
    assert.deepEqual(retrieved, samplePrices());
    manager2.close();
  });
});

describe("SECDataManager", () => {
  it("stores and retrieves SEC data", async () => {
    const dir = createTempDir();
    const manager = new SECDataManager(join(dir, "sec.db"), 7);
    const payload = { foo: "bar", nested: { value: 42 } };

    await manager.storeData("0000320193", payload);
    const retrieved = await manager.getData("0000320193");

    assert.deepEqual(retrieved, payload);
    manager.close();
  });

  it("returns null for a missing CIK", async () => {
    const dir = createTempDir();
    const manager = new SECDataManager(join(dir, "sec.db"), 7);
    const retrieved = await manager.getData("0000000000");
    assert.equal(retrieved, null);
    manager.close();
  });

  it("returns null on corrupt JSON without crashing", async () => {
    const dir = createTempDir();
    const dbPath = join(dir, "sec.db");

    await writeRawDb(dbPath, (db) => {
      db.run(`
        CREATE TABLE sec_data (cik TEXT PRIMARY KEY, data_json TEXT NOT NULL, fetched_at TEXT NOT NULL)
      `);
      db.run(`INSERT INTO sec_data (cik, data_json, fetched_at) VALUES (?, ?, ?)`, [
        "BAD",
        "{{broken",
        new Date().toISOString(),
      ]);
    });

    const manager = new SECDataManager(dbPath, 7);
    const retrieved = await manager.getData("BAD");
    assert.equal(retrieved, null);
    manager.close();
  });

  it("persists across manager instances", async () => {
    const dir = createTempDir();
    const dbPath = join(dir, "sec.db");
    const manager = new SECDataManager(dbPath, 7);
    await manager.storeData("0000320193", { foo: "bar" });
    manager.close();

    const manager2 = new SECDataManager(dbPath, 7);
    const retrieved = await manager2.getData("0000320193");
    assert.deepEqual(retrieved, { foo: "bar" });
    manager2.close();
  });
});
