/**
 * vapiCallSummary.integration.test.ts — Phase 31 DB-backed checks for
 * POST /api/webhooks/vapi/:publicWebhookKey/log-call-summary, against a real
 * Postgres database. Same convention as vapiCustomerProfile.integration.test.ts:
 * needs a live DATABASE_URL, so it is NOT wired into `npm test` — run via:
 *
 *   npx tsx src/tests/vapiCallSummary.integration.test.ts
 *
 * If DATABASE_URL is unset or the database is unreachable, this script logs
 * a skip notice and exits 0 rather than failing the run.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";

const TEST_TAG = `vapicallsum_${Date.now()}`;

const SENSITIVE_FIELD_PATTERNS = [
  "passwordHash",
  "resetToken",
  "session",
  "refreshToken",
  "jwt",
  "JWT",
  "credentials",
  "credentialsEncrypted",
  "webhookVerifyTokenHash",
  "accessToken",
  "apiKey",
  "providerSecret",
  "clientSecret",
  "tokenValue",
  "rawPayload",
  "stateJson",
  "availableTableIds",
  "tableIds",
  "transcript",
  "fullTranscript",
];

function assertNoSensitiveFields(body: unknown, label: string) {
  const json = JSON.stringify(body);
  for (const pattern of SENSITIVE_FIELD_PATTERNS) {
    assert.ok(!json.includes(pattern), `${label} response must not contain "${pattern}": ${json}`);
  }
}

interface VapiCallSummaryBody {
  success?: boolean;
  message?: string;
  logged?: boolean;
  call_id?: string;
  event_id?: string;
  missing_fields?: string[];
  error?: string;
  results?: Array<{ toolCallId: string; result?: string; error?: string }>;
}

async function readJson(res: Response): Promise<VapiCallSummaryBody> {
  return (await res.json()) as VapiCallSummaryBody;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("vapiCallSummary.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log(
      "vapiCallSummary.integration.test.ts: SKIPPED (database unreachable):",
      (err as Error).message
    );
    return;
  }

  const organizationA = await prisma.organization.create({ data: { name: `${TEST_TAG}_org_a`, status: "active" } });
  const restaurantA = await prisma.restaurant.create({
    data: { organizationId: organizationA.id, name: `${TEST_TAG}_restaurant_a`, slug: `${TEST_TAG}-restaurant-a` },
  });
  const connectionA = await prisma.integrationConnection.create({
    data: {
      restaurantId: restaurantA.id,
      channel: "vapi",
      provider: "vapi",
      status: "active",
      publicWebhookKey: `${TEST_TAG}_key_a`,
    },
  });
  const inactiveConnection = await prisma.integrationConnection.create({
    data: {
      restaurantId: restaurantA.id,
      channel: "vapi",
      provider: "vapi",
      status: "inactive",
      publicWebhookKey: `${TEST_TAG}_key_a_inactive`,
    },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/webhooks/vapi`;
  const url = `${baseUrl}/${connectionA.publicWebhookKey}/log-call-summary`;

  try {
    // 1. Unknown publicWebhookKey is rejected.
    const unknownRes = await fetch(`${baseUrl}/${TEST_TAG}_no_such_key/log-call-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: "x" }),
    });
    assert.equal(unknownRes.status, 401, "unknown publicWebhookKey must be rejected");

    // 2. Inactive IntegrationConnection is rejected.
    const inactiveRes = await fetch(`${baseUrl}/${inactiveConnection.publicWebhookKey}/log-call-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: "x" }),
    });
    assert.equal(inactiveRes.status, 401, "inactive IntegrationConnection must be rejected like an unknown key");

    // 3. Missing callId and summary -> success:false with missing_fields.
    const missingRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const missingBody = await readJson(missingRes);
    assert.equal(missingRes.status, 200, "missing fields must never surface as a 500");
    assert.equal(missingBody.success, false);
    assert.ok(missingBody.missing_fields?.includes("call_id_or_summary"));

    // 4. Flat payload with callId + summary logs successfully.
    const flatRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_id: `${TEST_TAG}_call_flat`,
        summary: "Caller asked about opening hours and booked a table.",
        language: "en",
        duration_seconds: 30,
        ended_reason: "customer-ended-call",
      }),
    });
    const flatBody = await readJson(flatRes);
    assert.equal(flatRes.status, 200);
    assert.equal(flatBody.success, true, `flat payload must succeed: ${JSON.stringify(flatBody)}`);
    assert.equal(flatBody.logged, true);
    assert.equal(flatBody.call_id, `${TEST_TAG}_call_flat`);
    assert.ok(flatBody.event_id);
    assertNoSensitiveFields(flatBody, "flat log-call-summary");

    const flatEvent = await prisma.integrationEvent.findUnique({ where: { id: flatBody.event_id! } });
    assert.ok(flatEvent, "an IntegrationEvent row must be created");
    assert.equal(flatEvent!.restaurantId, restaurantA.id);
    assert.equal(flatEvent!.eventType, "call_summary");
    assertNoSensitiveFields(flatEvent!.payload, "IntegrationEvent.payload");

    // 5. Payload with only callId logs a minimal event successfully.
    const callIdOnlyRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: `${TEST_TAG}_call_id_only` }),
    });
    const callIdOnlyBody = await readJson(callIdOnlyRes);
    assert.equal(callIdOnlyBody.success, true);
    assert.equal(callIdOnlyBody.call_id, `${TEST_TAG}_call_id_only`);

    // 6. Payload with only summary logs successfully (call_id absent in response).
    const summaryOnlyRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: "Summary without a call id." }),
    });
    const summaryOnlyBody = await readJson(summaryOnlyRes);
    assert.equal(summaryOnlyBody.success, true);
    assert.equal(summaryOnlyBody.call_id, undefined, "call_id must be absent, not null, when not present");

    // 7. camelCase aliases normalize correctly.
    const camelRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId: `${TEST_TAG}_call_camel`,
        callSummary: "Camel case summary.",
        durationSeconds: 15,
        endedReason: "assistant-ended-call",
      }),
    });
    const camelBody = await readJson(camelRes);
    assert.equal(camelBody.success, true);
    assert.equal(camelBody.call_id, `${TEST_TAG}_call_camel`);

    // 8. Nested Vapi tool-call payload -> results[] envelope, inner JSON has success:true.
    const nestedRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          call: { id: `${TEST_TAG}_call_nested` },
          toolCalls: [
            {
              id: "tc-nested-1",
              function: { arguments: JSON.stringify({ summary: "Nested tool-call summary." }) },
            },
          ],
        },
      }),
    });
    assert.equal(nestedRes.status, 200);
    const nestedEnvelope = (await nestedRes.json()) as {
      results?: Array<{ toolCallId: string; result?: string; error?: string }>;
    };
    assert.ok(
      nestedEnvelope.results?.[0]?.result,
      `nested tool-call payload must be wrapped in the results[] envelope: ${JSON.stringify(nestedEnvelope)}`
    );
    const nestedBody = JSON.parse(nestedEnvelope.results![0].result!) as VapiCallSummaryBody;
    assert.equal(nestedBody.success, true);
    assert.equal(nestedBody.call_id, `${TEST_TAG}_call_nested`, "call_id from message.call.id is used as fallback");
    assertNoSensitiveFields(nestedEnvelope, "nested tool-call log-call-summary");

    // 9. JSON-string function arguments are parsed (already covered by step 8's
    // JSON.stringify(...) argument shape, asserted again explicitly here).
    assert.equal(typeof nestedBody.event_id, "string");

    // 10. Long summary is bounded/truncated according to policy.
    const longSummary = "x".repeat(5000);
    const longRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: `${TEST_TAG}_call_long`, summary: longSummary }),
    });
    const longBody = await readJson(longRes);
    assert.equal(longBody.success, true);
    const longEvent = await prisma.integrationEvent.findUnique({ where: { id: longBody.event_id! } });
    const storedSummary = (longEvent!.payload as { summary?: string })?.summary ?? "";
    assert.ok(storedSummary.length <= 4000, "stored summary must be bounded to <= 4000 characters");
    assert.ok(storedSummary.length < longSummary.length, "stored summary must be truncated from the original input");

    // 11. Transcript/raw payload is never returned in the response.
    const transcriptRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_id: `${TEST_TAG}_call_transcript`,
        summary: "Has a transcript field too.",
        transcript: "This is the full transcript text that must never leak.",
      }),
    });
    const transcriptBody = await readJson(transcriptRes);
    assertNoSensitiveFields(transcriptBody, "log-call-summary with transcript field");

    // 12. No Customer/ReservationRequest/Reservation is created by this route.
    const customerCount = await prisma.customer.count({ where: { restaurantId: restaurantA.id } });
    assert.equal(customerCount, 0, "log-call-summary must never create a Customer");
    const reservationRequestCount = await prisma.reservationRequest.count({ where: { restaurantId: restaurantA.id } });
    assert.equal(reservationRequestCount, 0, "log-call-summary must never create a ReservationRequest");
    const reservationCount = await prisma.reservation.count({ where: { restaurantId: restaurantA.id } });
    assert.equal(reservationCount, 0, "log-call-summary must never create a Reservation");

    // 13. ToolLog success/failure status.
    const successToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurantA.id, toolName: "log_call_summary", status: "success" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(successToolLog, "a success ToolLog row must exist for log_call_summary");
    assertNoSensitiveFields(successToolLog!.responsePayload, "ToolLog.responsePayload");

    const failureToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurantA.id, toolName: "log_call_summary", status: "failure" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(failureToolLog, "a failure ToolLog row must exist for a missing-fields log_call_summary call");

    // 14. Final sensitive/internal field response check.
    assertNoSensitiveFields(flatBody, "final flat log-call-summary sensitive-field check");
    assertNoSensitiveFields(camelBody, "final camelCase log-call-summary sensitive-field check");

    console.log("vapiCallSummary.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.integrationEvent.deleteMany({ where: { restaurantId: restaurantA.id } });
    await prisma.toolLog.deleteMany({ where: { restaurantId: restaurantA.id } });
    await prisma.integrationConnection.deleteMany({ where: { id: { in: [connectionA.id, inactiveConnection.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: restaurantA.id } });
    await prisma.organization.deleteMany({ where: { id: organizationA.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("vapiCallSummary.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
