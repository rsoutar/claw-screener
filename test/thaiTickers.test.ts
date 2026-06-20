import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTickerLines } from "../src/thaiTickers.js";

describe("parseTickerLines", () => {
  it("parses standard 2-line records (ticker then name)", () => {
    const content = [
      "PTT",
      "บริษัท ปตท. จำกัด (มหาชน)\tPTT PUBLIC COMPANY LIMITED\tSET",
      "AOT",
      "บริษัท ท่าอากาศยานไทย จำกัด (มหาชน)\tAIRPORTS OF THAILAND PUBLIC COMPANY LIMITED\tSET",
    ].join("\n");

    const tickers = parseTickerLines(content);
    assert.deepEqual(tickers, ["PTT.BK", "AOT.BK"]);
  });

  it("parses 4-line REIT records (ticker, Thai name, English name, SET)", () => {
    const content = [
      "AIMCG",
      "ทรัสต์เพื่อการลงทุกในอสังหาริมทรัพย์ เอไอเอ็ม คอมเมอร์เชียล",
      "AIM COMMERCIAL GROWTH FREEHOLD AND LEASEHOLD REAL ESTATE INVESTMENT TRUST",
      "SET",
    ].join("\n");

    const tickers = parseTickerLines(content);
    assert.deepEqual(tickers, ["AIMCG.BK"]);
  });

  it("handles mixed 2-line and 4-line records without desync", () => {
    const content = [
      "PTT",
      "บริษัท ปตท. จำกัด (มหาชน)\tPTT PUBLIC COMPANY LIMITED\tSET",
      "AIMCG",
      "ทรัสต์เพื่อการลงทุกในอสังหาริมทรัพย์ เอไอเอ็ม คอมเมอร์เชียล",
      "AIM COMMERCIAL GROWTH FREEHOLD AND LEASEHOLD REAL ESTATE INVESTMENT TRUST",
      "SET",
      "AOT",
      "บริษัท ท่าอากาศยานไทย จำกัด (มหาชน)\tAIRPORTS OF THAILAND PUBLIC COMPANY LIMITED\tSET",
    ].join("\n");

    const tickers = parseTickerLines(content);
    assert.deepEqual(tickers, ["PTT.BK", "AIMCG.BK", "AOT.BK"]);
  });

  it("includes tickers with special characters (&, -, digits)", () => {
    const content = [
      "2S",
      "บริษัท 2 เอส เมทัล จำกัด (มหาชน)\t2S METAL PUBLIC COMPANY LIMITED\tSET",
      "B-WORK",
      "บริษัท บี เวิร์ค จำกัด\tB-WORK PUBLIC COMPANY LIMITED\tSET",
      "S&J",
      "บริษัท เอส แอนด์ เจ จำกัด\tS&J PUBLIC COMPANY LIMITED\tSET",
      "3BBIF",
      "กองทุนรวม 3BB\t3BB INTERNET INFRASTRUCTURE FUND\tSET",
    ].join("\n");

    const tickers = parseTickerLines(content);
    assert.deepEqual(tickers, ["2S.BK", "B-WORK.BK", "S&J.BK", "3BBIF.BK"]);
  });

  it("skips the literal SET and BK markers", () => {
    const content = ["SET", "some name line", "BK", "another name line"].join("\n");
    const tickers = parseTickerLines(content);
    assert.deepEqual(tickers, []);
  });

  it("deduplicates identical tickers", () => {
    const content = ["PTT", "name\tEnglish\tSET", "PTT", "name\tEnglish\tSET"].join("\n");
    const tickers = parseTickerLines(content);
    assert.deepEqual(tickers, ["PTT.BK"]);
  });

  it("returns empty array for empty content", () => {
    assert.deepEqual(parseTickerLines(""), []);
  });

  it("ignores English company name lines that happen to be short", () => {
    const content = ["PTT", "Very Long English Company Name That Is Not A Ticker\tSET"].join("\n");
    const tickers = parseTickerLines(content);
    assert.deepEqual(tickers, ["PTT.BK"]);
  });
});
