import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TICKER_FILE = join(__dirname, "..", "scripts", "set.txt");
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9&-]{0,9}$/;

export function parseTickerLines(content: string): string[] {
  const tickers: string[] = [];
  const seen = new Set<string>();
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line === "SET" || line === "BK") continue;
    if (TICKER_PATTERN.test(line) && !seen.has(line)) {
      seen.add(line);
      tickers.push(`${line}.BK`);
    }
  }
  return tickers;
}

function loadTickers(): string[] {
  if (existsSync(TICKER_FILE)) {
    const content = readFileSync(TICKER_FILE, "utf-8");
    return parseTickerLines(content);
  }
  return [];
}

export const POPULAR_SET_TICKERS = loadTickers();

export function getThaiTickers(): string[] {
  return POPULAR_SET_TICKERS;
}

export function getTickerSymbol(ticker: string): string {
  return ticker.replace(".BK", "");
}

export function isThaiTicker(ticker: string): boolean {
  return ticker.toUpperCase().endsWith(".BK");
}

if (import.meta.main) {
  const tickers = getThaiTickers();
  console.log(`Found ${tickers.length} Thai SET tickers`);
  console.log(tickers.slice(0, 10), "...");
}
