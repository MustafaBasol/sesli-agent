/**
 * availabilitySlotHelpers.test.ts — pure-function checks for the Phase 25
 * availability slot calculation helpers. No DB, no network.
 *
 * Run: npx tsx src/tests/availabilitySlotHelpers.test.ts
 */
import assert from "node:assert/strict";
import {
  addMinutesToTime,
  generateTimeSlotsForDay,
  getNowPartsInTimezone,
  getWeekdayFromLocalDate,
  isValidOpeningHoursJson,
  localDateTimeToComparableMinutes,
  localDateToDayIndex,
  parseLocalDate,
  parseLocalTime,
  reservationBlocksSlot,
  tableCanFitParty,
  timeRangesOverlap,
  timeToMinutes,
} from "../services/availabilitySlotHelpers";

function main() {
  // parseLocalDate / parseLocalTime
  assert.deepEqual(parseLocalDate("2026-07-01"), { year: 2026, month: 7, day: 1 });
  assert.equal(parseLocalDate("2026-13-01"), null, "month 13 is invalid");
  assert.equal(parseLocalDate("01-07-2026"), null, "wrong format rejected");
  assert.deepEqual(parseLocalTime("18:30"), { hours: 18, minutes: 30 });
  assert.equal(parseLocalTime("24:00"), null, "hour 24 is invalid HH:mm");

  // time arithmetic
  assert.equal(timeToMinutes("01:30"), 90);
  assert.equal(addMinutesToTime("23:30", 90), "01:00", "wraps past midnight");
  assert.throws(() => timeToMinutes("bad"), "invalid time throws");

  // overlap
  assert.ok(timeRangesOverlap(60, 120, 90, 150), "overlapping ranges");
  assert.ok(!timeRangesOverlap(60, 120, 120, 180), "adjacent ranges do not overlap");

  // weekday + day index
  assert.equal(getWeekdayFromLocalDate("2026-06-22"), "monday");
  assert.equal(getWeekdayFromLocalDate("not-a-date"), null);
  assert.equal(localDateToDayIndex("2026-06-23")! - localDateToDayIndex("2026-06-22")!, 1, "consecutive days differ by 1");

  // comparable minutes across a day boundary
  const startOfDay1 = localDateTimeToComparableMinutes("2026-06-22", "23:30");
  const startOfDay2 = localDateTimeToComparableMinutes("2026-06-23", "00:30");
  assert.equal(startOfDay2 - startOfDay1, 60, "23:30 -> 00:30 next day is 60 minutes apart");

  // opening hours validation
  assert.ok(isValidOpeningHoursJson({ monday: [{ start: "12:00", end: "14:00" }], sunday: [] }));
  assert.ok(!isValidOpeningHoursJson(null));
  assert.ok(!isValidOpeningHoursJson({ notaday: [] }));
  assert.ok(!isValidOpeningHoursJson({ monday: [{ start: "14:00", end: "12:00" }] }), "end before start is invalid");
  assert.ok(!isValidOpeningHoursJson("nope"));

  // slot generation
  const slots = generateTimeSlotsForDay([{ start: "12:00", end: "14:00" }], 30, 90);
  assert.deepEqual(slots, ["12:00", "12:30"], "90-min slots cannot start after 12:30 to fit before 14:00");

  const slotsNoFit = generateTimeSlotsForDay([{ start: "12:00", end: "12:30" }], 30, 90);
  assert.deepEqual(slotsNoFit, [], "no slot fits when window is shorter than duration");

  // reservation blocking
  const confirmedReservation = { reservationTime: "12:30", partySize: 2, status: "confirmed", assignedTableId: "t1" };
  assert.ok(reservationBlocksSlot(confirmedReservation, timeToMinutes("12:00"), timeToMinutes("13:30"), 90));
  assert.ok(!reservationBlocksSlot(confirmedReservation, timeToMinutes("14:30"), timeToMinutes("16:00"), 90), "non-overlapping slot");
  const cancelledReservation = { ...confirmedReservation, status: "cancelled" };
  assert.ok(!reservationBlocksSlot(cancelledReservation, timeToMinutes("12:00"), timeToMinutes("13:30"), 90), "cancelled does not block");

  // table capacity
  assert.ok(tableCanFitParty({ id: "t1", capacity: 4, isActive: true }, 4));
  assert.ok(!tableCanFitParty({ id: "t1", capacity: 4, isActive: true }, 5), "party too large");
  assert.ok(!tableCanFitParty({ id: "t1", capacity: 4, isActive: false }, 2), "inactive table never fits");

  // timezone-aware "now" parts (deterministic given a fixed instant)
  const fixedInstant = new Date("2026-06-22T23:30:00.000Z");
  const parisParts = getNowPartsInTimezone(fixedInstant, "Europe/Paris");
  assert.equal(parisParts.localDate, "2026-06-23", "Paris is UTC+2 in June, so 23:30 UTC rolls to the next local day");
  assert.equal(parisParts.localTime, "01:30");

  console.log("availabilitySlotHelpers.test.ts: all checks passed");
}

main();
