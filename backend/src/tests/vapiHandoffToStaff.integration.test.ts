/**
 * vapiHandoffToStaff.integration.test.ts — Phase 33 DB-backed checks for
 * POST /api/webhooks/vapi/:publicWebhookKey/handoff-to-staff, against a real
 * Postgres database. Same convention as vapiCallSummary.integration.test.ts:
 * needs a live DATABASE_URL, so it is NOT wired into `npm test` — run via:
 *
 *   npx tsx src/tests/vapiHandoffToStaff.integration.test.ts
 *
 * If DATABASE_URL is unset or the database is unreachable, this script logs
 * a skip notice and exits 0 rather than failing the run.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";

const TEST_TAG = `vapihandoff_${Date.now()}`;

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

// Checks object/array KEY NAMES recursively against the sensitive-field
// patterns (case-insensitive substring match on the key itself), not the
// serialized JSON text. This avoids false positives where a sensitive word
// appears inside a legitimate VALUE while still catching any field actually
// named like a sensitive pattern, at any nesting depth.
function collectSensitiveKeyHits(value: unknown, patterns: string[], path = ""): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => hits.push(...collectSensitiveKeyHits(item, patterns, `${path}[${index}]`)));
    return hits;
  }
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const keyPath = path ? `${path}.${key}` : key;
      const lowerKey = key.toLowerCase();
      if (patterns.some((pattern) => lowerKey.includes(pattern.toLowerCase()))) {
        hits.push(keyPath);
      }
      hits.push(...collectSensitiveKeyHits(val, patterns, keyPath));
    }
  }
  return hits;
}

function assertNoSensitiveFields(body: unknown, label: string) {
  const hits = collectSensitiveKeyHits(body, SENSITIVE_FIELD_PATTERNS);
  assert.equal(
    hits.length,
    0,
    `${label} response must not contain sensitive field name(s) [${hits.join(", ")}]: ${JSON.stringify(body)}`
  );
}

interface VapiHandoffToStaffBody {
  success?: boolean;
  message?: string;
  handoff_logged?: boolean;
  event_id?: string;
  next_step?: string;
  missing_fields?: string[];
  error?: string;
  results?: Array<{ toolCallId: string; result?: string; error?: string }>;
}

async function readJson(res: Response): Promise<VapiHandoffToStaffBody> {
  return (await res.json()) as VapiHandoffToStaffBody;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("vapiHandoffToStaff.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log(
      "vapiHandoffToStaff.integration.test.ts: SKIPPED (database unreachable):",
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
  const url = `${baseUrl}/${connectionA.publicWebhookKey}/handoff-to-staff`;

  try {
    // 1. Unknown publicWebhookKey is rejected.
    const unknownRes = await fetch(`${baseUrl}/${TEST_TAG}_no_such_key/handoff-to-staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: "x" }),
    });
    assert.equal(unknownRes.status, 401, "unknown publicWebhookKey must be rejected");

    // 2. Inactive IntegrationConnection is rejected.
    const inactiveRes = await fetch(`${baseUrl}/${inactiveConnection.publicWebhookKey}/handoff-to-staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: "x" }),
    });
    assert.equal(inactiveRes.status, 401, "inactive IntegrationConnection must be rejected like an unknown key");

    // 3. Completely empty payload -> success:false with missing_fields, never a 500.
    const missingRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const missingBody = await readJson(missingRes);
    assert.equal(missingRes.status, 200, "missing fields must never surface as a 500");
    assert.equal(missingBody.success, false);
    assert.ok(missingBody.missing_fields?.length);

    // 4. Flat payload logs a handoff successfully.
    const flatRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_id: `${TEST_TAG}_call_flat`,
        reason: "Customer wants to speak to a manager.",
        message: "Please call back today.",
        urgency: "high",
        customer_name: "Smoke Handoff Customer",
        phone: "+33000000003",
        email: "handoff@example.test",
        language: "en",
      }),
    });
    const flatBody = await readJson(flatRes);
    assert.equal(flatRes.status, 200);
    assert.equal(flatBody.success, true, `flat payload must succeed: ${JSON.stringify(flatBody)}`);
    assert.equal(flatBody.handoff_logged, true);
    assert.ok(flatBody.event_id);
    assert.ok(!/notified/i.test(flatBody.message ?? ""), "response must not claim staff were notified");
    assertNoSensitiveFields(flatBody, "flat handoff-to-staff");

    const flatEvent = await prisma.integrationEvent.findUnique({ where: { id: flatBody.event_id! } });
    assert.ok(flatEvent, "an IntegrationEvent row must be created");
    assert.equal(flatEvent!.restaurantId, restaurantA.id);
    assert.equal(flatEvent!.eventType, "handoff_to_staff");
    assertNoSensitiveFields(flatEvent!.payload, "IntegrationEvent.payload");
    const flatPayload = flatEvent!.payload as Record<string, unknown>;
    assert.equal(flatPayload.reason, "Customer wants to speak to a manager.");
    assert.equal(flatPayload.customerName, "Smoke Handoff Customer");
    assert.equal(flatPayload.source, "vapi");

    // 5. Payload with only callId is handled successfully (callId alone satisfies the policy).
    const callIdOnlyRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: `${TEST_TAG}_call_id_only` }),
    });
    const callIdOnlyBody = await readJson(callIdOnlyRes);
    assert.equal(callIdOnlyBody.success, true);

    // 6. camelCase/snake_case aliases normalize correctly.
    const camelRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId: `${TEST_TAG}_call_camel`,
        handoffReason: "Camel case reason.",
        customerMessage: "Camel case message.",
        priority: "urgent",
        customerName: "Camel Customer",
        callerNumber: "+33000000004",
        customerEmail: "camel@example.test",
        locale: "fr",
      }),
    });
    const camelBody = await readJson(camelRes);
    assert.equal(camelBody.success, true);
    const camelEvent = await prisma.integrationEvent.findUnique({ where: { id: camelBody.event_id! } });
    const camelPayload = camelEvent!.payload as Record<string, unknown>;
    assert.equal(camelPayload.reason, "Camel case reason.");
    assert.equal(camelPayload.urgency, "urgent");

    // 7. Nested Vapi tool-call payload -> results[] envelope, inner JSON has success:true.
    const nestedRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          call: { id: `${TEST_TAG}_call_nested` },
          toolCalls: [
            {
              id: "tc-nested-1",
              function: { arguments: JSON.stringify({ reason: "Nested tool-call reason." }) },
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
    const nestedBody = JSON.parse(nestedEnvelope.results![0].result!) as VapiHandoffToStaffBody;
    assert.equal(nestedBody.success, true);
    assertNoSensitiveFields(nestedEnvelope, "nested tool-call handoff-to-staff");

    // 8. JSON-string function arguments are parsed (covered by step 7's
    // JSON.stringify(...) argument shape, asserted again explicitly here).
    assert.equal(typeof nestedBody.event_id, "string");

    // 9. Long reason/message are bounded/truncated according to policy.
    const longReason = "x".repeat(3000);
    const longMessage = "y".repeat(3000);
    const longRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: `${TEST_TAG}_call_long`, reason: longReason, message: longMessage }),
    });
    const longBody = await readJson(longRes);
    assert.equal(longBody.success, true);
    const longEvent = await prisma.integrationEvent.findUnique({ where: { id: longBody.event_id! } });
    const longPayload = longEvent!.payload as { reason?: string; message?: string };
    assert.ok((longPayload.reason?.length ?? 0) <= 2000, "stored reason must be bounded to <= 2000 characters");
    assert.ok((longPayload.message?.length ?? 0) <= 2000, "stored message must be bounded to <= 2000 characters");
    assert.ok((longPayload.reason?.length ?? 0) < longReason.length, "stored reason must be truncated from input");

    // 10. No Customer is created by this route.
    const customerCount = await prisma.customer.count({ where: { restaurantId: restaurantA.id } });
    assert.equal(customerCount, 0, "handoff-to-staff must never create a Customer");

    // 11. No ReservationRequest is created by this route.
    const reservationRequestCount = await prisma.reservationRequest.count({ where: { restaurantId: restaurantA.id } });
    assert.equal(reservationRequestCount, 0, "handoff-to-staff must never create a ReservationRequest");

    // 12. No Reservation is created/modified/cancelled by this route.
    const reservationCount = await prisma.reservation.count({ where: { restaurantId: restaurantA.id } });
    assert.equal(reservationCount, 0, "handoff-to-staff must never create/modify a Reservation");

    // 13. IntegrationEvent row created correctly (re-checked across all rows for this restaurant).
    const eventCount = await prisma.integrationEvent.count({
      where: { restaurantId: restaurantA.id, eventType: "handoff_to_staff" },
    });
    assert.ok(eventCount >= 5, "every successful call above must have created a handoff_to_staff IntegrationEvent");

    // 14. ToolLog success/failure status.
    const successToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurantA.id, toolName: "handoff_to_staff", status: "success" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(successToolLog, "a success ToolLog row must exist for handoff_to_staff");
    assertNoSensitiveFields(successToolLog!.responsePayload, "ToolLog.responsePayload");

    const failureToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurantA.id, toolName: "handoff_to_staff", status: "failure" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(failureToolLog, "a failure ToolLog row must exist for the empty-payload handoff_to_staff call");

    // 15. Final sensitive/internal field response check.
    assertNoSensitiveFields(flatBody, "final flat handoff-to-staff sensitive-field check");
    assertNoSensitiveFields(camelBody, "final camelCase handoff-to-staff sensitive-field check");

    console.log("vapiHandoffToStaff.integration.test.ts: all checks passed");
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
  console.error("vapiHandoffToStaff.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
