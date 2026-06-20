import type { AlertResult, Market, StockFailure, StockStatus } from "./watchListTypes.js";

export type OutputFormat = "text" | "json" | "telegram";

export function parseTickerList(input: string): string[] {
  return [...new Set(input.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean))];
}

export function calculateCombinedScore(williamsR: number, buffettScore: number): number {
  const techScore = (williamsR + 100) / 100;
  const fundamentalScore = (buffettScore / 10) * 100;
  return techScore * 0.3 + fundamentalScore * 0.7;
}

export function inferMarketFromTicker(ticker: string): Market {
  return ticker.toUpperCase().endsWith(".BK") ? "th" : "us";
}

export function shouldEmitAlert(
  lastAlertTypes: AlertResult["alertType"][] | undefined,
  alertType: AlertResult["alertType"],
  dedupe: boolean
): boolean {
  if (!dedupe) {
    return true;
  }
  return !lastAlertTypes?.includes(alertType);
}

export function formatChangePercent(changePercent: number): string {
  const sign = changePercent >= 0 ? "+" : "";
  return `${sign}${changePercent.toFixed(2)}%`;
}

export function formatStatusLabel(status: StockStatus["status"]): string {
  switch (status) {
    case "oversold":
      return "🔻 oversold";
    case "overbought":
      return "🔺 overbought";
    case "alert":
      return "⚠️  alert";
    case "quality":
      return "🌟 quality";
    default:
      return "normal";
  }
}

export function formatStatusTelegram(stocks: StockStatus[], checkedAt: string): string {
  const lines = [`📊 Watchlist Status (${stocks.length} stocks)`, `Checked: ${new Date(checkedAt).toLocaleString()}`, ""];

  for (const stock of stocks) {
    const buffett = stock.buffettScore !== undefined ? ` | Buffett: ${stock.buffettScore}/10` : "";
    const combined = stock.combinedScore !== undefined
      ? ` | Combined: ${stock.combinedScore.toFixed(0)}%`
      : "";
    lines.push(
      `**${stock.ticker}** (${stock.market.toUpperCase()}) — $${stock.price.toFixed(2)} ` +
        `(${formatChangePercent(stock.changePercent)}) | WR: ${stock.williamsR.toFixed(1)} ` +
        `| ${stock.status}${buffett}${combined}`
    );
  }

  return lines.join("\n");
}

export function formatAlertsTelegram(
  alerts: AlertResult[],
  failures: StockFailure[],
  skipped: number
): string {
  const lines: string[] = [];

  if (alerts.length > 0) {
    lines.push(`🔔 Watchlist Alerts (${alerts.length})`, "");
    for (const alert of alerts) {
      const extra = alert.buffettScore !== undefined
        ? ` | Buffett: ${alert.buffettScore}/10`
        : "";
      lines.push(
        `**${alert.ticker}** — ${alert.alertType}`,
        alert.message,
        `Price: $${alert.currentPrice.toFixed(2)} | WR: ${alert.currentWilliamsR.toFixed(1)}${extra}`,
        ""
      );
    }
  } else {
    lines.push("✅ No new watchlist alerts");
  }

  if (skipped > 0) {
    lines.push(`ℹ️ ${skipped} repeat alert(s) suppressed`);
  }

  if (failures.length > 0) {
    lines.push("", `⚠️ Could not check ${failures.length} stock(s):`);
    for (const failure of failures) {
      lines.push(`- ${failure.ticker}: ${failure.reason}`);
    }
  }

  return lines.join("\n");
}