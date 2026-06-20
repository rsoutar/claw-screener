import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FormulaEngine } from "../src/formulas.js";
import type { Financials } from "../src/secApi.js";

function metric(value: number, end_date = "2024-12-31", form = "10-K"): Financials[string] {
  return { value, end_date, form };
}

function buildFinancials(overrides: Partial<Financials> = {}): Financials {
  return {
    CashAndCashEquivalentsAtCarryingValue: metric(50_000_000_000),
    ShortTermDebt: metric(10_000_000_000),
    LongTermDebt: metric(40_000_000_000),
    Liabilities: metric(100_000_000_000),
    StockholdersEquity: metric(80_000_000_000),
    NetIncomeLoss: metric(20_000_000_000),
    Revenues: metric(200_000_000_000),
    OperatingIncomeLoss: metric(40_000_000_000),
    CurrentAssets: metric(60_000_000_000),
    CurrentLiabilities: metric(30_000_000_000),
    InterestExpense: metric(-2_000_000_000),
    CashFlowFromContinuingOperatingActivities: metric(30_000_000_000),
    FreeCashFlow: metric(25_000_000_000),
    Assets: metric(160_000_000_000),
    ...overrides,
  };
}

describe("FormulaEngine", () => {
  describe("cashTest", () => {
    it("passes when cash covers all debt", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          CashAndCashEquivalentsAtCarryingValue: metric(60_000_000_000),
          ShortTermDebt: metric(10_000_000_000),
          LongTermDebt: metric(40_000_000_000),
        })
      );
      assert.equal(engine.cashTest().status, "PASS");
    });

    it("fails when cash does not cover debt", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          CashAndCashEquivalentsAtCarryingValue: metric(20_000_000_000),
          ShortTermDebt: metric(10_000_000_000),
          LongTermDebt: metric(40_000_000_000),
        })
      );
      assert.equal(engine.cashTest().status, "FAIL");
    });

    it("passes when there is no debt", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          ShortTermDebt: metric(0),
          LongTermDebt: metric(0),
        })
      );
      assert.equal(engine.cashTest().status, "PASS");
    });
  });

  describe("debtToEquity", () => {
    it("passes when ratio is below 0.5", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          Liabilities: metric(30_000_000_000),
          StockholdersEquity: metric(80_000_000_000),
        })
      );
      assert.equal(engine.debtToEquity().status, "PASS");
    });

    it("fails when ratio is above 0.5", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          Liabilities: metric(100_000_000_000),
          StockholdersEquity: metric(80_000_000_000),
        })
      );
      assert.equal(engine.debtToEquity().status, "FAIL");
    });

    it("fails when equity is zero", () => {
      const engine = new FormulaEngine(buildFinancials({ StockholdersEquity: metric(0) }));
      const result = engine.debtToEquity();
      assert.equal(result.status, "FAIL");
      assert.equal(result.value, 999);
    });
  });

  describe("returnOnEquity", () => {
    it("passes when ROE is above 15%", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          NetIncomeLoss: metric(20_000_000_000),
          StockholdersEquity: metric(80_000_000_000),
        })
      );
      assert.equal(engine.returnOnEquity().status, "PASS");
    });

    it("fails when ROE is below 15%", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          NetIncomeLoss: metric(5_000_000_000),
          StockholdersEquity: metric(80_000_000_000),
        })
      );
      assert.equal(engine.returnOnEquity().status, "FAIL");
    });

    it("fails on zero equity", () => {
      const engine = new FormulaEngine(buildFinancials({ StockholdersEquity: metric(0) }));
      assert.equal(engine.returnOnEquity().status, "FAIL");
    });
  });

  describe("currentRatio", () => {
    it("passes when ratio is above 1.5", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          CurrentAssets: metric(60_000_000_000),
          CurrentLiabilities: metric(30_000_000_000),
        })
      );
      assert.equal(engine.currentRatio().status, "PASS");
    });

    it("fails when ratio is below 1.5", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          CurrentAssets: metric(30_000_000_000),
          CurrentLiabilities: metric(30_000_000_000),
        })
      );
      assert.equal(engine.currentRatio().status, "FAIL");
    });

    it("passes when there are no current liabilities", () => {
      const engine = new FormulaEngine(buildFinancials({ CurrentLiabilities: metric(0) }));
      assert.equal(engine.currentRatio().status, "PASS");
    });
  });

  describe("operatingMargin", () => {
    it("passes when margin is above 12%", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          OperatingIncomeLoss: metric(40_000_000_000),
          Revenues: metric(200_000_000_000),
        })
      );
      assert.equal(engine.operatingMargin().status, "PASS");
    });

    it("fails when margin is below 12%", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          OperatingIncomeLoss: metric(10_000_000_000),
          Revenues: metric(200_000_000_000),
        })
      );
      assert.equal(engine.operatingMargin().status, "FAIL");
    });

    it("fails when there is no revenue", () => {
      const engine = new FormulaEngine(buildFinancials({ Revenues: metric(0) }));
      assert.equal(engine.operatingMargin().status, "FAIL");
    });
  });

  describe("assetTurnover", () => {
    it("passes when turnover is above 0.5", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          Revenues: metric(200_000_000_000),
          Assets: metric(160_000_000_000),
        })
      );
      assert.equal(engine.assetTurnover().status, "PASS");
    });

    it("fails when turnover is below 0.5", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          Revenues: metric(50_000_000_000),
          Assets: metric(160_000_000_000),
        })
      );
      assert.equal(engine.assetTurnover().status, "FAIL");
    });
  });

  describe("interestCoverage", () => {
    it("passes when coverage is above 3x", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          OperatingIncomeLoss: metric(40_000_000_000),
          InterestExpense: metric(-2_000_000_000),
        })
      );
      assert.equal(engine.interestCoverage().status, "PASS");
    });

    it("fails when coverage is below 3x", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          OperatingIncomeLoss: metric(5_000_000_000),
          InterestExpense: metric(-2_000_000_000),
        })
      );
      assert.equal(engine.interestCoverage().status, "FAIL");
    });

    it("passes when there is no interest expense", () => {
      const engine = new FormulaEngine(buildFinancials({ InterestExpense: metric(0) }));
      assert.equal(engine.interestCoverage().status, "PASS");
    });
  });

  describe("earningsStability", () => {
    it("passes when net income is positive", () => {
      const engine = new FormulaEngine(buildFinancials({ NetIncomeLoss: metric(1_000_000_000) }));
      assert.equal(engine.earningsStability().status, "PASS");
    });

    it("fails when net income is zero or negative", () => {
      const engine = new FormulaEngine(buildFinancials({ NetIncomeLoss: metric(-1_000_000_000) }));
      assert.equal(engine.earningsStability().status, "FAIL");
    });
  });

  describe("freeCashFlow", () => {
    it("passes when FCF is positive", () => {
      const engine = new FormulaEngine(buildFinancials({ FreeCashFlow: metric(25_000_000_000) }));
      assert.equal(engine.freeCashFlow().status, "PASS");
    });

    it("fails when FCF is zero", () => {
      const engine = new FormulaEngine(buildFinancials({ FreeCashFlow: metric(0) }));
      assert.equal(engine.freeCashFlow().status, "FAIL");
    });

    it("does not fall back to operating cash flow when FCF is zero", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          FreeCashFlow: metric(0),
          CashFlowFromContinuingOperatingActivities: metric(30_000_000_000),
        })
      );
      assert.equal(engine.freeCashFlow().status, "FAIL");
    });
  });

  describe("capitalAllocation", () => {
    it("passes when ROE > 15% and FCF is positive", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          NetIncomeLoss: metric(20_000_000_000),
          StockholdersEquity: metric(80_000_000_000),
          FreeCashFlow: metric(25_000_000_000),
        })
      );
      assert.equal(engine.capitalAllocation().status, "PASS");
    });

    it("fails when ROE passes but FCF is zero", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          NetIncomeLoss: metric(20_000_000_000),
          StockholdersEquity: metric(80_000_000_000),
          FreeCashFlow: metric(0),
        })
      );
      assert.equal(engine.capitalAllocation().status, "FAIL");
    });

    it("fails when FCF is positive but ROE is below 15%", () => {
      const engine = new FormulaEngine(
        buildFinancials({
          NetIncomeLoss: metric(5_000_000_000),
          StockholdersEquity: metric(80_000_000_000),
          FreeCashFlow: metric(25_000_000_000),
        })
      );
      assert.equal(engine.capitalAllocation().status, "FAIL");
    });
  });

  describe("evaluateAll and getScore", () => {
    it("returns 10 results", () => {
      const engine = new FormulaEngine(buildFinancials());
      assert.equal(engine.evaluateAll().length, 10);
    });

    it("getScore counts passing formulas", () => {
      const engine = new FormulaEngine(buildFinancials());
      const results = engine.evaluateAll();
      const score = engine.getScore(results);
      assert.equal(score, results.filter((r) => r.status === "PASS").length);
    });

    it("getScore does not re-evaluate when results are passed in", () => {
      const engine = new FormulaEngine(buildFinancials());
      const results = engine.evaluateAll();
      const scoreFromResults = engine.getScore(results);
      const scoreFromReeval = engine.getScore();
      assert.equal(scoreFromResults, scoreFromReeval);
    });
  });
});
