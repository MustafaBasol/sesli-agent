/**
 * vapiDateOpeningHoursAdapter.test.ts — pure-logic checks for the Phase 30
 * Vapi get-current-date / get-opening-hours adapters (argument extraction,
 * date validation, response-shape builders). No Prisma/DB involved, so this
 * is wired into `npm test`.
 *
 * Run: npx tsx src/tests/vapiDateOpeningHoursAdapter.test.ts
 */
import assert from "node:assert/strict";
import {
  buildClosedReasonResponse,
  buildCurrentDateResponse,
  buildInvalidDateResponse,
  buildNotConfiguredResponse,
  buildOpeningHoursResponse,
  buildWeeklyHours,
  extractGetCurrentDateArgs,
  extractGetOpeningHoursArgs,
  hasAnyConfiguredWindows,
  resolveLanguage,
  resolveRestaurantTimezone,
  validateRequestedDate,
} from "../utils/vapi/dateOpeningHoursAdapter";
import type { OpeningHoursJson } from "../services/availabilitySlotTypes";

async function main() {
  // resolveRestaurantTimezone — falls back only when blank/missing.
  assert.equal(resolveRestaurantTimezone("America/New_York"), "America/New_York");
  assert.equal(resolveRestaurantTimezone(null), "Europe/Paris");
  assert.equal(resolveRestaurantTimezone(""), "Europe/Paris");
  assert.equal(resolveRestaurantTimezone("   "), "Europe/Paris");

  // resolveLanguage — requested wins, then restaurant default, then English.
  assert.equal(resolveLanguage("tr", "fr"), "tr");
  assert.equal(resolveLanguage(null, "fr"), "fr");
  assert.equal(resolveLanguage(null, null), "en");
  assert.equal(resolveLanguage("de", "fr"), "fr", "unsupported requested language falls back to restaurant default");
  assert.equal(resolveLanguage("DE", "XX"), "en", "unsupported requested + unsupported default falls back to English");
  assert.equal(resolveLanguage("TR", null), "tr", "language matching is case-insensitive");

  // extractGetCurrentDateArgs — flat + alias + tool-call id fallback.
  assert.deepEqual(
    extractGetCurrentDateArgs([{ language: "tr" }], {}),
    { language: "tr", callId: null },
    "flat language"
  );
  assert.deepEqual(
    extractGetCurrentDateArgs([{ lang: "fr", call_id: "call-1" }], {}),
    { language: "fr", callId: "call-1" },
    "lang alias + call_id"
  );
  assert.deepEqual(
    extractGetCurrentDateArgs([{}], { toolCallId: "tc-9" }),
    { language: null, callId: "tc-9" },
    "falls back to Vapi tool-call id when no call id alias present"
  );

  // extractGetOpeningHoursArgs — date aliases (camelCase/snake_case).
  assert.deepEqual(
    extractGetOpeningHoursArgs([{ date: "2026-07-04", locale: "tr" }], {}),
    { rawDate: "2026-07-04", language: "tr", callId: null },
    "date + locale alias"
  );
  assert.deepEqual(
    extractGetOpeningHoursArgs([{ requestedDate: "2026-07-05" }], {}),
    { rawDate: "2026-07-05", language: null, callId: null },
    "requestedDate camelCase alias"
  );
  assert.deepEqual(
    extractGetOpeningHoursArgs([{ local_date: "2026-07-06" }], {}),
    { rawDate: "2026-07-06", language: null, callId: null },
    "local_date snake_case alias"
  );
  assert.deepEqual(
    extractGetOpeningHoursArgs([{}], {}),
    { rawDate: null, language: null, callId: null },
    "empty payload -> all null"
  );

  // validateRequestedDate — valid/invalid formats.
  assert.equal(validateRequestedDate("2026-07-04", 2026), "2026-07-04");
  assert.equal(validateRequestedDate(null, 2026), null);
  assert.equal(validateRequestedDate("not-a-date", 2026), null, "unparseable date is rejected");
  assert.equal(validateRequestedDate("2026-13-40", 2026), null, "out-of-range month/day is rejected");
  assert.equal(validateRequestedDate("04/07/2026", 2026), "2026-07-04", "DD/MM/YYYY is normalized to ISO");

  // hasAnyConfiguredWindows — empty vs configured.
  assert.equal(hasAnyConfiguredWindows({} as OpeningHoursJson), false, "no weekday keys at all");
  assert.equal(
    hasAnyConfiguredWindows({ monday: [] } as OpeningHoursJson),
    false,
    "a weekday key with an empty window list is still unconfigured"
  );
  assert.equal(
    hasAnyConfiguredWindows({ monday: [{ start: "10:00", end: "22:00" }] } as OpeningHoursJson),
    true,
    "at least one non-empty window list counts as configured"
  );

  // buildCurrentDateResponse — shape + per-language message.
  const now = new Date("2026-07-04T18:30:00.000Z");
  const currentDateResponse = buildCurrentDateResponse({
    timezone: "Europe/Paris",
    localDate: "2026-07-04",
    localTime: "20:30",
    weekday: "saturday",
    language: "en",
    now,
  });
  assert.equal(currentDateResponse.success, true);
  assert.equal(currentDateResponse.current_date, "2026-07-04");
  assert.equal(currentDateResponse.current_time, "20:30");
  assert.equal(currentDateResponse.day_of_week, "Saturday");
  assert.equal(currentDateResponse.timezone, "Europe/Paris");
  assert.equal(currentDateResponse.iso_datetime, now.toISOString());
  assert.ok(currentDateResponse.message.includes("Saturday"));

  const currentDateResponseTr = buildCurrentDateResponse({
    timezone: "Europe/Paris",
    localDate: "2026-07-04",
    localTime: "20:30",
    weekday: "saturday",
    language: "tr",
    now,
  });
  assert.equal(currentDateResponseTr.day_of_week, "Cumartesi");

  // buildInvalidDateResponse / buildNotConfiguredResponse / buildClosedReasonResponse.
  const invalid = buildInvalidDateResponse();
  assert.equal(invalid.success, false);

  const notConfigured = buildNotConfiguredResponse("Europe/Paris");
  assert.equal(notConfigured.success, true);
  assert.equal(notConfigured.configured, false);
  assert.equal(notConfigured.timezone, "Europe/Paris");

  const inactive = buildClosedReasonResponse("restaurant_inactive", "Europe/Paris");
  assert.equal(inactive.success, true);
  assert.equal(inactive.is_open, false);
  assert.equal(inactive.closed_reason, "restaurant_inactive");

  // buildWeeklyHours — every weekday present, mapped to opens/closes.
  const openingHoursJson: OpeningHoursJson = {
    monday: [{ start: "10:00", end: "14:00" }, { start: "18:00", end: "22:00" }],
    saturday: [{ start: "10:00", end: "23:00" }],
  };
  const weekly = buildWeeklyHours(openingHoursJson);
  assert.deepEqual(weekly.monday, [
    { opens: "10:00", closes: "14:00" },
    { opens: "18:00", closes: "22:00" },
  ]);
  assert.deepEqual(weekly.tuesday, [], "a weekday with no configured windows maps to an empty array");
  assert.equal(Object.keys(weekly).length, 7, "all seven weekdays are always present");

  // buildOpeningHoursResponse — open day, no blackout.
  const openDay = buildOpeningHoursResponse({
    localDate: "2026-07-04",
    weekday: "saturday",
    language: "en",
    timezone: "Europe/Paris",
    windows: [{ start: "10:00", end: "23:00" }],
    includeWeeklyHours: false,
    openingHoursJson,
    isFullDayBlackout: false,
    blackoutReason: null,
    partialBlackout: null,
  });
  assert.equal(openDay.success, true);
  assert.equal(openDay.is_open, true);
  assert.deepEqual(openDay.opening_periods, [{ opens: "10:00", closes: "23:00" }]);
  assert.equal(openDay.weekly_hours, undefined, "weekly_hours omitted when includeWeeklyHours is false");
  assert.equal(openDay.closed_reason, undefined);

  // buildOpeningHoursResponse — closed day (no windows for that weekday).
  const closedDay = buildOpeningHoursResponse({
    localDate: "2026-07-07",
    weekday: "tuesday",
    language: "en",
    timezone: "Europe/Paris",
    windows: [],
    includeWeeklyHours: true,
    openingHoursJson,
    isFullDayBlackout: false,
    blackoutReason: null,
    partialBlackout: null,
  });
  assert.equal(closedDay.is_open, false);
  assert.deepEqual(closedDay.opening_periods, []);
  assert.ok(closedDay.weekly_hours, "weekly_hours included when includeWeeklyHours is true");

  // buildOpeningHoursResponse — full-day blackout overrides normal windows.
  const blackoutDay = buildOpeningHoursResponse({
    localDate: "2026-07-04",
    weekday: "saturday",
    language: "en",
    timezone: "Europe/Paris",
    windows: [{ start: "10:00", end: "23:00" }],
    includeWeeklyHours: false,
    openingHoursJson,
    isFullDayBlackout: true,
    blackoutReason: "Private event",
    partialBlackout: null,
  });
  assert.equal(blackoutDay.is_open, false);
  assert.equal(blackoutDay.closed_reason, "blackout_full_day");
  assert.equal(blackoutDay.opening_periods, undefined, "opening_periods is omitted on a full-day blackout");
  assert.ok(blackoutDay.message.includes("Private event"));

  // buildOpeningHoursResponse — partial blackout is a note, not a closure.
  const partialBlackoutDay = buildOpeningHoursResponse({
    localDate: "2026-07-04",
    weekday: "saturday",
    language: "en",
    timezone: "Europe/Paris",
    windows: [{ start: "10:00", end: "23:00" }],
    includeWeeklyHours: false,
    openingHoursJson,
    isFullDayBlackout: false,
    blackoutReason: null,
    partialBlackout: { starts: "14:00", ends: "16:00", reason: "Maintenance" },
  });
  assert.equal(partialBlackoutDay.is_open, true, "a partial blackout does not flip is_open to false");
  assert.ok(partialBlackoutDay.partial_blackout_note?.includes("14:00"));
  assert.ok(partialBlackoutDay.message.includes("Maintenance"));

  console.log("vapiDateOpeningHoursAdapter.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("vapiDateOpeningHoursAdapter.test.ts failed:", err);
  process.exitCode = 1;
});
