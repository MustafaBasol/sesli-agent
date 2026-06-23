/**
 * vapiHandoffToStaffAdapter.test.ts — pure-logic checks for the Phase 33 Vapi
 * handoff-to-staff adapter (argument extraction, missing-field computation,
 * truncation, response-shape builders). No Prisma/DB involved, so this is
 * wired into `npm test`.
 *
 * Run: npx tsx src/tests/vapiHandoffToStaffAdapter.test.ts
 */
import assert from "node:assert/strict";
import {
  buildHandoffToStaffMissingFieldsResponse,
  buildHandoffToStaffSuccessResponse,
  buildSafeHandoffToStaffPayload,
  computeHandoffToStaffMissingFields,
  extractHandoffToStaffArgs,
  MAX_MESSAGE_LENGTH,
  MAX_REASON_LENGTH,
  truncateText,
} from "../utils/vapi/handoffToStaffAdapter";

async function main() {
  // extractHandoffToStaffArgs — flat snake_case.
  const flat = extractHandoffToStaffArgs(
    [
      {
        call_id: "call-1",
        reason: "Customer wants a refund.",
        message: "Please call me back.",
        urgency: "high",
        customer_name: "Jane Doe",
        phone: "+1 555 0100",
        email: "jane@example.com",
        language: "en",
      },
    ],
    {}
  );
  assert.equal(flat.callId, "call-1");
  assert.equal(flat.reason, "Customer wants a refund.");
  assert.equal(flat.message, "Please call me back.");
  assert.equal(flat.urgency, "high");
  assert.equal(flat.customerName, "Jane Doe");
  assert.equal(flat.phone, "+1 555 0100");
  assert.equal(flat.normalizedPhone, "15550100");
  assert.equal(flat.email, "jane@example.com");
  assert.equal(flat.language, "en");

  // camelCase aliases.
  const camel = extractHandoffToStaffArgs(
    [
      {
        callId: "call-2",
        handoffReason: "Wants to speak to a manager.",
        customerMessage: "It's urgent.",
        priority: "urgent",
        customerName: "John Smith",
        callerNumber: "+1 555 0200",
        customerEmail: "john@example.com",
        locale: "fr",
      },
    ],
    {}
  );
  assert.equal(camel.callId, "call-2");
  assert.equal(camel.reason, "Wants to speak to a manager.");
  assert.equal(camel.message, "It's urgent.");
  assert.equal(camel.urgency, "urgent");
  assert.equal(camel.customerName, "John Smith");
  assert.equal(camel.phone, "+1 555 0200");
  assert.equal(camel.email, "john@example.com");
  assert.equal(camel.language, "fr");

  // conversationId / vapiCallId aliases.
  assert.equal(extractHandoffToStaffArgs([{ conversationId: "conv-1" }], {}).callId, "conv-1");
  assert.equal(extractHandoffToStaffArgs([{ vapiCallId: "vc-1" }], {}).callId, "vc-1");

  // message.call.id fallback when no alias matches.
  const envelopeFallback = extractHandoffToStaffArgs([{}], { message: { call: { id: "call-envelope" } } });
  assert.equal(envelopeFallback.callId, "call-envelope");

  // Nested Vapi tool-call envelope with JSON-string arguments + call id passthrough.
  const nestedArgs = { call_id: "call-nested", reason: "Nested reason." };
  const nestedRawBody = {
    message: { toolCalls: [{ id: "tc-1", function: { arguments: JSON.stringify(nestedArgs) } }] },
  };
  const nestedExtracted = extractHandoffToStaffArgs([nestedArgs, nestedRawBody], nestedRawBody);
  assert.equal(nestedExtracted.callId, "call-nested");
  assert.equal(nestedExtracted.reason, "Nested reason.");
  assert.equal(nestedExtracted.toolCallId, "tc-1");

  // Phone extraction via envelope fallback.
  const phoneEnvelope = extractHandoffToStaffArgs([{ call_id: "x" }], {
    customer: { number: "+1 555 0300" },
  });
  assert.equal(phoneEnvelope.phone, "+1 555 0300");

  // Empty payload -> all null.
  const empty = extractHandoffToStaffArgs([{}], {});
  assert.equal(empty.callId, null);
  assert.equal(empty.reason, null);
  assert.equal(empty.message, null);
  assert.equal(empty.phone, null);

  // computeHandoffToStaffMissingFields — at least one signal field required.
  assert.deepEqual(
    computeHandoffToStaffMissingFields({
      callId: null,
      reason: null,
      message: null,
      urgency: null,
      customerName: null,
      phone: null,
      normalizedPhone: null,
      email: null,
      language: null,
      toolCallId: null,
    }),
    ["reason_or_message_or_callId_or_phone_or_customerName"],
    "missing every signal field"
  );
  assert.deepEqual(
    computeHandoffToStaffMissingFields({
      callId: "call-1",
      reason: null,
      message: null,
      urgency: null,
      customerName: null,
      phone: null,
      normalizedPhone: null,
      email: null,
      language: null,
      toolCallId: null,
    }),
    [],
    "callId alone satisfies the requirement"
  );
  assert.deepEqual(
    computeHandoffToStaffMissingFields({
      callId: null,
      reason: "Wants a callback.",
      message: null,
      urgency: null,
      customerName: null,
      phone: null,
      normalizedPhone: null,
      email: null,
      language: null,
      toolCallId: null,
    }),
    [],
    "reason alone satisfies the requirement"
  );

  // truncateText — bounding policy for reason/message independently.
  const longReason = "a".repeat(MAX_REASON_LENGTH + 500);
  assert.equal(truncateText(longReason, MAX_REASON_LENGTH).length, MAX_REASON_LENGTH);
  const longMessage = "b".repeat(MAX_MESSAGE_LENGTH + 500);
  assert.equal(truncateText(longMessage, MAX_MESSAGE_LENGTH).length, MAX_MESSAGE_LENGTH);
  const shortText = "short text";
  assert.equal(truncateText(shortText, MAX_REASON_LENGTH), shortText);

  // buildHandoffToStaffMissingFieldsResponse shape.
  const missingResponse = buildHandoffToStaffMissingFieldsResponse(
    ["reason_or_message_or_callId_or_phone_or_customerName"],
    "en"
  );
  assert.equal(missingResponse.success, false);
  assert.deepEqual(missingResponse.missing_fields, ["reason_or_message_or_callId_or_phone_or_customerName"]);

  // buildHandoffToStaffSuccessResponse shape — must never claim staff were notified.
  const successResponse = buildHandoffToStaffSuccessResponse("event-1", "en");
  assert.equal(successResponse.success, true);
  assert.equal(successResponse.handoff_logged, true);
  assert.equal(successResponse.event_id, "event-1");
  assert.ok(!/notified/i.test(successResponse.message), "response must not claim staff were notified");

  // Language fallback to English for unsupported language codes.
  const unsupportedLangResponse = buildHandoffToStaffSuccessResponse("event-2", "de");
  assert.equal(unsupportedLangResponse.message, buildHandoffToStaffSuccessResponse("event-2", "en").message);

  // buildSafeHandoffToStaffPayload — only bounded/safe fields, no raw payload.
  const fixedNow = new Date("2026-01-01T00:00:00.000Z");
  const safePayload = buildSafeHandoffToStaffPayload(
    {
      callId: "call-1",
      reason: longReason,
      message: longMessage,
      urgency: "high",
      customerName: "Jane Doe",
      phone: "+1 555 0100",
      normalizedPhone: "15550100",
      email: "jane@example.com",
      language: "en",
      toolCallId: "tc-1",
    },
    fixedNow
  );
  assert.equal(safePayload.callId, "call-1");
  assert.equal(safePayload.reason!.length, MAX_REASON_LENGTH);
  assert.equal(safePayload.message!.length, MAX_MESSAGE_LENGTH);
  assert.equal(safePayload.urgency, "high");
  assert.equal(safePayload.customerName, "Jane Doe");
  assert.equal(safePayload.phone, "+1 555 0100");
  assert.equal(safePayload.email, "jane@example.com");
  assert.equal(safePayload.language, "en");
  assert.equal(safePayload.source, "vapi");
  assert.equal(safePayload.requestedAt, fixedNow.toISOString());

  const minimalSafePayload = buildSafeHandoffToStaffPayload(
    {
      callId: "call-2",
      reason: null,
      message: null,
      urgency: null,
      customerName: null,
      phone: null,
      normalizedPhone: null,
      email: null,
      language: null,
      toolCallId: null,
    },
    fixedNow
  );
  assert.deepEqual(minimalSafePayload, { callId: "call-2", requestedAt: fixedNow.toISOString(), source: "vapi" });

  console.log("vapiHandoffToStaffAdapter.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("vapiHandoffToStaffAdapter.test.ts failed:", err);
  process.exitCode = 1;
});
