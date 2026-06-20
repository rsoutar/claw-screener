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

    assert.equal(
      manager.update("AAPL", "us", { notes: "Updated", minBuffettScore: 7 }),
      true
    );

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
});