/**
 * dashboardQuery.test.ts — pure-logic checks for the Phase 8 dashboard date
 * range and count-map helpers.
 *
 * Run: npx tsx src/tests/dashboardQuery.test.ts
 */
import assert from "node:assert/strict";
import { getThisWeekRangeUTC, getTodayRangeUTC, toCountMap } from "../services/dashboardQuery";

async function main() {
  // 2026-06-21 is a Sunday.
  const sunday = new Date("2026-06-21T15:30:00.000Z");

  const today = getTodayRangeUTC(sunday);
  assert.equal(today.start.toISOString(), "2026-06-21T00:00:00.000Z");
  assert.equal(today.end.toISOString(), "2026-06-22T00:00:00.000Z");

  const week = getThisWeekRangeUTC(sunday);
  assert.equal(week.start.toISOString(), "2026-06-15T00:00:00.000Z", "week must start on Monday");
  assert.equal(week.end.toISOString(), "2026-06-22T00:00:00.000Z", "week must end at the start of tomorrow");

  // Wednesday should also resolve back to the same Monday.
  const wednesday = new Date("2026-06-17T08:00:00.000Z");
  const weekFromWednesday = getThisWeekRangeUTC(wednesday);
  assert.equal(weekFromWednesday.start.toISOString(), "2026-06-15T00:00:00.000Z");

  const counts = toCountMap(
    [
      { status: "new", _count: { _all: 3 } },
      { status: "confirmed", _count: { _all: 5 } },
    ],
    "status"
  );
  assert.deepEqual(counts, { new: 3, confirmed: 5 });
  assert.equal(toCountMap([], "status").confirmed, undefined, "missing keys must be absent, not zero-filled");

  console.log("dashboardQuery.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("dashboardQuery.test.ts failed:", err);
  process.exitCode = 1;
});
