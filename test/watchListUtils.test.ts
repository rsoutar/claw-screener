import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateCombinedScore,
  inferMarketFromTicker,
  parseTickerList,
  shouldEmitAlert,
} from "../src/watchListUtils.js";

describe("watchListUtils", () => {
  it("parses comma-separated tickers uniquely", () => {
    assert.deepEqual(parseTickerList("aapl, msft,AAPL"), ["AAPL", "MSFT"]);
  });

  it("calculates combined score using screening weights", () => {
    const score = calculateCombinedScore(-80, 8);
    assert.equal(score, 0.3 * ((-80 + 100) / 100) + 0.7 * 80);
  });

  it("infers Thai market from .BK suffix", () => {
    assert.equal(inferMarketFromTicker("PTT.BK"), "th");
    assert.equal(inferMarketFromTicker("AAPL"), "us");
  });

  it("deduplicates repeated alert types", () => {
    assert.equal(shouldEmitAlert(["oversold"], "oversold", true), false);
    assert.equal(shouldEmitAlert(["oversold"], "threshold", true), true);
    assert.equal(shouldEmitAlert(["oversold"], "oversold", false), true);
  });
});