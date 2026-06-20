import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { WatchListManager } from "../src/watchList.js";

const tempDirs: string[] = [];

function createTempWatchlistPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "claw-watchlist-"));
  tempDirs.push(dir);
  return join(dir, "watchlist.json");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("WatchListManager", () => {
  it("adds, updates, and removes stocks", () => {
    const manager = new WatchListManager(createTempWatchlistPath());

    assert.equal(manager.add("AAPL", "us", "Core", -80, 6), true);
    assert.equal(manager.add("AAPL", "us"), false);
    assert.equal(manager.count(), 1);

    assert.equal(manager.update("AAPL", "us", { notes: "Updated", minBuffettScore: 7 }), true);

    const stock = manager.getAll()[0];
    assert.equal(stock.notes, "Updated");
    assert.equal(stock.minBuffettScore, 7);

    assert.equal(manager.remove("AAPL", "us"), true);
    assert.equal(manager.count(), 0);
  });

  it("supports bulk add with deduplication", () => {
    const manager = new WatchListManager(createTempWatchlistPath());
    manager.add("AAPL", "us");

    const result = manager.addMany(["AAPL", "MSFT", "PTT.BK"]);
    assert.deepEqual(result.added, ["MSFT", "PTT.BK"]);
    assert.deepEqual(result.skipped, ["AAPL"]);
    assert.equal(manager.count(), 3);
    assert.equal(manager.getByMarket("th").length, 1);
  });

  it("assigns and filters by group", () => {
    const manager = new WatchListManager(createTempWatchlistPath());

    manager.add("AAPL", "us", undefined, undefined, undefined, "Tech");
    manager.add("MSFT", "us", undefined, undefined, undefined, "Tech");
    manager.add("XOM", "us", undefined, undefined, undefined, "Energy");

    assert.equal(manager.count(), 3);
    assert.equal(manager.getByGroup("Tech").length, 2);
    assert.equal(manager.getByGroup("Energy").length, 1);
    assert.equal(manager.getByGroup("Nonexistent").length, 0);
  });

  it("lists all groups", () => {
    const manager = new WatchListManager(createTempWatchlistPath());

    manager.add("AAPL", "us", undefined, undefined, undefined, "Tech");
    manager.add("XOM", "us", undefined, undefined, undefined, "Energy");
    manager.add("NVDA", "us", undefined, undefined, undefined, "Tech");
    manager.add("PTT.BK", "th", undefined, undefined, undefined, "Energy");

    assert.deepEqual(manager.listGroups(), ["Energy", "Tech"]);
  });

  it("returns empty groups list when none have groups", () => {
    const manager = new WatchListManager(createTempWatchlistPath());
    manager.add("AAPL", "us");
    assert.deepEqual(manager.listGroups(), []);
  });

  it("updates group via update()", () => {
    const manager = new WatchListManager(createTempWatchlistPath());
    manager.add("AAPL", "us");

    assert.equal(manager.update("AAPL", "us", { group: "Tech" }), true);
    assert.equal(manager.getAll()[0].group, "Tech");

    assert.equal(manager.update("AAPL", "us", { group: undefined }), true);
    assert.equal(manager.getAll()[0].group, undefined);
  });

  it("addMany assigns group to all added stocks", () => {
    const manager = new WatchListManager(createTempWatchlistPath());
    manager.addMany(["AAPL", "MSFT", "NVDA"], undefined, undefined, undefined, undefined, "Tech");

    const tech = manager.getByGroup("Tech");
    assert.equal(tech.length, 3);
    assert.ok(tech.every((s) => s.group === "Tech"));
  });

  it("stocks without group are excluded from group filters", () => {
    const manager = new WatchListManager(createTempWatchlistPath());
    manager.add("AAPL", "us", undefined, undefined, undefined, "Tech");
    manager.add("MSFT", "us");

    assert.equal(manager.getByGroup("Tech").length, 1);
    assert.equal(manager.getByGroup("Tech")[0].ticker, "AAPL");
  });
});
