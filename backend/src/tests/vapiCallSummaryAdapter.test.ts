/**
 * vapiCallSummaryAdapter.test.ts — pure-logic checks for the Phase 31 Vapi
 * log-call-summary adapter (argument extraction, missing-field computation,
 * truncation, response-shape builders). No Prisma/DB involved, so this is
 * wired into `npm test`.
 *
 * Run: npx tsx src/tests/vapiCallSummaryAdapter.test.ts
 */
import assert from "node:assert/strict";
import {
  buildCallSummaryMissingFieldsResponse,
  buildCallSummarySuccessResponse,
  buildSafeCallSummaryPayload,
  computeCallSummaryMissingFields,
  extractCallSummaryArgs,
  MAX_SUMMARY_LENGTH,
  truncateSummary,
} from "../utils/vapi/callSummaryAdapter";

async function main() {
  // extractCallSummaryArgs — flat snake_case.
  const flat = extractCallSummaryArgs(
    [{ call_id: "call-1", summary: "Caller asked about hours.", language: "en", duration_seconds: 42, ended_reason: "customer-ended-call", outcome: "resolved" }],
    {}
  );
  assert.equal(flat.callId, "call-1");
  assert.equal(flat.summary, "Caller asked about hours.");
  assert.equal(flat.language, "en");
  assert.equal(flat.durationSeconds, 42);
  assert.equal(flat.endedReason, "customer-ended-call");
  assert.equal(flat.outcome, "resolved");

  // camelCase aliases.
  const camel = extractCallSummaryArgs(
    [{ callId: "call-2", callSummary: "Booked a table.", durationSeconds: 12, endedReason: "assistant-ended-call" }],
    {}
  );
  assert.equal(camel.callId, "call-2");
  assert.equal(camel.summary, "Booked a table.");
  assert.equal(camel.durationSeconds, 12);
  assert.equal(camel.endedReason, "assistant-ended-call");

  // conversationId / vapiCallId aliases.
  assert.equal(extractCallSummaryArgs([{ conversationId: "conv-1" }], {}).callId, "conv-1");
  assert.equal(extractCallSummaryArgs([{ vapiCallId: "vc-1" }], {}).callId, "vc-1");

  // message.call.id fallback when no alias matches.
  const envelopeFallback = extractCallSummaryArgs([{}], { message: { call: { id: "call-envelope" } } });
  assert.equal(envelopeFallback.callId, "call-envelope");

  // Nested Vapi tool-call envelope with JSON-string arguments + call id passthrough.
  const nestedArgs = { call_id: "call-nested", summary: "Nested summary." };
  const nestedRawBody = {
    message: { toolCalls: [{ id: "tc-1", function: { arguments: JSON.stringify(nestedArgs) } }] },
  };
  const nestedExtracted = extractCallSummaryArgs([nestedArgs, nestedRawBody], nestedRawBody);
  assert.equal(nestedExtracted.callId, "call-nested");
  assert.equal(nestedExtracted.summary, "Nested summary.");
  assert.equal(nestedExtracted.toolCallId, "tc-1");

  // Phone extraction via aliases and envelope fallback.
  const phoneAlias = extractCallSummaryArgs([{ call_id: "x", phoneNumber: "+1 555 0100" }], {});
  assert.equal(phoneAlias.phone, "+1 555 0100");
  assert.equal(phoneAlias.normalizedPhone, "15550100");

  const phoneEnvelope = extractCallSummaryArgs([{ call_id: "x" }], {
    customer: { number: "+1 555 0200" },
  });
  assert.equal(phoneEnvelope.phone, "+1 555 0200");

  // Transcript is extracted but never required/used for missing-fields logic.
  const withTranscript = extractCallSummaryArgs([{ call_id: "x", transcript: "full text here" }], {});
  assert.equal(withTranscript.transcript, "full text here");

  // Empty payload -> all null.
  const empty = extractCallSummaryArgs([{}], {});
  assert.equal(empty.callId, null);
  assert.equal(empty.summary, null);
  assert.equal(empty.phone, null);
  assert.equal(empty.durationSeconds, null);

  // computeCallSummaryMissingFields — callId OR summary required.
  assert.deepEqual(
    computeCallSummaryMissingFields({
      callId: null,
      summary: null,
      transcript: null,
      phone: null,
      normalizedPhone: null,
      customerName: null,
      language: null,
      durationSeconds: null,
      endedReason: null,
      outcome: null,
      toolCallId: null,
    }),
    ["call_id_or_summary"],
    "missing both callId and summary"
  );
  assert.deepEqual(
    computeCallSummaryMissingFields({
      callId: "call-1",
      summary: null,
      transcript: null,
      phone: null,
      normalizedPhone: null,
      customerName: null,
      language: null,
      durationSeconds: null,
      endedReason: null,
      outcome: null,
      toolCallId: null,
    }),
    [],
    "callId alone satisfies the requirement"
  );
  assert.deepEqual(
    computeCallSummaryMissingFields({
      callId: null,
      summary: "Some summary.",
      transcript: null,
      phone: null,
      normalizedPhone: null,
      customerName: null,
      language: null,
      durationSeconds: null,
      endedReason: null,
      outcome: null,
      toolCallId: null,
    }),
    [],
    "summary alone satisfies the requirement"
  );

  // truncateSummary — bounding policy.
  const longSummary = "a".repeat(MAX_SUMMARY_LENGTH + 500);
  const truncated = truncateSummary(longSummary);
  assert.equal(truncated.length, MAX_SUMMARY_LENGTH);
  const shortSummary = "short summary";
  assert.equal(truncateSummary(shortSummary), shortSummary);

  // buildCallSummaryMissingFieldsResponse shape.
  const missingResponse = buildCallSummaryMissingFieldsResponse(["call_id_or_summary"]);
  assert.equal(missingResponse.success, false);
  assert.deepEqual(missingResponse.missing_fields, ["call_id_or_summary"]);

  // buildCallSummarySuccessResponse shape.
  const successResponse = buildCallSummarySuccessResponse("call-1", "event-1");
  assert.equal(successResponse.success, true);
  assert.equal(successResponse.logged, true);
  assert.equal(successResponse.call_id, "call-1");
  assert.equal(successResponse.event_id, "event-1");

  const successResponseNoCallId = buildCallSummarySuccessResponse(null, "event-2");
  assert.equal(successResponseNoCallId.call_id, undefined, "call_id is omitted, not null, when absent");

  // buildSafeCallSummaryPayload — only bounded/safe fields, no transcript/rawPayload.
  const safePayload = buildSafeCallSummaryPayload({
    callId: "call-1",
    summary: longSummary,
    transcript: "this must never appear in the payload",
    phone: "+1 555 0100",
    normalizedPhone: "15550100",
    customerName: "Jane Doe",
    language: "en",
    durationSeconds: 30,
    endedReason: "customer-ended-call",
    outcome: "resolved",
    toolCallId: "tc-1",
  });
  assert.equal(safePayload.callId, "call-1");
  assert.equal(safePayload.summary!.length, MAX_SUMMARY_LENGTH);
  assert.equal(safePayload.language, "en");
  assert.equal(safePayload.outcome, "resolved");
  assert.equal(safePayload.durationSeconds, 30);
  assert.equal(safePayload.endedReason, "customer-ended-call");
  assert.ok(!JSON.stringify(safePayload).includes("transcript"), "safe payload must never include transcript");
  assert.ok(!("phone" in safePayload), "safe payload must never include phone/PII fields");

  const minimalSafePayload = buildSafeCallSummaryPayload({
    callId: "call-2",
    summary: null,
    transcript: null,
    phone: null,
    normalizedPhone: null,
    customerName: null,
    language: null,
    durationSeconds: null,
    endedReason: null,
    outcome: null,
    toolCallId: null,
  });
  assert.deepEqual(minimalSafePayload, { callId: "call-2" });

  console.log("vapiCallSummaryAdapter.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("vapiCallSummaryAdapter.test.ts failed:", err);
  process.exitCode = 1;
});
