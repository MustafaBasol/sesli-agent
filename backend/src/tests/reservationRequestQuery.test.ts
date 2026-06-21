/**
 * reservationRequestQuery.test.ts — pure-logic checks for the Phase 5
 * reservation-request list filtering and status transition rules.
 *
 * Run: npx tsx src/tests/reservationRequestQuery.test.ts
 */
import assert from "node:assert/strict";
import { buildReservationRequestListWhere, isValidStatusTransition } from "../services/reservationRequestQuery";

async function main() {
  // buildReservationRequestListWhere always pins restaurantId, regardless of filters.
  const baseWhere = buildReservationRequestListWhere("rest-1", {});
  assert.deepEqual(baseWhere, { restaurantId: "rest-1" });

  const statusWhere = buildReservationRequestListWhere("rest-1", { status: "confirmed" });
  assert.equal(statusWhere.status, "confirmed");
  assert.equal(statusWhere.restaurantId, "rest-1");

  const channelProviderWhere = buildReservationRequestListWhere("rest-1", { channel: "voice", provider: "vapi" });
  assert.equal(channelProviderWhere.channel, "voice");
  assert.equal(channelProviderWhere.provider, "vapi");

  const dateRangeWhere = buildReservationRequestListWhere("rest-1", { dateFrom: "2027-01-01", dateTo: "2027-01-31" });
  const reservationDateFilter = dateRangeWhere.reservationDate as { gte: Date; lte: Date };
  assert.equal(reservationDateFilter.gte.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(reservationDateFilter.lte.toISOString(), "2027-01-31T23:59:59.999Z");

  const searchWhere = buildReservationRequestListWhere("rest-1", { search: "Ada" });
  assert.ok(Array.isArray(searchWhere.OR) && searchWhere.OR.length === 3, "search must OR across name/phone fields");

  // Status transitions: same-status is always a no-op allow.
  assert.equal(isValidStatusTransition("new", "new"), true);

  // Forward transitions defined in the map are allowed.
  assert.equal(isValidStatusTransition("new", "confirmed"), true);
  assert.equal(isValidStatusTransition("pending_info", "confirmed"), true);
  assert.equal(isValidStatusTransition("confirmed", "done"), true);
  assert.equal(isValidStatusTransition("confirmed", "cancelled"), true);

  // Terminal states have no outgoing transitions.
  assert.equal(isValidStatusTransition("rejected", "new"), false);
  assert.equal(isValidStatusTransition("cancelled", "confirmed"), false);
  assert.equal(isValidStatusTransition("done", "new"), false);

  // A confirmed request cannot be silently pushed back to "new"/"pending_info".
  assert.equal(isValidStatusTransition("confirmed", "new"), false);
  assert.equal(isValidStatusTransition("confirmed", "pending_info"), false);

  console.log("reservationRequestQuery.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("reservationRequestQuery.test.ts failed:", err);
  process.exitCode = 1;
});
