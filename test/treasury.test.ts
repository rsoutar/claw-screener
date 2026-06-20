import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { clearRiskFreeRateCache, fetchRiskFreeRate } from "../src/treasury.js";

function buildTreasuryCsv(yieldValue: string): string {
  const headers = [
    "Date",
    "1 Mo",
    "2 Mo",
    "3 Mo",
    "4 Mo",
    "6 Mo",
    "1 Yr",
    "2 Yr",
    "3 Yr",
    "5 Yr",
    "7 Yr",
    "10 Yr",
    "20 Yr",
    "30 Yr",
  ];
  const emptyFields = Array(10).fill("");
  const fields = ["06/20/2026", ...emptyFields, yieldValue, "4.95", "4.80"];
  return `${headers.join(",")}\n${fields.join(",")}`;
}

describe("fetchRiskFreeRate", () => {
  beforeEach(() => {
    clearRiskFreeRateCache();
  });

  it("returns the fallback on network failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.reject(new Error("network error"))) as typeof globalThis.fetch;

    try {
      const rate = await fetchRiskFreeRate(0.1);
      assert.equal(rate, 0.1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns the fallback on non-OK response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response("Not Found", { status: 404 }))) as typeof globalThis.fetch;

    try {
      const rate = await fetchRiskFreeRate(0.1);
      assert.equal(rate, 0.1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("parses the 10Y Treasury yield from CSV", async () => {
    const originalFetch = globalThis.fetch;
    const csv = buildTreasuryCsv("4.25");
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(csv, { status: 200, headers: { "Content-Type": "text/csv" } })
      )) as typeof globalThis.fetch;

    try {
      const rate = await fetchRiskFreeRate(0.1);
      assert.equal(rate, 0.0425);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns fallback when yield is N/A", async () => {
    const originalFetch = globalThis.fetch;
    const csv = buildTreasuryCsv("N/A");
    globalThis.fetch = (() =>
      Promise.resolve(new Response(csv, { status: 200 }))) as typeof globalThis.fetch;

    try {
      const rate = await fetchRiskFreeRate(0.1);
      assert.equal(rate, 0.1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns fallback when yield is unreasonably high", async () => {
    const originalFetch = globalThis.fetch;
    const csv = buildTreasuryCsv("50.0");
    globalThis.fetch = (() =>
      Promise.resolve(new Response(csv, { status: 200 }))) as typeof globalThis.fetch;

    try {
      const rate = await fetchRiskFreeRate(0.1);
      assert.equal(rate, 0.1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns fallback on empty response body", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response("", { status: 200 }))) as typeof globalThis.fetch;

    try {
      const rate = await fetchRiskFreeRate(0.1);
      assert.equal(rate, 0.1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("caches the rate for subsequent calls", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    const csv = buildTreasuryCsv("4.50");
    globalThis.fetch = (() => {
      callCount++;
      return Promise.resolve(new Response(csv, { status: 200 }));
    }) as typeof globalThis.fetch;

    try {
      await fetchRiskFreeRate(0.1);
      await fetchRiskFreeRate(0.1);
      assert.equal(callCount, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
