import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import { readFileSync, existsSync, writeFileSync } from "fs";

export interface OHLC {
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

export interface PriceData {
  ticker: string;
  data: OHLC[];
  fetchedAt: string;
}

export interface SECData {
  [key: string]: unknown;
}

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;

async function getSql(): Promise<ReturnType<typeof initSqlJs>> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs();
  }
  return sqlPromise;
}

const FLUSH_EVERY = 25;

export class SqliteCache<K extends string, V> {
  protected db: SqlJsDatabase | null = null;
  private dbPath: string;
  private tableName: string;
  private keyColumn: string;
  private ttlMs: number;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private dirty: boolean = false;
  private writesSinceFlush: number = 0;

  constructor(dbPath: string, tableName: string, keyColumn: string, ttlDays: number) {
    this.dbPath = dbPath;
    this.tableName = tableName;
    this.keyColumn = keyColumn;
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    this.initPromise = this.initDatabase();
  }

  private async initDatabase(): Promise<void> {
    if (this.initialized) return;

    const SQL = await getSql();

    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        ${this.keyColumn} TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      )
    `);

    this.migrateLegacyColumns();

    this.initialized = true;
  }

  private migrateLegacyColumns(): void {
    if (!this.db) return;
    const rows = this.db.exec(`PRAGMA table_info(${this.tableName})`);
    if (rows.length === 0) return;

    const columns = rows[0].values.map((row) => row[1] as string);
    if (columns.includes("payload_json") && !columns.includes("data_json")) {
      this.db.run(`ALTER TABLE ${this.tableName} RENAME COLUMN payload_json TO data_json`);
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized && this.initPromise) {
      await this.initPromise;
    }
  }

  async get(key: K): Promise<V | null> {
    await this.ensureInitialized();
    if (!this.db) return null;

    const stmt = this.db.prepare(
      `SELECT data_json, fetched_at FROM ${this.tableName} WHERE ${this.keyColumn} = ?`
    );
    stmt.bind([key]);

    try {
      if (!stmt.step()) return null;
      const row = stmt.getAsObject() as { data_json: string; fetched_at: string };

      const fetchedAt = new Date(row.fetched_at).getTime();
      if (Date.now() - fetchedAt > this.ttlMs) return null;

      try {
        return JSON.parse(row.data_json) as V;
      } catch {
        return null;
      }
    } finally {
      stmt.free();
    }
  }

  async set(key: K, value: V): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) return;

    this.db.run(
      `INSERT OR REPLACE INTO ${this.tableName} (${this.keyColumn}, data_json, fetched_at) VALUES (?, ?, ?)`,
      [key, JSON.stringify(value), new Date().toISOString()]
    );

    this.dirty = true;
    this.writesSinceFlush++;
    if (this.writesSinceFlush >= FLUSH_EVERY) {
      this.flush();
    }
  }

  flush(): void {
    if (!this.db || !this.dirty) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
    this.dirty = false;
    this.writesSinceFlush = 0;
  }

  close(): void {
    if (this.db) {
      this.flush();
      this.db.close();
      this.db = null;
    }
  }
}

export class PriceDataManager extends SqliteCache<string, OHLC[]> {
  constructor(dbPath: string = "price_cache.db", ttlDays: number = 1) {
    super(dbPath, "price_data", "ticker", ttlDays);
  }

  async getPrices(ticker: string): Promise<OHLC[] | null> {
    return this.get(ticker);
  }

  async setPrices(ticker: string, data: OHLC[]): Promise<void> {
    return this.set(ticker, data);
  }
}

export class SECDataManager extends SqliteCache<string, SECData> {
  constructor(dbPath: string = "sec_cache.db", ttlDays: number = 7) {
    super(dbPath, "sec_data", "cik", ttlDays);
  }

  async getData(cik: string, forceRefresh: boolean = false): Promise<SECData | null> {
    if (forceRefresh) return null;
    return this.get(cik);
  }

  async storeData(cik: string, data: SECData): Promise<void> {
    return this.set(cik, data);
  }
}
