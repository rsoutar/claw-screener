import type {
  AlertResult,
  Market,
  StockFailure,
  StockStatus,
  WatchedStock,
} from "./watchListTypes.js";
import { isThaiTicker } from "./thaiTickers.js";
import { resolveConfig } from "./config.js";
export type { OutputFormat } from "./types.js";

export function parseTickerList(input: string): string[] {
  return [
    ...new Set(
      input
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
}

export function calculateCombinedScore(williamsR: number, buffettScore: number): number {
  const { tech, fundamental } = resolveConfig().screening;
  const techScore = (williamsR + 100) / 100;
  const fundamentalScore = (buffettScore / 10) * 100;
  return techScore * tech + fundamentalScore * fundamental;
}

export function inferMarketFromTicker(ticker: string): Market {
  return isThaiTicker(ticker) ? "th" : "us";
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

export function buildAlertsForStock(
  stock: Pick<WatchedStock, "ticker" | "market" | "alertThreshold" | "minBuffettScore">,
  currentWR: number,
  currentPrice: number,
  buffettScore?: number,
  minBuffettScore?: number
): AlertResult[] {
  const alerts: AlertResult[] = [];

  if (currentWR < -80) {
    alerts.push({
      ticker: stock.ticker,
      market: stock.market,
      alertType: "oversold",
      message: `${stock.ticker} is oversold (Williams %R: ${currentWR.toFixed(1)}) - potential buying opportunity`,
      currentPrice,
      currentWilliamsR: currentWR,
    });
  } else if (currentWR > -20) {
    alerts.push({
      ticker: stock.ticker,
      market: stock.market,
      alertType: "overbought",
      message: `${stock.ticker} is overbought (Williams %R: ${currentWR.toFixed(1)})`,
      currentPrice,
      currentWilliamsR: currentWR,
    });
  }

  if (stock.alertThreshold !== undefined && currentWR < stock.alertThreshold) {
    alerts.push({
      ticker: stock.ticker,
      market: stock.market,
      alertType: "threshold",
      message: `${stock.ticker} hit custom threshold (Williams %R: ${currentWR.toFixed(1)}, threshold: ${stock.alertThreshold})`,
      currentPrice,
      currentWilliamsR: currentWR,
    });
  }

  const qualityThreshold = stock.minBuffettScore ?? minBuffettScore;
  if (
    qualityThreshold !== undefined &&
    currentWR < -80 &&
    buffettScore !== undefined &&
    buffettScore >= qualityThreshold
  ) {
    const combinedScore = calculateCombinedScore(currentWR, buffettScore);
    alerts.push({
      ticker: stock.ticker,
      market: stock.market,
      alertType: "quality",
      message: `${stock.ticker} is oversold with strong fundamentals (Buffett: ${buffettScore}/10, combined: ${combinedScore.toFixed(0)}%)`,
      currentPrice,
      currentWilliamsR: currentWR,
      buffettScore,
      combinedScore,
    });
  }

  return alerts;
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
  const lines = [
    `📊 Watchlist Status (${stocks.length} stocks)`,
    `Checked: ${new Date(checkedAt).toLocaleString()}`,
    "",
  ];

  for (const stock of stocks) {
    const buffett = stock.buffettScore !== undefined ? ` | Buffett: ${stock.buffettScore}/10` : "";
    const combined =
      stock.combinedScore !== undefined ? ` | Combined: ${stock.combinedScore.toFixed(0)}%` : "";
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
      const extra = alert.buffettScore !== undefined ? ` | Buffett: ${alert.buffettScore}/10` : "";
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
