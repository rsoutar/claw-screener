export type Market = "us" | "th";

export type OutputFormat = "text" | "json" | "telegram";

export function normalizeMarket(value: string): Market {
  const lower = value.toLowerCase();
  if (lower === "us") return "us";
  if (lower === "th" || lower === "bk") return "th";
  throw new Error(`Invalid market '${value}'. Use 'us', 'th', or 'bk'.`);
}

export function isMarket(value: string): value is Market {
  return value === "us" || value === "th";
}

export function marketToYahooSuffix(market: Market): string {
  return market === "th" ? ".BK" : "";
}
