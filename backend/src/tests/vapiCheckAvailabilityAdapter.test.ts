/**
 * vapiCheckAvailabilityAdapter.test.ts — pure-logic checks for the Phase 27
 * Vapi check-availability adapter (argument extraction + service-result
 * mapping). No Prisma/DB involved, so this is wired into `npm test`.
 *
 * Run: npx tsx src/tests/vapiCheckAvailabilityAdapter.test.ts
 */
import assert from "node:assert/strict";
import {
  buildMissingArgsResponse,
  extractCheckAvailabilityArgs,
  mapAvailabilityResultToVapiResponse,
} from "../utils/vapi/checkAvailabilityAdapter";
import type { AvailabilitySlotResult } from "../services/availabilitySlotTypes";

function baseResult(overrides: Partial<AvailabilitySlotResult> = {}): AvailabilitySlotResult {
  return {
    restaurantId: "rest-1",
    localDate: "2027-05-20",
    partySize: 2,
    timezone: "UTC",
    durationMinutes: 60,
    slotIntervalMinutes: 60,
    availableSlots: [],
    warnings: [],
    ...overrides,
  };
}

async function main() {
  // extractCheckAvailabilityArgs — main payload shapes.
  assert.deepEqual(
    extractCheckAvailabilityArgs([{ date: "2026-06-29", time: "19:00", partySize: 2 }], 2026),
    { localDate: "2026-06-29", partySize: 2, preferredTime: "19:00" },
    "date/time/partySize shape"
  );
  assert.deepEqual(
    extractCheckAvailabilityArgs(
      [{ localDate: "2026-06-29", preferredTime: "19:00", numberOfGuests: 2 }],
      2026
    ),
    { localDate: "2026-06-29", partySize: 2, preferredTime: "19:00" },
    "localDate/preferredTime/numberOfGuests shape"
  );
  assert.deepEqual(
    extractCheckAvailabilityArgs([{ reservation_date: "2026-06-29", guests: 4 }], 2026),
    { localDate: "2026-06-29", partySize: 4, preferredTime: null },
    "no preferredTime supplied -> null, not missing"
  );
  assert.deepEqual(
    extractCheckAvailabilityArgs([{}], 2026),
    { localDate: null, partySize: null, preferredTime: null },
    "empty payload -> all null"
  );

  // buildMissingArgsResponse
  const missing = buildMissingArgsResponse(["date", "party_size"]);
  assert.equal(missing.success, false);
  assert.equal(missing.available, false);
  assert.deepEqual(missing.missing_fields, ["date", "party_size"]);

  // mapAvailabilityResultToVapiResponse — blockedReason short-circuits.
  const blocked = mapAvailabilityResultToVapiResponse(baseResult({ blockedReason: "blackout_full_day" }), null);
  assert.equal(blocked.success, true);
  assert.equal(blocked.available, false);
  assert.equal(blocked.blocked_reason, "blackout_full_day");
  assert.ok(blocked.message.length > 0);

  // No preferredTime, slots available -> available:true with suggestions.
  const noPreferred = mapAvailabilityResultToVapiResponse(
    baseResult({
      availableSlots: [
        { time: "19:00", available: true, availableTableIds: ["t1"], capacity: 4 },
        { time: "19:30", available: false, availableTableIds: [], capacity: 0, reason: "no_capacity" },
        { time: "20:00", available: true, availableTableIds: ["t2"], capacity: 2 },
      ],
    }),
    null
  );
  assert.equal(noPreferred.available, true);
  assert.deepEqual(noPreferred.available_slots, ["19:00", "20:00"]);
  assert.deepEqual(noPreferred.suggested_times, ["19:00", "20:00"]);

  // No preferredTime, no slots -> available:false, no suggested_times.
  const noPreferredEmpty = mapAvailabilityResultToVapiResponse(baseResult({ availableSlots: [] }), null);
  assert.equal(noPreferredEmpty.available, false);
  assert.equal(noPreferredEmpty.suggested_times, undefined);

  // preferredTime available -> available:true, no suggested_times needed.
  const preferredAvailable = mapAvailabilityResultToVapiResponse(
    baseResult({
      availableSlots: [{ time: "19:00", available: true, availableTableIds: ["t1"], capacity: 4 }],
      preferredTime: { time: "19:00", available: true },
    }),
    "19:00"
  );
  assert.equal(preferredAvailable.available, true);
  assert.equal(preferredAvailable.time, "19:00");
  assert.equal(preferredAvailable.suggested_times, undefined);

  // preferredTime unavailable but other slots exist -> available:false + suggestions.
  const preferredUnavailable = mapAvailabilityResultToVapiResponse(
    baseResult({
      availableSlots: [
        { time: "19:00", available: false, availableTableIds: [], capacity: 0, reason: "no_capacity" },
        { time: "20:00", available: true, availableTableIds: ["t2"], capacity: 2 },
      ],
      preferredTime: { time: "19:00", available: false },
    }),
    "19:00"
  );
  assert.equal(preferredUnavailable.available, false);
  assert.deepEqual(preferredUnavailable.suggested_times, ["20:00"]);

  // Response never leaks internal slot objects (table IDs).
  assert.ok(!JSON.stringify(noPreferred).includes("t1"), "available_slots must be plain time strings, not table IDs");

  console.log("vapiCheckAvailabilityAdapter.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("vapiCheckAvailabilityAdapter.test.ts failed:", err);
  process.exitCode = 1;
});
