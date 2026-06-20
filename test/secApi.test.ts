import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractFinancialFacts } from "../src/secApi.js";
import type { CompanyFactsResponse } from "../src/secApi.js";

interface UnitEntry {
  val: number;
  end: string;
  form: string;
  fp?: string;
}

function buildFacts(tagData: Record<string, UnitEntry[]>): CompanyFactsResponse {
  return {
    facts: {
      "us-gaap": Object.fromEntries(
        Object.entries(tagData).map(([tag, entries]) => [tag, { units: { USD: entries } }])
      ),
    },
  };
}

describe("extractFinancialFacts", () => {
  it("picks the latest entry by end date when array is unsorted", () => {
    const facts = buildFacts({
      Assets: [
        { val: 100_000, end: "2020-12-31", form: "10-K" },
        { val: 300_000, end: "2022-12-31", form: "10-K" },
        { val: 200_000, end: "2021-12-31", form: "10-K" },
      ],
    });

    const result = extractFinancialFacts(facts);
    assert.equal(result.Assets?.value, 300_000);
    assert.equal(result.Assets?.end_date, "2022-12-31");
  });

  it("prefers 10-K filings over 10-Q when both are present", () => {
    const facts = buildFacts({
      NetIncomeLoss: [
        { val: 50_000, end: "2023-03-31", form: "10-Q" },
        { val: 200_000, end: "2022-12-31", form: "10-K" },
        { val: 60_000, end: "2023-06-30", form: "10-Q" },
      ],
    });

    const result = extractFinancialFacts(facts);
    assert.equal(result.NetIncomeLoss?.value, 200_000);
    assert.equal(result.NetIncomeLoss?.end_date, "2022-12-31");
    assert.equal(result.NetIncomeLoss?.form, "10-K");
  });

  it("falls back to latest non-10-K when no 10-K exists", () => {
    const facts = buildFacts({
      Revenues: [
        { val: 10_000, end: "2023-03-31", form: "10-Q" },
        { val: 15_000, end: "2023-06-30", form: "10-Q" },
      ],
    });

    const result = extractFinancialFacts(facts);
    assert.equal(result.Revenues?.value, 15_000);
  });

  it("skips tags that are absent from facts", () => {
    const facts = buildFacts({ Assets: [{ val: 100, end: "2022-12-31", form: "10-K" }] });
    const result = extractFinancialFacts(facts);
    assert.ok("Assets" in result);
    assert.ok(!("Liabilities" in result));
  });

  it("returns empty Financials when facts are empty", () => {
    const result = extractFinancialFacts({ facts: { "us-gaap": {} } });
    assert.equal(Object.keys(result).length, 0);
  });

  it("returns empty Financials when facts is undefined", () => {
    const result = extractFinancialFacts({});
    assert.equal(Object.keys(result).length, 0);
  });

  it("skips entries with non-numeric val", () => {
    const facts = buildFacts({
      Assets: [{ val: "not a number" as unknown as number, end: "2022-12-31", form: "10-K" }],
    });
    const result = extractFinancialFacts(facts);
    assert.ok(!("Assets" in result));
  });

  it("extracts all known tags when present", () => {
    const facts = buildFacts({
      Assets: [{ val: 1, end: "2022-12-31", form: "10-K" }],
      Liabilities: [{ val: 2, end: "2022-12-31", form: "10-K" }],
      StockholdersEquity: [{ val: 3, end: "2022-12-31", form: "10-K" }],
      CashAndCashEquivalentsAtCarryingValue: [{ val: 4, end: "2022-12-31", form: "10-K" }],
      NetIncomeLoss: [{ val: 5, end: "2022-12-31", form: "10-K" }],
      Revenues: [{ val: 6, end: "2022-12-31", form: "10-K" }],
      OperatingIncomeLoss: [{ val: 7, end: "2022-12-31", form: "10-K" }],
      CashFlowFromContinuingOperatingActivities: [{ val: 8, end: "2022-12-31", form: "10-K" }],
      InterestExpense: [{ val: 9, end: "2022-12-31", form: "10-K" }],
      AssetsCurrent: [{ val: 10, end: "2022-12-31", form: "10-K" }],
      LiabilitiesCurrent: [{ val: 11, end: "2022-12-31", form: "10-K" }],
      LongTermDebt: [{ val: 12, end: "2022-12-31", form: "10-K" }],
      ShortTermDebt: [{ val: 13, end: "2022-12-31", form: "10-K" }],
    });

    const result = extractFinancialFacts(facts);
    assert.equal(Object.keys(result).length, 13);
  });
});
