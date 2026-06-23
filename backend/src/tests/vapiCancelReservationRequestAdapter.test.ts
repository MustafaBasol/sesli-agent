/**
 * vapiCancelReservationRequestAdapter.test.ts — pure-logic checks for the
 * Phase 34 Vapi cancel-reservation-request adapter (argument extraction,
 * missing-field computation, truncation, response-shape builders). No
 * Prisma/DB involved, so this is wired into `npm test`.
 *
 * Run: npx tsx src/tests/vapiCancelReservationRequestAdapter.test.ts
 */
import assert from "node:assert/strict";
import {
  buildCancelMissingFieldsResponse,
  buildPendingCancelledResponse,
  buildReviewRequiredResponse,
  buildSafeCancelReservationRequestPayload,
  computeCancelReservationRequestMissingFields,
  extractCancelReservationRequestArgs,
  MAX_REASON_LENGTH,
  truncateText,
} from "../utils/vapi/cancelReservationRequestAdapter";

async function main() {
  const currentYear = new Date().getFullYear();

  // extractCancelReservationRequestArgs — flat snake_case.
  const flat = extractCancelReservationRequestArgs(
    [
      {
        reservation_request_id: "rr-1",
        call_id: "call-1",
        customer_name: "Jane Doe",
        phone: "+1 555 0100",
        email: "jane@example.com",
        date: "2026-08-20",
        time: "20:00",
        party_size: 4,
        reason: "Plans changed.",
        language: "en",
      },
    ],
    {},
    currentYear
  );
  assert.equal(flat.reservationRequestId, "rr-1");
  assert.equal(flat.callId, "call-1");
  assert.equal(flat.customerName, "Jane Doe");
  assert.equal(flat.phone, "+1 555 0100");
  assert.equal(flat.normalizedPhone, "15550100");
  assert.equal(flat.email, "jane@example.com");
  assert.equal(flat.date, "2026-08-20");
  assert.equal(flat.time, "20:00");
  assert.equal(flat.partySize, 4);
  assert.equal(flat.reason, "Plans changed.");
  assert.equal(flat.language, "en");

  // camelCase aliases.
  const camel = extractCancelReservationRequestArgs(
    [
      {
        reservationRequestId: "rr-2",
        callId: "call-2",
        customerName: "John Smith",
        callerNumber: "+1 555 0200",
        customerEmail: "john@example.com",
        reservationDate: "2026-09-01",
        reservationTime: "19:30",
        numberOfGuests: 2,
        cancellationReason: "No longer needed.",
        locale: "fr",
      },
    ],
    {},
    currentYear
  );
  assert.equal(camel.reservationRequestId, "rr-2");
  assert.equal(camel.callId, "call-2");
  assert.equal(camel.customerName, "John Smith");
  assert.equal(camel.phone, "+1 555 0200");
  assert.equal(camel.email, "john@example.com");
  assert.equal(camel.date, "2026-09-01");
  assert.equal(camel.time, "19:30");
  assert.equal(camel.partySize, 2);
  assert.equal(camel.reason, "No longer needed.");
  assert.equal(camel.language, "fr");

  // reservationId alias (confirmed Reservation reference).
  assert.equal(extractCancelReservationRequestArgs([{ reservation_id: "res-1" }], {}, currentYear).reservationId, "res-1");
  assert.equal(extractCancelReservationRequestArgs([{ reservationId: "res-2" }], {}, currentYear).reservationId, "res-2");

  // callId conversationId/vapiCallId aliases.
  assert.equal(extractCancelReservationRequestArgs([{ conversationId: "conv-1" }], {}, currentYear).callId, "conv-1");
  assert.equal(extractCancelReservationRequestArgs([{ vapiCallId: "vc-1" }], {}, currentYear).callId, "vc-1");

  // message.call.id fallback when no alias matches.
  const envelopeFallback = extractCancelReservationRequestArgs([{}], { message: { call: { id: "call-envelope" } } }, currentYear);
  assert.equal(envelopeFallback.callId, "call-envelope");

  // Nested Vapi tool-call envelope with JSON-string arguments + call id passthrough.
  const nestedArgs = { call_id: "call-nested", reservation_request_id: "rr-nested" };
  const nestedRawBody = {
    message: { toolCalls: [{ id: "tc-1", function: { arguments: JSON.stringify(nestedArgs) } }] },
  };
  const nestedExtracted = extractCancelReservationRequestArgs([nestedArgs, nestedRawBody], nestedRawBody, currentYear);
  assert.equal(nestedExtracted.callId, "call-nested");
  assert.equal(nestedExtracted.reservationRequestId, "rr-nested");
  assert.equal(nestedExtracted.toolCallId, "tc-1");

  // Phone extraction via envelope fallback.
  const phoneEnvelope = extractCancelReservationRequestArgs([{ call_id: "x" }], { customer: { number: "+1 555 0300" } }, currentYear);
  assert.equal(phoneEnvelope.phone, "+1 555 0300");

  // Invalid date/time formats normalize to null, never throw.
  const invalidDateTime = extractCancelReservationRequestArgs(
    [{ date: "not-a-date", time: "not-a-time", call_id: "x" }],
    {},
    currentYear
  );
  assert.equal(invalidDateTime.date, null);
  assert.equal(invalidDateTime.time, null);

  // Empty payload -> all null.
  const empty = extractCancelReservationRequestArgs([{}], {}, currentYear);
  assert.equal(empty.reservationRequestId, null);
  assert.equal(empty.reservationId, null);
  assert.equal(empty.callId, null);
  assert.equal(empty.phone, null);
  assert.equal(empty.date, null);

  // computeCancelReservationRequestMissingFields — at least one signal field required.
  assert.deepEqual(
    computeCancelReservationRequestMissingFields({
      reservationRequestId: null,
      reservationId: null,
      callId: null,
      customerName: null,
      phone: null,
      normalizedPhone: null,
      email: null,
      date: null,
      time: null,
      partySize: null,
      reason: null,
      language: null,
      toolCallId: null,
    }),
    ["reservationRequestId_or_reservationId_or_phone_or_customerName_or_date_or_time_or_callId_or_reason"],
    "missing every signal field"
  );
  assert.deepEqual(
    computeCancelReservationRequestMissingFields({
      reservationRequestId: null,
      reservationId: null,
      callId: "call-1",
      customerName: null,
      phone: null,
      normalizedPhone: null,
      email: null,
      date: null,
      time: null,
      partySize: null,
      reason: null,
      language: null,
      toolCallId: null,
    }),
    [],
    "callId alone satisfies the requirement"
  );
  assert.deepEqual(
    computeCancelReservationRequestMissingFields({
      reservationRequestId: null,
      reservationId: null,
      callId: null,
      customerName: null,
      phone: null,
      normalizedPhone: null,
      email: null,
      date: null,
      time: null,
      partySize: null,
      reason: "No longer needed.",
      language: null,
      toolCallId: null,
    }),
    [],
    "reason alone satisfies the requirement"
  );

  // truncateText — bounding policy.
  const longReason = "a".repeat(MAX_REASON_LENGTH + 500);
  assert.equal(truncateText(longReason, MAX_REASON_LENGTH).length, MAX_REASON_LENGTH);
  const shortText = "short text";
  assert.equal(truncateText(shortText, MAX_REASON_LENGTH), shortText);

  // buildCancelMissingFieldsResponse shape.
  const missingResponse = buildCancelMissingFieldsResponse(
    ["reservationRequestId_or_reservationId_or_phone_or_customerName_or_date_or_time_or_callId_or_reason"],
    "en"
  );
  assert.equal(missingResponse.success, false);
  assert.deepEqual(missingResponse.missing_fields, [
    "reservationRequestId_or_reservationId_or_phone_or_customerName_or_date_or_time_or_callId_or_reason",
  ]);

  // buildPendingCancelledResponse shape — must claim the pending request was cancelled.
  const pendingResponse = buildPendingCancelledResponse("en", "rr-1");
  assert.equal(pendingResponse.success, true);
  assert.equal(pendingResponse.reservation_request_cancelled, true);
  assert.equal(pendingResponse.match_status, "exact");
  assert.equal(pendingResponse.reservation_request_id, "rr-1");
  assert.ok(/cancelled/i.test(pendingResponse.message));

  // buildReviewRequiredResponse shape — must never claim a reservation was cancelled.
  const reviewResponse = buildReviewRequiredResponse("en", "event-1", "confirmed_reservation_review_required");
  assert.equal(reviewResponse.success, true);
  assert.equal(reviewResponse.cancellation_logged, true);
  assert.equal(reviewResponse.requires_review, true);
  assert.equal(reviewResponse.event_id, "event-1");
  assert.equal(reviewResponse.match_status, "confirmed_reservation_review_required");
  assert.ok(!/cancelled/i.test(reviewResponse.message), "must not claim a confirmed reservation was cancelled");

  // Language fallback to English for unsupported language codes.
  const unsupportedLangResponse = buildPendingCancelledResponse("de", "rr-2");
  assert.equal(unsupportedLangResponse.message, buildPendingCancelledResponse("en", "rr-2").message);

  // buildSafeCancelReservationRequestPayload — only bounded/safe fields, no raw payload.
  const fixedNow = new Date("2026-01-01T00:00:00.000Z");
  const safePayload = buildSafeCancelReservationRequestPayload(
    {
      reservationRequestId: "rr-1",
      reservationId: null,
      callId: "call-1",
      customerName: "Jane Doe",
      phone: "+1 555 0100",
      normalizedPhone: "15550100",
      email: "jane@example.com",
      date: "2026-08-20",
      time: "20:00",
      partySize: 4,
      reason: longReason,
      language: "en",
      toolCallId: "tc-1",
    },
    "exact",
    "pending_request_cancelled",
    fixedNow
  );
  assert.equal(safePayload.callId, "call-1");
  assert.equal(safePayload.reservationRequestId, "rr-1");
  assert.equal(safePayload.customerName, "Jane Doe");
  assert.equal(safePayload.phone, "+1 555 0100");
  assert.equal(safePayload.email, "jane@example.com");
  assert.equal(safePayload.date, "2026-08-20");
  assert.equal(safePayload.time, "20:00");
  assert.equal(safePayload.partySize, 4);
  assert.equal(safePayload.reason!.length, MAX_REASON_LENGTH);
  assert.equal(safePayload.language, "en");
  assert.equal(safePayload.matchStatus, "exact");
  assert.equal(safePayload.actionTaken, "pending_request_cancelled");
  assert.equal(safePayload.source, "vapi");
  assert.equal(safePayload.requestedAt, fixedNow.toISOString());

  const minimalSafePayload = buildSafeCancelReservationRequestPayload(
    {
      reservationRequestId: null,
      reservationId: null,
      callId: "call-2",
      customerName: null,
      phone: null,
      normalizedPhone: null,
      email: null,
      date: null,
      time: null,
      partySize: null,
      reason: null,
      language: null,
      toolCallId: null,
    },
    "unmatched",
    "intent_logged",
    fixedNow
  );
  assert.deepEqual(minimalSafePayload, {
    callId: "call-2",
    matchStatus: "unmatched",
    actionTaken: "intent_logged",
    requestedAt: fixedNow.toISOString(),
    source: "vapi",
  });

  console.log("vapiCancelReservationRequestAdapter.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("vapiCancelReservationRequestAdapter.test.ts failed:", err);
  process.exitCode = 1;
});
