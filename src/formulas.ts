import { Financials } from "./secApi.js";
import type { BuffettThresholds } from "./config.js";
import { resolveConfig } from "./config.js";

export type FormulaStatus = "PASS" | "FAIL" | "N/A";

export interface FormulaResult {
  name: string;
  status: FormulaStatus;
  value: number;
  target: string;
  message: string;
}

const DEFAULT_THRESHOLDS: BuffettThresholds = resolveConfig().buffett;

export class FormulaEngine {
  private financials: Financials;
  private thresholds: BuffettThresholds;

  constructor(financials: Financials, thresholds?: BuffettThresholds) {
    this.financials = financials;
    this.thresholds = thresholds ?? DEFAULT_THRESHOLDS;
  }

  private getValue(key: string, defaultValue: number = 0): number {
    if (key in this.financials) {
      return this.financials[key].value;
    }
    return defaultValue;
  }

  cashTest(): FormulaResult {
    const cash = this.getValue("CashAndCashEquivalentsAtCarryingValue");
    const shortTermDebt = this.getValue("ShortTermDebt");
    const longTermDebt = this.getValue("LongTermDebt");
    const totalDebt = shortTermDebt + longTermDebt;

    if (totalDebt === 0) {
      return {
        name: "Cash Test",
        status: "PASS",
        value: cash,
        target: "> Total Debt",
        message: "No debt (N/A - effectively PASS)",
      };
    }

    const ratio = cash / totalDebt;
    const status: FormulaStatus = ratio > 1.0 ? "PASS" : "FAIL";

    return {
      name: "Cash Test",
      status,
      value: ratio,
      target: "> 1.0x",
      message: `Coverage: ${ratio.toFixed(2)}x`,
    };
  }

  debtToEquity(): FormulaResult {
    const liabilities = this.getValue("Liabilities");
    const equity = this.getValue("StockholdersEquity");
    const target = this.thresholds.debtToEquity;

    if (equity === 0) {
      return {
        name: "Debt-to-Equity",
        status: "FAIL",
        value: 999,
        target: `< ${target}`,
        message: "No equity data",
      };
    }

    const ratio = liabilities / equity;
    const status: FormulaStatus = ratio < target ? "PASS" : "FAIL";

    return {
      name: "Debt-to-Equity",
      status,
      value: ratio,
      target: `< ${target}`,
      message: `Ratio: ${ratio.toFixed(2)}`,
    };
  }

  returnOnEquity(): FormulaResult {
    const netIncome = this.getValue("NetIncomeLoss");
    const equity = this.getValue("StockholdersEquity");
    const target = this.thresholds.roe;

    if (equity === 0 || netIncome === 0) {
      return {
        name: "ROE",
        status: "FAIL",
        value: 0,
        target: `> ${target}%`,
        message: "Insufficient data",
      };
    }

    const roe = (netIncome / equity) * 100;
    const status: FormulaStatus = roe > target ? "PASS" : "FAIL";

    return {
      name: "ROE",
      status,
      value: roe,
      target: `> ${target}%`,
      message: `${roe.toFixed(1)}%`,
    };
  }

  currentRatio(): FormulaResult {
    const currentAssets = this.getValue("CurrentAssets");
    const currentLiabilities = this.getValue("CurrentLiabilities");
    const target = this.thresholds.currentRatio;

    if (currentLiabilities === 0) {
      return {
        name: "Current Ratio",
        status: "PASS",
        value: 999,
        target: `> ${target}`,
        message: "No current liabilities (N/A - effectively PASS)",
      };
    }

    const ratio = currentAssets / currentLiabilities;
    const status: FormulaStatus = ratio > target ? "PASS" : "FAIL";

    return {
      name: "Current Ratio",
      status,
      value: ratio,
      target: `> ${target}`,
      message: `Ratio: ${ratio.toFixed(2)}`,
    };
  }

  operatingMargin(): FormulaResult {
    const operatingIncome = this.getValue("OperatingIncomeLoss");
    const revenue = this.getValue("Revenues");
    const target = this.thresholds.operatingMargin;

    if (revenue === 0) {
      return {
        name: "Operating Margin",
        status: "FAIL",
        value: 0,
        target: `> ${target}%`,
        message: "No revenue data",
      };
    }

    const margin = (operatingIncome / revenue) * 100;
    const status: FormulaStatus = margin > target ? "PASS" : "FAIL";

    return {
      name: "Operating Margin",
      status,
      value: margin,
      target: `> ${target}%`,
      message: `${margin.toFixed(1)}%`,
    };
  }

  assetTurnover(): FormulaResult {
    const revenue = this.getValue("Revenues");
    const assets = this.getValue("Assets");
    const target = this.thresholds.assetTurnover;

    if (assets === 0) {
      return {
        name: "Asset Turnover",
        status: "FAIL",
        value: 0,
        target: `> ${target}`,
        message: "No asset data",
      };
    }

    const turnover = revenue / assets;
    const status: FormulaStatus = turnover > target ? "PASS" : "FAIL";

    return {
      name: "Asset Turnover",
      status,
      value: turnover,
      target: `> ${target}`,
      message: turnover.toFixed(2),
    };
  }

  interestCoverage(): FormulaResult {
    const operatingIncome = this.getValue("OperatingIncomeLoss");
    const interestExpense = this.getValue("InterestExpense");
    const target = this.thresholds.interestCoverage;

    if (interestExpense === 0) {
      return {
        name: "Interest Coverage",
        status: "PASS",
        value: 999,
        target: `> ${target}x`,
        message: "No interest expense (N/A - effectively PASS)",
      };
    }

    const coverage = operatingIncome / Math.abs(interestExpense);
    const status: FormulaStatus = coverage > target ? "PASS" : "FAIL";

    return {
      name: "Interest Coverage",
      status,
      value: coverage,
      target: `> ${target}x`,
      message: `${coverage.toFixed(1)}x`,
    };
  }

  earningsStability(): FormulaResult {
    const netIncome = this.getValue("NetIncomeLoss");
    const status: FormulaStatus = netIncome > 0 ? "PASS" : "FAIL";

    return {
      name: "Earnings Stability",
      status,
      value: netIncome > 0 ? 1 : 0,
      target: "8+/10 years positive",
      message: "Based on latest year only (full history requires more data)",
    };
  }

  freeCashFlow(): FormulaResult {
    const fcf = this.getValue("FreeCashFlow");
    const status: FormulaStatus = fcf > 0 ? "PASS" : "FAIL";

    return {
      name: "Free Cash Flow",
      status,
      value: fcf,
      target: "> 0",
      message: `$${(fcf / 1_000_000).toFixed(0)}M`,
    };
  }

  capitalAllocation(): FormulaResult {
    const roeResult = this.returnOnEquity();
    const fcf = this.getValue("FreeCashFlow");
    const hasPositiveFcf = fcf > 0;
    const status: FormulaStatus = roeResult.status === "PASS" && hasPositiveFcf ? "PASS" : "FAIL";

    return {
      name: "Capital Allocation",
      status,
      value: roeResult.value,
      target: "> 15% ROE & FCF > 0",
      message: `ROE: ${roeResult.message}, FCF: ${hasPositiveFcf ? "positive" : "negative/zero"}`,
    };
  }

  evaluateAll(): FormulaResult[] {
    return [
      this.cashTest(),
      this.debtToEquity(),
      this.returnOnEquity(),
      this.currentRatio(),
      this.operatingMargin(),
      this.assetTurnover(),
      this.interestCoverage(),
      this.earningsStability(),
      this.freeCashFlow(),
      this.capitalAllocation(),
    ];
  }

  getScore(results?: FormulaResult[]): number {
    const evald = results ?? this.evaluateAll();
    return evald.filter((r) => r.status === "PASS").length;
  }
}

if (import.meta.main) {
  const dummyFinancials: Financials = {
    CashAndCashEquivalentsAtCarryingValue: {
      value: 50000000000,
      end_date: "2024-09-28",
      form: "10-K",
    },
    ShortTermDebt: { value: 15000000000, end_date: "2024-09-28", form: "10-K" },
    LongTermDebt: { value: 100000000000, end_date: "2024-09-28", form: "10-K" },
    Liabilities: { value: 290000000000, end_date: "2024-09-28", form: "10-K" },
    StockholdersEquity: {
      value: 62000000000,
      end_date: "2024-09-28",
      form: "10-K",
    },
    NetIncomeLoss: { value: 97000000000, end_date: "2024-09-28", form: "10-K" },
    Revenues: { value: 383000000000, end_date: "2024-09-28", form: "10-K" },
    OperatingIncomeLoss: {
      value: 114000000000,
      end_date: "2024-09-28",
      form: "10-K",
    },
    CurrentAssets: { value: 135000000000, end_date: "2024-09-28", form: "10-K" },
    CurrentLiabilities: {
      value: 153000000000,
      end_date: "2024-09-28",
      form: "10-K",
    },
    InterestExpense: { value: -2900000000, end_date: "2024-09-28", form: "10-K" },
    CashFlowFromContinuingOperatingActivities: {
      value: 110000000000,
      end_date: "2024-09-28",
      form: "10-K",
    },
  };

  const engine = new FormulaEngine(dummyFinancials);
  const results = engine.evaluateAll();

  console.log("Buffett Formula Results:");
  console.log(`Score: ${engine.getScore(results)}/10\n`);

  for (const result of results) {
    const symbol = result.status === "PASS" ? "✅" : "❌";
    console.log(`${symbol} ${result.name}: ${result.message} (Target: ${result.target})`);
  }
}
