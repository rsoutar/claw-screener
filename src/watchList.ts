import { PriceDataFetcher } from "./priceData.js";
import { SECClient, extractFinancialFacts } from "./secApi.js";
import { FormulaEngine } from "./formulas.js";
import { calculateWilliamsR } from "./technicalIndicators.js";
import { fetchPricesForWilliamsR } from "./watchListPrices.js";
import {
  buildAlertsForStock,
  calculateCombinedScore,
  formatAlertsTelegram,
  formatChangePercent,
  formatStatusLabel,
  formatStatusTelegram,
  inferMarketFromTicker,
  parseTickerList,
  shouldEmitAlert,
} from "./watchListUtils.js";
import { normalizeMarket } from "./types.js";
import type { OutputFormat } from "./types.js";
import type {
  AlertResult,
  CheckAlertsOptions,
  CheckAlertsResult,
  Market,
  StockFailure,
  StockStatus,
  WatchedStock,
  WatchListData,
  WatchListStatus,
} from "./watchListTypes.js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import os from "os";

export type {
  AlertResult,
  CheckAlertsResult,
  Market,
  StockFailure,
  StockStatus,
  WatchedStock,
  WatchListData,
  WatchListStatus,
} from "./watchListTypes.js";
export { calculateCombinedScore, parseTickerList } from "./watchListUtils.js";
export {
  fetchPricesForWilliamsR,
  PRICE_HISTORY_DAYS,
  WILLIAMS_R_PERIOD,
} from "./watchListPrices.js";

const DEFAULT_WATCHLIST_FILE = join(os.homedir(), ".claw-screener-watchlist.json");

function resolveWatchlistFile(path?: string): string {
  return path ?? process.env.CLAW_SCREENER_WATCHLIST_FILE ?? DEFAULT_WATCHLIST_FILE;
}

function loadWatchList(filePath: string): WatchListData {
  if (existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, "utf-8"));
      return {
        stocks: data.stocks || [],
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
    } catch {
      return { stocks: [], updatedAt: new Date().toISOString() };
    }
  }
  return { stocks: [], updatedAt: new Date().toISOString() };
}

function saveWatchList(filePath: string, data: WatchListData): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export class WatchListManager {
  private data: WatchListData;
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = resolveWatchlistFile(filePath);
    this.data = loadWatchList(this.filePath);
  }

  add(
    ticker: string,
    market: Market = "us",
    notes?: string,
    alertThreshold?: number,
    minBuffettScore?: number,
    group?: string
  ): boolean {
    const upperTicker = ticker.toUpperCase();
    const exists = this.data.stocks.some((s) => s.ticker === upperTicker && s.market === market);

    if (exists) {
      return false;
    }

    this.data.stocks.push({
      ticker: upperTicker,
      market,
      addedAt: new Date().toISOString(),
      notes,
      alertThreshold,
      minBuffettScore,
      group,
    });

    this.persist();
    return true;
  }

  addMany(
    tickers: string[],
    market?: Market,
    notes?: string,
    alertThreshold?: number,
    minBuffettScore?: number,
    group?: string
  ): { added: string[]; skipped: string[] } {
    const added: string[] = [];
    const skipped: string[] = [];

    for (const ticker of tickers) {
      const resolvedMarket = market ?? inferMarketFromTicker(ticker);
      const success = this.add(
        ticker,
        resolvedMarket,
        notes,
        alertThreshold,
        minBuffettScore,
        group
      );
      if (success) {
        added.push(ticker);
      } else {
        skipped.push(ticker);
      }
    }

    return { added, skipped };
  }

  remove(ticker: string, market?: Market): boolean {
    const upperTicker = ticker.toUpperCase();
    const initialLength = this.data.stocks.length;

    if (market) {
      this.data.stocks = this.data.stocks.filter(
        (s) => !(s.ticker === upperTicker && s.market === market)
      );
    } else {
      this.data.stocks = this.data.stocks.filter((s) => s.ticker !== upperTicker);
    }

    if (this.data.stocks.length < initialLength) {
      this.persist();
      return true;
    }

    return false;
  }

  getAll(): WatchedStock[] {
    return [...this.data.stocks];
  }

  getByMarket(market: Market): WatchedStock[] {
    return this.data.stocks.filter((s) => s.market === market);
  }

  getByGroup(group: string): WatchedStock[] {
    return this.data.stocks.filter((s) => s.group === group);
  }

  listGroups(): string[] {
    const groups = new Set<string>();
    for (const s of this.data.stocks) {
      if (s.group) groups.add(s.group);
    }
    return [...groups].sort();
  }

  count(): number {
    return this.data.stocks.length;
  }

  update(ticker: string, market: Market, updates: Partial<WatchedStock>): boolean {
    const stock = this.data.stocks.find(
      (s) => s.ticker === ticker.toUpperCase() && s.market === market
    );

    if (!stock) {
      return false;
    }

    const { ticker: _ticker, market: _market, addedAt: _addedAt, ...safeUpdates } = updates;
    Object.assign(stock, safeUpdates);
    this.persist();
    return true;
  }

  private persist(): void {
    this.data.updatedAt = new Date().toISOString();
    saveWatchList(this.filePath, this.data);
  }

  private async getBuffettScore(
    secClient: SECClient | null,
    ticker: string,
    market: Market
  ): Promise<number | undefined> {
    if (!secClient || market !== "us") {
      return undefined;
    }

    try {
      const cik = await secClient.resolveTickerToCik(ticker);
      if (!cik) {
        return undefined;
      }

      const companyFacts = await secClient.getCompanyFacts(cik);
      if (!companyFacts) {
        return undefined;
      }

      const engine = new FormulaEngine(extractFinancialFacts(companyFacts));
      return engine.getScore();
    } catch {
      return undefined;
    }
  }

  async checkAlerts(options: CheckAlertsOptions = {}): Promise<CheckAlertsResult> {
    const { market, group, minBuffettScore, dedupe = true } = options;
    let stocks = market ? this.getByMarket(market) : this.getAll();
    if (group) {
      stocks = stocks.filter((s) => s.group === group);
    }
    const alerts: AlertResult[] = [];
    const failures: StockFailure[] = [];
    let skipped = 0;

    const priceFetcher = new PriceDataFetcher();
    const needsFundamentals = stocks.some(
      (stock) => stock.minBuffettScore !== undefined || minBuffettScore !== undefined
    );
    const secClient = needsFundamentals ? new SECClient() : null;

    for (const stock of stocks) {
      try {
        const prices = await fetchPricesForWilliamsR(priceFetcher, stock.ticker);
        if (!prices) {
          failures.push({
            ticker: stock.ticker,
            market: stock.market,
            reason: "Insufficient price history for Williams %R",
          });
          continue;
        }

        const williamsR = calculateWilliamsR(prices);
        const currentWR = williamsR[williamsR.length - 1];

        if (isNaN(currentWR)) {
          failures.push({
            ticker: stock.ticker,
            market: stock.market,
            reason: "Could not calculate Williams %R",
          });
          continue;
        }

        const currentPrice = prices[prices.length - 1].Close;
        const buffettScore = await this.getBuffettScore(secClient, stock.ticker, stock.market);
        const candidateAlerts = buildAlertsForStock(
          stock,
          currentWR,
          currentPrice,
          buffettScore,
          minBuffettScore
        );

        const activeAlertTypes = candidateAlerts.map((alert) => alert.alertType);
        const previousAlertTypes = stock.lastAlertTypes ?? [];

        if (candidateAlerts.length === 0) {
          if (previousAlertTypes.length > 0) {
            this.update(stock.ticker, stock.market, {
              lastAlertTypes: undefined,
              lastAlertAt: undefined,
            });
          }
          continue;
        }

        const emittedTypes: AlertResult["alertType"][] = [];
        for (const alert of candidateAlerts) {
          if (!shouldEmitAlert(previousAlertTypes, alert.alertType, dedupe)) {
            skipped++;
            continue;
          }

          alerts.push(alert);
          emittedTypes.push(alert.alertType);
        }

        this.update(stock.ticker, stock.market, {
          lastAlertTypes: activeAlertTypes,
          lastAlertAt: new Date().toISOString(),
          lastPrice: currentPrice,
          lastWilliamsR: currentWR,
          lastBuffettScore: buffettScore,
          lastCheckedAt: new Date().toISOString(),
        });
      } catch (e) {
        failures.push({
          ticker: stock.ticker,
          market: stock.market,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    priceFetcher.close();
    secClient?.close();

    return {
      alerts,
      failures,
      skipped,
      checkedAt: new Date().toISOString(),
    };
  }

  async getStatus(
    market?: Market,
    includeFundamentals: boolean = false,
    group?: string
  ): Promise<WatchListStatus> {
    let stocks = market ? this.getByMarket(market) : this.getAll();
    if (group) {
      stocks = stocks.filter((s) => s.group === group);
    }
    const status: WatchListStatus = {
      total: stocks.length,
      stocks: [],
      failures: [],
      checkedAt: new Date().toISOString(),
    };

    const priceFetcher = new PriceDataFetcher();
    const secClient = includeFundamentals ? new SECClient() : null;

    for (const stock of stocks) {
      try {
        const prices = await fetchPricesForWilliamsR(priceFetcher, stock.ticker);
        if (!prices) {
          status.failures.push({
            ticker: stock.ticker,
            market: stock.market,
            reason: "Insufficient price history for Williams %R",
          });
          continue;
        }

        const williamsR = calculateWilliamsR(prices);
        const currentWR = williamsR[williamsR.length - 1];

        if (isNaN(currentWR)) {
          status.failures.push({
            ticker: stock.ticker,
            market: stock.market,
            reason: "Could not calculate Williams %R",
          });
          continue;
        }

        const currentPrice = prices[prices.length - 1].Close;
        const priceChange =
          prices.length > 1
            ? ((currentPrice - prices[prices.length - 2].Close) / prices[prices.length - 2].Close) *
              100
            : 0;

        const buffettScore = includeFundamentals
          ? await this.getBuffettScore(secClient, stock.ticker, stock.market)
          : undefined;

        let stockStatus: StockStatus["status"] = "normal";
        if (
          stock.minBuffettScore !== undefined &&
          currentWR < -80 &&
          buffettScore !== undefined &&
          buffettScore >= stock.minBuffettScore
        ) {
          stockStatus = "quality";
        } else if (currentWR < -80) {
          stockStatus = "oversold";
        } else if (currentWR > -20) {
          stockStatus = "overbought";
        } else if (stock.alertThreshold !== undefined && currentWR < stock.alertThreshold) {
          stockStatus = "alert";
        }

        const combinedScore =
          buffettScore !== undefined ? calculateCombinedScore(currentWR, buffettScore) : undefined;

        status.stocks.push({
          ticker: stock.ticker,
          market: stock.market,
          williamsR: currentWR,
          price: currentPrice,
          changePercent: priceChange,
          status: stockStatus,
          buffettScore,
          combinedScore,
        });

        stock.lastPrice = currentPrice;
        stock.lastWilliamsR = currentWR;
        stock.lastBuffettScore = buffettScore;
        stock.lastCheckedAt = new Date().toISOString();
      } catch (e) {
        status.failures.push({
          ticker: stock.ticker,
          market: stock.market,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    priceFetcher.close();
    secClient?.close();

    for (const s of stocks) {
      if (s.lastCheckedAt) {
        this.update(s.ticker, s.market, {
          lastPrice: s.lastPrice,
          lastWilliamsR: s.lastWilliamsR,
          lastBuffettScore: s.lastBuffettScore,
          lastCheckedAt: s.lastCheckedAt,
        });
      }
    }

    return status;
  }
}

interface CommonCliOptions {
  market?: Market;
  group?: string;
  format: OutputFormat;
  includeFundamentals: boolean;
  minBuffettScore?: number;
  dedupe: boolean;
}

function parseCommonArgs(args: string[]): CommonCliOptions {
  let market: Market | undefined;
  let group: string | undefined;
  let format: OutputFormat = "text";
  let includeFundamentals = false;
  let minBuffettScore: number | undefined;
  let dedupe = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--market" && i + 1 < args.length) {
      try {
        market = normalizeMarket(args[i + 1]);
      } catch {
        console.error(`Invalid market: ${args[i + 1]}. Use 'us', 'th', or 'bk'.`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === "--group" && i + 1 < args.length) {
      group = args[i + 1];
      i++;
    } else if (args[i] === "--format" && i + 1 < args.length) {
      format = args[i + 1] as OutputFormat;
      i++;
    } else if (args[i] === "--fundamentals") {
      includeFundamentals = true;
    } else if (args[i] === "--min-buffett-score" && i + 1 < args.length) {
      minBuffettScore = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--repeat-alerts") {
      dedupe = false;
    }
  }

  return { market, group, format, includeFundamentals, minBuffettScore, dedupe };
}

function parseAddArgs(args: string[]): {
  market?: Market;
  group?: string;
  notes?: string;
  alertThreshold?: number;
  minBuffettScore?: number;
} {
  let market: Market | undefined;
  let group: string | undefined;
  let notes: string | undefined;
  let alertThreshold: number | undefined;
  let minBuffettScore: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--market" && i + 1 < args.length) {
      try {
        market = normalizeMarket(args[i + 1]);
      } catch {
        console.error(`Invalid market: ${args[i + 1]}. Use 'us', 'th', or 'bk'.`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === "--group" && i + 1 < args.length) {
      group = args[i + 1];
      i++;
    } else if (args[i] === "--notes" && i + 1 < args.length) {
      notes = args[i + 1];
      i++;
    } else if (args[i] === "--alert-threshold" && i + 1 < args.length) {
      alertThreshold = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === "--min-buffett-score" && i + 1 < args.length) {
      minBuffettScore = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { market, group, notes, alertThreshold, minBuffettScore };
}

function printFailures(failures: StockFailure[]): void {
  if (failures.length === 0) {
    return;
  }

  console.log(`\n⚠️  Could not check ${failures.length} stock(s):`);
  for (const failure of failures) {
    console.log(`  - ${failure.ticker} (${failure.market}): ${failure.reason}`);
  }
}

function printHelp(): void {
  console.log(`
📊 Watchlist Manager

Usage:
  npm run watchlist:add -- <ticker>[,ticker2,...] [options]
  npm run watchlist:remove -- <ticker>[,ticker2,...] [options]
  npm run watchlist:update -- <ticker> [options]
  npm run watchlist:list -- [options]
  npm run watchlist:status -- [options]
  npm run watchlist:check -- [options]

Commands:
  add <ticker>      Add one or more stocks (comma-separated)
  remove <ticker>   Remove one or more stocks (comma-separated)
  update <ticker>   Update notes, thresholds, or alert settings
  list              List all watched stocks
  status            Fetch live price, Williams %R, and status
  check             Check for oversold, quality, and custom-threshold alerts

Options:
  --market us|th           Market filter or default market for bulk add
  --group <name>           Filter by group, or assign group on add/update
  --notes '...'            Optional notes
  --alert-threshold        Williams %R threshold for alerts (e.g. -80)
  --min-buffett-score      Buffett score threshold for quality alerts
  --fundamentals           Include Buffett score in status (US stocks, slower)
  --format text|json|telegram
  --repeat-alerts          Re-emit alerts even if unchanged since last check
  --clear-group            Remove group assignment (update command only)
  --help, -h               Show this help message

Exit codes (check):
  0  No new alerts
  1  Fetch/check errors
  2  New alerts fired

Examples:
  npm run watchlist:add -- AAPL,MSFT,NVDA --group "Tech"
  npm run watchlist:update -- AAPL --notes 'Core holding' --min-buffett-score 6
  npm run watchlist:list -- --group "Tech"
  npm run watchlist:status -- --fundamentals --format telegram
  npm run watchlist:check -- --group "Tech" --min-buffett-score 5
  npm run screening -- --add-top 5
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (
    !command ||
    command === "--help" ||
    command === "-h" ||
    args.includes("--help") ||
    args.includes("-h")
  ) {
    printHelp();
    return;
  }

  const manager = new WatchListManager();

  if (command === "add") {
    const tickerArg = args[1];
    if (!tickerArg) {
      console.error("Usage: npm run watchlist:add -- <ticker>[,ticker2,...] [options]");
      process.exit(1);
    }

    const tickers = parseTickerList(tickerArg);
    const { market, group, notes, alertThreshold, minBuffettScore } = parseAddArgs(args.slice(2));
    const { added, skipped } = manager.addMany(
      tickers,
      market,
      notes,
      alertThreshold,
      minBuffettScore,
      group
    );

    if (added.length > 0) {
      console.log(`✅ Added ${added.length} stock(s): ${added.join(", ")}`);
    }
    if (skipped.length > 0) {
      console.log(`⚠️  Already in watchlist: ${skipped.join(", ")}`);
    }
    if (added.length === 0 && skipped.length === 0) {
      process.exit(1);
    }
  } else if (command === "remove") {
    const tickerArg = args[1];
    if (!tickerArg) {
      console.error("Usage: npm run watchlist:remove -- <ticker>[,ticker2,...] [options]");
      process.exit(1);
    }

    let market: Market | undefined;
    for (let i = 2; i < args.length; i++) {
      if (args[i] === "--market" && i + 1 < args.length) {
        try {
          market = normalizeMarket(args[i + 1]);
        } catch {
          console.error(`Invalid market: ${args[i + 1]}. Use 'us', 'th', or 'bk'.`);
          process.exit(1);
        }
        i++;
      }
    }

    const tickers = parseTickerList(tickerArg);
    const removed: string[] = [];
    const missing: string[] = [];

    for (const ticker of tickers) {
      if (manager.remove(ticker, market)) {
        removed.push(ticker);
      } else {
        missing.push(ticker);
      }
    }

    if (removed.length > 0) {
      console.log(`✅ Removed ${removed.length} stock(s): ${removed.join(", ")}`);
    }
    if (missing.length > 0) {
      console.log(`⚠️  Not found: ${missing.join(", ")}`);
    }
  } else if (command === "update") {
    const ticker = args[1];
    if (!ticker) {
      console.error(
        "Usage: npm run watchlist:update -- <ticker> [--market us|th] [--notes '...'] [--alert-threshold -80] [--min-buffett-score 5] [--clear-alert-threshold] [--clear-min-buffett-score]"
      );
      process.exit(1);
    }

    let market: Market = inferMarketFromTicker(ticker);
    const updates: Partial<WatchedStock> = {};

    for (let i = 2; i < args.length; i++) {
      if (args[i] === "--market" && i + 1 < args.length) {
        try {
          market = normalizeMarket(args[i + 1]);
        } catch {
          console.error(`Invalid market: ${args[i + 1]}. Use 'us', 'th', or 'bk'.`);
          process.exit(1);
        }
        i++;
      } else if (args[i] === "--notes" && i + 1 < args.length) {
        updates.notes = args[i + 1];
        i++;
      } else if (args[i] === "--alert-threshold" && i + 1 < args.length) {
        updates.alertThreshold = parseFloat(args[i + 1]);
        i++;
      } else if (args[i] === "--min-buffett-score" && i + 1 < args.length) {
        updates.minBuffettScore = parseInt(args[i + 1], 10);
        i++;
      } else if (args[i] === "--clear-alert-threshold") {
        updates.alertThreshold = undefined;
      } else if (args[i] === "--clear-min-buffett-score") {
        updates.minBuffettScore = undefined;
      } else if (args[i] === "--group" && i + 1 < args.length) {
        updates.group = args[i + 1];
        i++;
      } else if (args[i] === "--clear-group") {
        updates.group = undefined;
      }
    }

    const success = manager.update(ticker, market, updates);
    if (success) {
      console.log(`✅ Updated ${ticker.toUpperCase()} (${market} market)`);
    } else {
      console.log(`⚠️  ${ticker.toUpperCase()} not found in watchlist`);
      process.exit(1);
    }
  } else if (command === "list") {
    const { market, group, format } = parseCommonArgs(args.slice(1));
    let stocks = market ? manager.getByMarket(market) : manager.getAll();
    if (group) {
      stocks = stocks.filter((s) => s.group === group);
    }

    if (stocks.length === 0) {
      if (format === "json") {
        console.log(JSON.stringify({ total: 0, stocks: [] }, null, 2));
      } else {
        console.log("📭 Watchlist is empty");
      }
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify({ total: stocks.length, stocks }, null, 2));
      return;
    }

    const groups = manager.listGroups();
    if (groups.length > 0) {
      console.log(`📋 Watchlist (${stocks.length} stocks, groups: ${groups.join(", ")}):\n`);
    } else {
      console.log(`📋 Watchlist (${stocks.length} stocks):\n`);
    }
    console.log("Ticker     | Market | Group      | Added      | Last WR  | Min Buffett | Notes");
    console.log("-----------|--------|------------|------------|----------|-------------|------");
    for (const stock of stocks) {
      const addedDate = new Date(stock.addedAt).toLocaleDateString();
      const lastWR = stock.lastWilliamsR !== undefined ? stock.lastWilliamsR.toFixed(1) : "-";
      const minBuffett = stock.minBuffettScore !== undefined ? `${stock.minBuffettScore}/10` : "-";
      const notes = stock.notes ?? "-";
      const groupLabel = stock.group ?? "-";
      console.log(
        `${stock.ticker.padEnd(10)} | ${stock.market === "us" ? "US" : "TH"}    | ${groupLabel.padEnd(10)} | ${addedDate.padEnd(10)} | ${lastWR.padStart(8)} | ${minBuffett.padStart(11)} | ${notes}`
      );
    }
  } else if (command === "status") {
    const { market, group, format, includeFundamentals } = parseCommonArgs(args.slice(1));
    let stocks = market ? manager.getByMarket(market) : manager.getAll();
    if (group) {
      stocks = stocks.filter((s) => s.group === group);
    }

    if (stocks.length === 0) {
      if (format === "json") {
        console.log(
          JSON.stringify(
            { total: 0, stocks: [], failures: [], checkedAt: new Date().toISOString() },
            null,
            2
          )
        );
      } else {
        console.log("📭 Watchlist is empty");
      }
      return;
    }

    if (format === "text") {
      console.log(`📊 Checking ${stocks.length} stock(s)...`);
      if (includeFundamentals) {
        console.log("   Including Buffett scores for US stocks (this may take a while)\n");
      }
    }

    const status = await manager.getStatus(market, includeFundamentals, group);

    if (format === "json") {
      console.log(JSON.stringify(status, null, 2));
      if (status.failures.length > 0) {
        process.exit(1);
      }
      return;
    }

    if (format === "telegram") {
      if (status.stocks.length === 0) {
        console.log("⚠️ Could not fetch status for any watchlist stocks");
        printFailures(status.failures);
        process.exit(1);
      }
      console.log(formatStatusTelegram(status.stocks, status.checkedAt));
      if (status.failures.length > 0) {
        printFailures(status.failures);
        process.exit(1);
      }
      return;
    }

    if (status.stocks.length === 0) {
      console.log("⚠️  Could not fetch status for any watchlist stocks");
      printFailures(status.failures);
      process.exit(1);
      return;
    }

    console.log(`📊 Watchlist Status (${status.stocks.length}/${status.total} stocks)\n`);
    console.log(
      "Ticker     | Market | Price      | Change   | Williams %R | Status       | Buffett | Combined"
    );
    console.log(
      "-----------|--------|------------|----------|-------------|--------------|---------|----------"
    );
    for (const stock of status.stocks) {
      const buffett = stock.buffettScore !== undefined ? `${stock.buffettScore}/10` : "-";
      const combined =
        stock.combinedScore !== undefined ? `${stock.combinedScore.toFixed(0)}%` : "-";
      console.log(
        `${stock.ticker.padEnd(10)} | ${stock.market === "us" ? "US" : "TH"}    | $${stock.price.toFixed(2).padStart(9)} | ${formatChangePercent(stock.changePercent).padStart(8)} | ${stock.williamsR.toFixed(1).padStart(11)} | ${formatStatusLabel(stock.status).padEnd(12)} | ${buffett.padEnd(7)} | ${combined}`
      );
    }
    console.log(`\nChecked at: ${new Date(status.checkedAt).toLocaleString()}`);
    printFailures(status.failures);
    if (status.failures.length > 0) {
      process.exit(1);
    }
  } else if (command === "check") {
    const { market, group, format, minBuffettScore, dedupe } = parseCommonArgs(args.slice(1));
    let stocks = market ? manager.getByMarket(market) : manager.getAll();
    if (group) {
      stocks = stocks.filter((s) => s.group === group);
    }

    if (stocks.length === 0) {
      if (format === "json") {
        console.log(
          JSON.stringify(
            { total: 0, alerts: [], failures: [], skipped: 0, checkedAt: new Date().toISOString() },
            null,
            2
          )
        );
      } else {
        console.log("📭 Watchlist is empty");
      }
      return;
    }

    if (format === "text") {
      console.log(`🔔 Checking alerts for ${stocks.length} stock(s)...\n`);
    }

    const result = await manager.checkAlerts({ market, group, minBuffettScore, dedupe });

    if (format === "json") {
      console.log(JSON.stringify({ total: stocks.length, ...result }, null, 2));
    } else if (format === "telegram") {
      console.log(formatAlertsTelegram(result.alerts, result.failures, result.skipped));
    } else if (result.alerts.length === 0) {
      console.log(
        "✅ No new alerts — watchlist stocks are within normal ranges or repeats were suppressed"
      );
      if (result.skipped > 0) {
        console.log(`ℹ️  ${result.skipped} repeat alert(s) suppressed`);
      }
      printFailures(result.failures);
    } else {
      console.log(`🔔 New Alerts (${result.alerts.length}):\n`);
      for (const alert of result.alerts) {
        console.log(`[${alert.ticker}] ${alert.alertType}`);
        console.log(`  ${alert.message}`);
        const extra =
          alert.buffettScore !== undefined ? ` | Buffett: ${alert.buffettScore}/10` : "";
        console.log(
          `  Price: $${alert.currentPrice.toFixed(2)} | Williams %R: ${alert.currentWilliamsR.toFixed(1)}${extra}\n`
        );
      }
      if (result.skipped > 0) {
        console.log(`ℹ️  ${result.skipped} repeat alert(s) suppressed`);
      }
      printFailures(result.failures);
    }

    if (result.failures.length > 0) {
      process.exit(1);
    }
    if (result.alerts.length > 0) {
      process.exit(2);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Use 'npm run watchlist:list -- --help' for usage information");
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
