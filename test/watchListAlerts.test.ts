import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAlertsForStock } from "../src/watchListUtils.js";
import type { WatchedStock } from "../src/watchListTypes.js";

function makeStock(overrides: Partial<WatchedStock> = {}): WatchedStock {
  return {
    ticker: "AAPL",
    market: "us",
    addedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildAlertsForStock", () => {
  it("fires oversold alert when Williams %R is below -80", () => {
    const alerts = buildAlertsForStock(makeStock(), -85, 150);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].alertType, "oversold");
    assert.equal(alerts[0].currentPrice, 150);
    assert.equal(alerts[0].currentWilliamsR, -85);
  });

  it("fires overbought alert when Williams %R is above -20", () => {
    const alerts = buildAlertsForStock(makeStock(), -10, 150);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].alertType, "overbought");
  });

  it("fires no oversold/overbought alert in the normal range", () => {
    const alerts = buildAlertsForStock(makeStock(), -50, 150);
    assert.equal(alerts.length, 0);
  });

  it("oversold and overbought are mutually exclusive", () => {
    const oversold = buildAlertsForStock(makeStock(), -90, 150);
    const overbought = buildAlertsForStock(makeStock(), -5, 150);
    assert.ok(!oversold.some((a) => a.alertType === "overbought"));
    assert.ok(!overbought.some((a) => a.alertType === "oversold"));
  });

  it("fires threshold alert when WR is below the stock's custom threshold", () => {
    const alerts = buildAlertsForStock(makeStock({ alertThreshold: -75 }), -80, 150);
    const thresholdAlert = alerts.find((a) => a.alertType === "threshold");
    assert.ok(thresholdAlert, "expected a threshold alert");
    assert.equal(thresholdAlert?.currentWilliamsR, -80);
  });

  it("does not fire threshold alert when WR is above the custom threshold", () => {
    const alerts = buildAlertsForStock(makeStock({ alertThreshold: -85 }), -80, 150);
    assert.ok(!alerts.some((a) => a.alertType === "threshold"));
  });

  it("fires quality alert when oversold and Buffett score meets threshold", () => {
    const alerts = buildAlertsForStock(makeStock({ minBuffettScore: 6 }), -85, 150, 8, undefined);
    const quality = alerts.find((a) => a.alertType === "quality");
    assert.ok(quality, "expected a quality alert");
    assert.equal(quality?.buffettScore, 8);
    assert.ok(quality?.combinedScore !== undefined);
  });

  it("does not fire quality alert when not oversold even with high Buffett score", () => {
    const alerts = buildAlertsForStock(makeStock({ minBuffettScore: 6 }), -50, 150, 8, undefined);
    assert.ok(!alerts.some((a) => a.alertType === "quality"));
  });

  it("does not fire quality alert when oversold but Buffett score is too low", () => {
    const alerts = buildAlertsForStock(makeStock({ minBuffettScore: 7 }), -85, 150, 5, undefined);
    assert.ok(!alerts.some((a) => a.alertType === "quality"));
  });

  it("uses the global minBuffettScore when the stock has none set", () => {
    const alerts = buildAlertsForStock(makeStock(), -85, 150, 7, 5);
    assert.ok(alerts.some((a) => a.alertType === "quality"));
  });

  it("can fire oversold + threshold + quality simultaneously", () => {
    const alerts = buildAlertsForStock(
      makeStock({ alertThreshold: -75, minBuffettScore: 6 }),
      -85,
      150,
      8,
      undefined
    );
    const types = alerts.map((a) => a.alertType).sort();
    assert.deepEqual(types, ["oversold", "quality", "threshold"]);
  });
});
