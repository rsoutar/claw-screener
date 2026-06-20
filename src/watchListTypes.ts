export type Market = "us" | "th";

export interface WatchedStock {
  ticker: string;
  market: Market;
  addedAt: string;
  notes?: string;
  alertThreshold?: number;
  minBuffettScore?: number;
  lastPrice?: number;
  lastWilliamsR?: number;
  lastBuffettScore?: number;
  lastCheckedAt?: string;
  lastAlertTypes?: AlertResult["alertType"][];
  lastAlertAt?: string;
}

export interface WatchListData {
  stocks: WatchedStock[];
  updatedAt: string;
}

export interface StockFailure {
  ticker: string;
  market: Market;
  reason: string;
}

export interface StockStatus {
  ticker: string;
  market: Market;
  williamsR: number;
  price: number;
  changePercent: number;
  status: "normal" | "oversold" | "overbought" | "alert" | "quality";
  buffettScore?: number;
  combinedScore?: number;
}

export interface WatchListStatus {
  total: number;
  stocks: StockStatus[];
  failures: StockFailure[];
  checkedAt: string;
}

export interface AlertResult {
  ticker: string;
  market: Market;
  alertType: "oversold" | "overbought" | "threshold" | "quality";
  message: string;
  currentPrice: number;
  currentWilliamsR: number;
  buffettScore?: number;
  combinedScore?: number;
}

export interface CheckAlertsResult {
  alerts: AlertResult[];
  failures: StockFailure[];
  skipped: number;
  checkedAt: string;
}

export interface CheckAlertsOptions {
  market?: Market;
  minBuffettScore?: number;
  dedupe?: boolean;
}