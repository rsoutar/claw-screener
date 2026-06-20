import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateWilliamsR, interpretWilliamsR } from "../src/technicalIndicators.js";
import type { OHLC } from "../src/database.js";

function buildPrices(closes: number[]): OHLC[] {
  return closes.map((close, index) => ({
    Date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    Open: close,
    High: close + 1,
    Low: close - 1,
    Close: close,
    Volume: 1000,
  }));
}

describe("technicalIndicators", () => {
  it("returns NaN until the Williams %R period is satisfied", () => {
    const prices = buildPrices(Array.from({ length: 20 }, (_, i) => 100 + i));
    const values = calculateWilliamsR(prices, 21);
    assert.ok(Number.isNaN(values[values.length - 1]));
  });

  it("marks deeply depressed closes as oversold", () => {
    const closes = [...Array.from({ length: 20 }, () => 100), 80];
    const values = calculateWilliamsR(buildPrices(closes), 21);
    const latest = values[values.length - 1];
    assert.ok(latest < -80);
    assert.equal(interpretWilliamsR(latest), "oversold");
  });
});