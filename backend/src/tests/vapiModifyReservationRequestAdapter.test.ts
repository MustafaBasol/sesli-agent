/**
 * vapiModifyReservationRequestAdapter.test.ts — pure-logic checks for the
 * Phase 35 Vapi modify-reservation-request adapter (argument extraction,
 * missing-field computation, invalid-format detection, truncation, and
 * response-shape builders). No Prisma/DB involved, so this is wired into
 * `npm test`.
 *
 * Run: npx tsx src/tests/vapiModifyReservationRequestAdapter.test.ts
 */
import assert from "node:assert/strict";
import {
  buildInvalidDateTimeResponse,
  buildModificationRecordedResponse,
  buildModifyMissingFieldsResponse,
  buildSafeModifyReservationRequestPayload,
  computeModifyReservationRequestMissingFields,
  extractModifyReservationRequestArgs,
  hasInvalidDateTimeFormat,
  MAX_NEW_NOTES_LENGTH,
  MAX_REASON_LENGTH,
  truncateText,
} from "../utils/vapi/modifyReservationRequestAdapter";

async function main() {
  const currentYear = new Date().getFullYear();

  // extractModifyReservationRequestArgs — flat snake_case.
  const flat = extractModifyReservationRequestArgs(
    [
      {
        reservation_request_id: "rr-1",
        call_id: "call-1",
        customer_name: undefined,
        phone: "+1 555 0100",
        email: "jane@example.com",
        current_date: "2026-08-20",
        current_time: "20:00",
        new_date: "2026-08-21",
        new_time: "21:00",
        new_party_size: 4,
        new_notes: "Window seat please.",
        reason: "Plans changed.",
        language: "en",
      },
    ],
    {},
    currentYear
  );
  assert.equal(flat.reservationRequestId, "rr-1");
  assert.equal(flat.callId, "call-1");
  assert.equal(flat.phone, "+1 555 0100");
  assert.equal(flat.normalizedPhone, "15550100");
  assert.equal(flat.email, "jane@example.com");
  assert.equal(flat.currentDate, "2026-08-20");
  assert.equal(flat.currentTime, "20:00");
  assert.equal(flat.newDate, "2026-08-21");
  assert.equal(flat.newTime, "21:00");
  assert.equal(flat.newPartySize, 4);
  assert.equal(flat.newNotes, "Window seat please.");
  assert.equal(flat.reason, "Plans changed.");
  assert.equal(flat.language, "en");

  // camelCase aliases.
  const camel = extractModifyReservationRequestArgs(
    [
      {
        reservationId: "res-2",
        callId: "call-2",
        customerName: "John Smith",
        callerNumber: "+1 555 0200",
        customerEmail: "john@example.com",
        originalDate: "2026-09-01",
        originalTime: "19:30",
        requestedDate: "2026-09-05",
        requestedTime: "20:30",
        numberOfGuests: 2,
        specialRequests: "No nuts.",
        changeReason: "Bigger group now.",
        locale: "fr",
      },
    ],
    {},
    currentYear
  );
  assert.equal(camel.reservationId, "res-2");
  assert.equal(camel.callId, "call-2");
  assert.equal(camel.customerName, "John Smith");
  assert.equal(camel.phone, "+1 555 0200");
  assert.equal(camel.email, "john@example.com");
  assert.equal(camel.currentDate, "2026-09-01");
  assert.equal(camel.currentTime, "19:30");
  assert.equal(camel.newDate, "2026-09-05");
  assert.equal(camel.newTime, "20:30");
  assert.equal(camel.newPartySize, 2);
  assert.equal(camel.newNotes, "No nuts.");
  assert.equal(camel.reason, "Bigger group now.");
  assert.equal(camel.language, "fr");

  // Nested Vapi tool-call envelope with JSON-string arguments + call id passthrough.
  const nestedArgs = { call_id: "call-nested", reservation_request_id: "rr-nested", new_time: "18:00" };
  const nestedRawBody = {
    message: { toolCalls: [{ id: "tc-1", function: { arguments: JSON.stringify(nestedArgs) } }] },
  };
  const nestedExtracted = extractModifyReservationRequestArgs([nestedArgs, nestedRawBody], nestedRawBody, currentYear);
  assert.equal(nestedExtracted.callId, "call-nested");
  assert.equal(nestedExtracted.reservationRequestId, "rr-nested");
  assert.equal(nestedExtracted.newTime, "18:00");
  assert.equal(nestedExtracted.toolCallId, "tc-1");

  // JSON-string object arguments (already-parsed object form) work the same.
  const objectArgs = { call_id: "call-object", reservation_id: "res-object", new_party_size: 6 };
  const objectExtracted = extractModifyReservationRequestArgs([objectArgs], {}, currentYear);
  assert.equal(objectExtracted.reservationId, "res-object");
  assert.equal(objectExtracted.newPartySize, 6);

  // Invalid date/time formats normalize to null but are flagged as "provided".
  const invalidDateTime = extractModifyReservationRequestArgs(
    [{ current_date: "not-a-date", new_time: "not-a-time", call_id: "x" }],
    {},
    currentYear
  );
  assert.equal(invalidDateTime.currentDate, null);
  assert.equal(invalidDateTime.currentDateProvided, true);
  assert.equal(invalidDateTime.newTime, null);
  assert.equal(invalidDateTime.newTimeProvided, true);
  assert.equal(hasInvalidDateTimeFormat(invalidDateTime), true);

  // Valid date/time -> not flagged as invalid.
  const validDateTime = extractModifyReservationRequestArgs(
    [{ current_date: "2026-08-20", new_time: "18:00", call_id: "x" }],
    {},
    currentYear
  );
  assert.equal(hasInvalidDateTimeFormat(validDateTime), false);

  // Empty payload -> all null, nothing "provided".
  const empty = extractModifyReservationRequestArgs([{}], {}, currentYear);
  assert.equal(empty.reservationRequestId, null);
  assert.equal(empty.reservationId, null);
  assert.equal(empty.callId, null);
  assert.equal(empty.currentDateProvided, false);
  assert.equal(empty.newDateProvided, false);
  assert.equal(hasInvalidDateTimeFormat(empty), false);

  // computeModifyReservationRequestMissingFields — both identity and a requested change are required.
  assert.deepEqual(
    computeModifyReservationRequestMissingFields(empty),
    [
      "reservationRequestId_or_reservationId_or_phone_or_customerName_or_currentDate_or_currentTime_or_callId",
      "newDate_or_newTime_or_newPartySize_or_newNotes_or_reason",
    ],
    "missing both identity and requested change"
  );

  const identityOnly = extractModifyReservationRequestArgs([{ call_id: "call-1" }], {}, currentYear);
  assert.deepEqual(
    computeModifyReservationRequestMissingFields(identityOnly),
    ["newDate_or_newTime_or_newPartySize_or_newNotes_or_reason"],
    "identity present but no requested change"
  );

  const changeOnly = extractModifyReservationRequestArgs([{ reason: "Need to move it." }], {}, currentYear);
  assert.deepEqual(
    computeModifyReservationRequestMissingFields(changeOnly),
    ["reservationRequestId_or_reservationId_or_phone_or_customerName_or_currentDate_or_currentTime_or_callId"],
    "requested change present but no identity"
  );

  const complete = extractModifyReservationRequestArgs(
    [{ call_id: "call-1", new_time: "20:00" }],
    {},
    currentYear
  );
  assert.deepEqual(computeModifyReservationRequestMissingFields(complete), [], "both identity and change present");

  // truncateText — bounding policy.
  const longReason = "a".repeat(MAX_REASON_LENGTH + 500);
  assert.equal(truncateText(longReason, MAX_REASON_LENGTH).length, MAX_REASON_LENGTH);
  const shortText = "short text";
  assert.equal(truncateText(shortText, MAX_REASON_LENGTH), shortText);

  // buildModifyMissingFieldsResponse shape.
  const missingResponse = buildModifyMissingFieldsResponse(
    ["reservationRequestId_or_reservationId_or_phone_or_customerName_or_currentDate_or_currentTime_or_callId"],
    "en"
  );
  assert.equal(missingResponse.success, false);
  assert.ok(missingResponse.missing_fields?.length);

  // buildInvalidDateTimeResponse shape — safe success:false, never throws.
  const invalidResponse = buildInvalidDateTimeResponse("en");
  assert.equal(invalidResponse.success, false);
  assert.ok(invalidResponse.message.length > 0);

  // Language fallback to English for unsupported language codes.
  const unsupportedLangResponse = buildModifyMissingFieldsResponse(["x"], "de");
  assert.equal(unsupportedLangResponse.message, buildModifyMissingFieldsResponse(["x"], "en").message);

  // buildModificationRecordedResponse — change_request_created path.
  const changeCreatedResponse = buildModificationRecordedResponse("en", {
    eventId: "event-1",
    matchStatus: "exact",
    changeRequestId: "change-1",
    originalRequestId: "rr-1",
  });
  assert.equal(changeCreatedResponse.success, true);
  assert.equal(changeCreatedResponse.requires_review, true);
  assert.equal(changeCreatedResponse.change_request_created, true);
  assert.equal(changeCreatedResponse.change_request_id, "change-1");
  assert.equal(changeCreatedResponse.reservation_request_id, "rr-1");
  assert.equal(changeCreatedResponse.match_status, "exact");
  assert.ok(!/\bchanged\b/i.test(changeCreatedResponse.message), "must not claim the reservation was changed");

  // buildModificationRecordedResponse — intent-logged-only path (no change request created).
  const loggedOnlyResponse = buildModificationRecordedResponse("en", {
    eventId: "event-2",
    matchStatus: "unmatched",
  });
  assert.equal(loggedOnlyResponse.success, true);
  assert.equal(loggedOnlyResponse.requires_review, true);
  assert.equal(loggedOnlyResponse.modification_logged, true);
  assert.ok(!loggedOnlyResponse.change_request_created);
  assert.ok(!loggedOnlyResponse.reservation_request_id);

  // buildSafeModifyReservationRequestPayload — only bounded/safe fields, no raw payload.
  const fixedNow = new Date("2026-01-01T00:00:00.000Z");
  const longNotes = "b".repeat(MAX_NEW_NOTES_LENGTH + 200);
  const safePayload = buildSafeModifyReservationRequestPayload(
    {
      reservationRequestId: "rr-1",
      reservationId: null,
      callId: "call-1",
      customerName: "Jane Doe",
      phone: "+1 555 0100",
      normalizedPhone: "15550100",
      email: "jane@example.com",
      currentDate: "2026-08-20",
      currentDateProvided: true,
      currentTime: "20:00",
      currentTimeProvided: true,
      newDate: "2026-08-21",
      newDateProvided: true,
      newTime: "21:00",
      newTimeProvided: true,
      newPartySize: 4,
      newNotes: longNotes,
      reason: longReason,
      language: "en",
      toolCallId: "tc-1",
    },
    "exact",
    "change_request_created",
    fixedNow
  );
  assert.equal(safePayload.callId, "call-1");
  assert.equal(safePayload.reservationRequestId, "rr-1");
  assert.equal(safePayload.currentDate, "2026-08-20");
  assert.equal(safePayload.newDate, "2026-08-21");
  assert.equal(safePayload.newPartySize, 4);
  assert.equal(safePayload.newNotes!.length, MAX_NEW_NOTES_LENGTH);
  assert.equal(safePayload.reason!.length, MAX_REASON_LENGTH);
  assert.equal(safePayload.matchStatus, "exact");
  assert.equal(safePayload.actionTaken, "change_request_created");
  assert.equal(safePayload.source, "vapi");
  assert.equal(safePayload.requestedAt, fixedNow.toISOString());
  // never the raw payload/transcript fields.
  assert.ok(!("rawPayload" in safePayload));
  assert.ok(!("transcript" in safePayload));

  const minimalSafePayload = buildSafeModifyReservationRequestPayload(
    {
      reservationRequestId: null,
      reservationId: null,
      callId: "call-2",
      customerName: null,
      phone: null,
      normalizedPhone: null,
      email: null,
      currentDate: null,
      currentDateProvided: false,
      currentTime: null,
      currentTimeProvided: false,
      newDate: null,
      newDateProvided: false,
      newTime: null,
      newTimeProvided: false,
      newPartySize: null,
      newNotes: null,
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

  console.log("vapiModifyReservationRequestAdapter.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("vapiModifyReservationRequestAdapter.test.ts failed:", err);
  process.exitCode = 1;
});
