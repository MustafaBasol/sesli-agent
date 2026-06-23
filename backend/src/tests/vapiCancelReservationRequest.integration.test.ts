/**
 * vapiCancelReservationRequest.integration.test.ts — Phase 34 DB-backed
 * checks for POST /api/webhooks/vapi/:publicWebhookKey/cancel-reservation-request,
 * against a real Postgres database. Same convention as
 * vapiHandoffToStaff.integration.test.ts: needs a live DATABASE_URL, so it is
 * NOT wired into `npm test` — run via:
 *
 *   npx tsx src/tests/vapiCancelReservationRequest.integration.test.ts
 *
 * If DATABASE_URL is unset or the database is unreachable, this script logs
 * a skip notice and exits 0 rather than failing the run.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";

const TEST_TAG = `vapicancel_${Date.now()}`;

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

interface VapiCancelReservationRequestBody {
  success?: boolean;
  message?: string;
  cancellation_requested?: boolean;
  cancellation_logged?: boolean;
  reservation_request_cancelled?: boolean;
  requires_review?: boolean;
  match_status?: string;
  event_id?: string;
  reservation_request_id?: string;
  missing_fields?: string[];
  error?: string;
  results?: Array<{ toolCallId: string; result?: string; error?: string }>;
}

async function readJson(res: Response): Promise<VapiCancelReservationRequestBody> {
  return (await res.json()) as VapiCancelReservationRequestBody;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("vapiCancelReservationRequest.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log(
      "vapiCancelReservationRequest.integration.test.ts: SKIPPED (database unreachable):",
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

  const organizationB = await prisma.organization.create({ data: { name: `${TEST_TAG}_org_b`, status: "active" } });
  const restaurantB = await prisma.restaurant.create({
    data: { organizationId: organizationB.id, name: `${TEST_TAG}_restaurant_b`, slug: `${TEST_TAG}-restaurant-b` },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/webhooks/vapi`;
  const url = `${baseUrl}/${connectionA.publicWebhookKey}/cancel-reservation-request`;

  try {
    // 1. Unknown publicWebhookKey is rejected.
    const unknownRes = await fetch(`${baseUrl}/${TEST_TAG}_no_such_key/cancel-reservation-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: "x" }),
    });
    assert.equal(unknownRes.status, 401, "unknown publicWebhookKey must be rejected");

    // 2. Inactive IntegrationConnection is rejected.
    const inactiveRes = await fetch(`${baseUrl}/${inactiveConnection.publicWebhookKey}/cancel-reservation-request`, {
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

    // 4. Explicit pending reservationRequestId cancels that request through existing transition logic.
    const pendingCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Pending Customer", phoneNumber: "+33000000010", normalizedPhone: "33000000010" },
    });
    const pendingRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: pendingCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Pending Customer",
        phoneNumber: "+33000000010",
        normalizedPhone: "33000000010",
        partySize: 2,
        reservationDate: new Date("2026-08-20T00:00:00.000Z"),
        reservationTime: "20:00",
        status: "new",
      },
    });
    const pendingRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_request_id: pendingRequest.id, call_id: `${TEST_TAG}_call_pending` }),
    });
    const pendingBody = await readJson(pendingRes);
    assert.equal(pendingRes.status, 200);
    assert.equal(pendingBody.success, true, `pending cancel must succeed: ${JSON.stringify(pendingBody)}`);
    assert.equal(pendingBody.reservation_request_cancelled, true);
    assert.equal(pendingBody.match_status, "exact");
    assert.equal(pendingBody.reservation_request_id, pendingRequest.id);
    assertNoSensitiveFields(pendingBody, "pending reservationRequestId cancel");
    const cancelledRequest = await prisma.reservationRequest.findUnique({ where: { id: pendingRequest.id } });
    assert.equal(cancelledRequest!.status, "cancelled", "pending request must be transitioned to cancelled");

    // 5. Explicit non-existing reservationRequestId logs IntegrationEvent, no mutation.
    const nonExistingRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_request_id: `${TEST_TAG}_nonexisting_request`,
        call_id: `${TEST_TAG}_call_nonexisting`,
      }),
    });
    const nonExistingBody = await readJson(nonExistingRes);
    assert.equal(nonExistingBody.success, true);
    assert.equal(nonExistingBody.requires_review, true);
    assert.equal(nonExistingBody.match_status, "unmatched");
    assert.ok(nonExistingBody.event_id);
    assert.ok(!nonExistingBody.reservation_request_cancelled);

    // 6. Confirmed/converted request logs intent/review-required, no force mutation.
    const confirmedCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Confirmed Customer", phoneNumber: "+33000000011", normalizedPhone: "33000000011" },
    });
    const confirmedRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: confirmedCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Confirmed Customer",
        phoneNumber: "+33000000011",
        normalizedPhone: "33000000011",
        partySize: 3,
        reservationDate: new Date("2026-08-21T00:00:00.000Z"),
        reservationTime: "19:00",
        status: "confirmed",
      },
    });
    const confirmedRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_request_id: confirmedRequest.id, call_id: `${TEST_TAG}_call_confirmed` }),
    });
    const confirmedBody = await readJson(confirmedRes);
    assert.equal(confirmedBody.success, true);
    assert.equal(confirmedBody.requires_review, true);
    assert.equal(confirmedBody.match_status, "confirmed_reservation_review_required");
    assert.ok(!confirmedBody.reservation_request_cancelled);
    assert.ok(!/cancelled/i.test(confirmedBody.message ?? ""), "must not claim a confirmed request was cancelled");
    const stillConfirmedRequest = await prisma.reservationRequest.findUnique({ where: { id: confirmedRequest.id } });
    assert.equal(stillConfirmedRequest!.status, "confirmed", "confirmed request must not be force-mutated");

    // 7. Phone/date/time matching exactly one pending request cancels only that request.
    const matchCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Match Customer", phoneNumber: "+33000000012", normalizedPhone: "33000000012" },
    });
    const matchRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: matchCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Match Customer",
        phoneNumber: "+33000000012",
        normalizedPhone: "33000000012",
        partySize: 2,
        reservationDate: new Date("2026-08-22T00:00:00.000Z"),
        reservationTime: "21:00",
        status: "new",
      },
    });
    const matchRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "+33000000012",
        date: "2026-08-22",
        time: "21:00",
        call_id: `${TEST_TAG}_call_match`,
      }),
    });
    const matchBody = await readJson(matchRes);
    assert.equal(matchBody.success, true);
    assert.equal(matchBody.match_status, "exact");
    assert.equal(matchBody.reservation_request_id, matchRequest.id);
    const matchedRequestAfter = await prisma.reservationRequest.findUnique({ where: { id: matchRequest.id } });
    assert.equal(matchedRequestAfter!.status, "cancelled");

    // 8. Ambiguous matches log intent and mutate nothing.
    const ambiguousCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Ambiguous Customer", phoneNumber: "+33000000013", normalizedPhone: "33000000013" },
    });
    const ambiguousRequest1 = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: ambiguousCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Ambiguous Customer",
        phoneNumber: "+33000000013",
        normalizedPhone: "33000000013",
        partySize: 2,
        reservationDate: new Date("2026-08-23T00:00:00.000Z"),
        reservationTime: "18:00",
        status: "new",
      },
    });
    const ambiguousRequest2 = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: ambiguousCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Ambiguous Customer",
        phoneNumber: "+33000000013",
        normalizedPhone: "33000000013",
        partySize: 4,
        reservationDate: new Date("2026-08-23T00:00:00.000Z"),
        reservationTime: "18:00",
        status: "pending_info",
      },
    });
    const ambiguousRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "+33000000013",
        date: "2026-08-23",
        time: "18:00",
        call_id: `${TEST_TAG}_call_ambiguous`,
      }),
    });
    const ambiguousBody = await readJson(ambiguousRes);
    assert.equal(ambiguousBody.success, true);
    assert.equal(ambiguousBody.match_status, "ambiguous");
    assert.ok(!ambiguousBody.reservation_request_cancelled);
    const ambiguous1After = await prisma.reservationRequest.findUnique({ where: { id: ambiguousRequest1.id } });
    const ambiguous2After = await prisma.reservationRequest.findUnique({ where: { id: ambiguousRequest2.id } });
    assert.equal(ambiguous1After!.status, "new", "ambiguous match 1 must not be mutated");
    assert.equal(ambiguous2After!.status, "pending_info", "ambiguous match 2 must not be mutated");

    // 9. Confirmed reservationId logs intent and does not cancel the Reservation.
    const reservationCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Reservation Customer", phoneNumber: "+33000000014", normalizedPhone: "33000000014" },
    });
    const confirmedReservation = await prisma.reservation.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: reservationCustomer.id,
        sourceChannel: "voice",
        reservationDate: new Date("2026-08-24T00:00:00.000Z"),
        reservationTime: "20:30",
        partySize: 2,
        status: "confirmed",
      },
    });
    const reservationRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: confirmedReservation.id, call_id: `${TEST_TAG}_call_reservation` }),
    });
    const reservationBody = await readJson(reservationRes);
    assert.equal(reservationBody.success, true);
    assert.equal(reservationBody.requires_review, true);
    assert.equal(reservationBody.match_status, "confirmed_reservation_review_required");
    assert.ok(!/cancelled/i.test(reservationBody.message ?? ""), "must not claim the confirmed Reservation was cancelled");
    const reservationAfter = await prisma.reservation.findUnique({ where: { id: confirmedReservation.id } });
    assert.equal(reservationAfter!.status, "confirmed", "confirmed Reservation must never be directly cancelled");

    // 10. Flat payload alias normalization (covered above via snake_case fields in steps 4-9).
    assert.equal(pendingBody.reservation_request_id, pendingRequest.id);

    // 11. camelCase/snake_case alias normalization.
    const camelCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Camel Customer", phoneNumber: "+33000000015", normalizedPhone: "33000000015" },
    });
    const camelRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: camelCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Camel Customer",
        phoneNumber: "+33000000015",
        normalizedPhone: "33000000015",
        partySize: 2,
        reservationDate: new Date("2026-08-25T00:00:00.000Z"),
        reservationTime: "17:00",
        status: "new",
      },
    });
    const camelRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationRequestId: camelRequest.id, callId: `${TEST_TAG}_call_camel` }),
    });
    const camelBody = await readJson(camelRes);
    assert.equal(camelBody.success, true);
    assert.equal(camelBody.reservation_request_cancelled, true);

    // 12. Nested Vapi tool-call payload -> results[] envelope, inner JSON has success:true.
    const nestedCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Nested Customer", phoneNumber: "+33000000016", normalizedPhone: "33000000016" },
    });
    const nestedRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: nestedCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Nested Customer",
        phoneNumber: "+33000000016",
        normalizedPhone: "33000000016",
        partySize: 2,
        reservationDate: new Date("2026-08-26T00:00:00.000Z"),
        reservationTime: "16:00",
        status: "new",
      },
    });
    const nestedRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          call: { id: `${TEST_TAG}_call_nested` },
          toolCalls: [
            {
              id: "tc-nested-1",
              function: { arguments: JSON.stringify({ reservation_request_id: nestedRequest.id }) },
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
    const nestedBody = JSON.parse(nestedEnvelope.results![0].result!) as VapiCancelReservationRequestBody;
    assert.equal(nestedBody.success, true);
    assert.equal(nestedBody.reservation_request_cancelled, true);
    assertNoSensitiveFields(nestedEnvelope, "nested tool-call cancel-reservation-request");

    // 13. JSON-string function arguments parsed (covered by step 12's JSON.stringify(...) argument shape).
    assert.equal(typeof nestedBody.reservation_request_id, "string");

    // 14. Long reason bounded/truncated.
    const longReasonCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Long Reason Customer", phoneNumber: "+33000000017", normalizedPhone: "33000000017" },
    });
    void longReasonCustomer;
    const longReason = "z".repeat(3000);
    const longReasonRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: `${TEST_TAG}_call_long_reason`, reason: longReason }),
    });
    const longReasonBody = await readJson(longReasonRes);
    assert.equal(longReasonBody.success, true);
    const longReasonEvent = await prisma.integrationEvent.findUnique({ where: { id: longReasonBody.event_id! } });
    const longReasonPayload = longReasonEvent!.payload as { reason?: string };
    assert.ok((longReasonPayload.reason?.length ?? 0) <= 2000, "stored reason must be bounded to <= 2000 characters");
    assert.ok((longReasonPayload.reason?.length ?? 0) < longReason.length, "stored reason must be truncated from input");

    // 15. IntegrationEvent payload contains safe expected metadata.
    assert.equal(longReasonEvent!.restaurantId, restaurantA.id);
    assert.equal(longReasonEvent!.eventType, "reservation_cancellation_requested");
    assert.equal(longReasonEvent!.channel, "voice");
    assert.equal(longReasonEvent!.provider, "vapi");
    assertNoSensitiveFields(longReasonEvent!.payload, "IntegrationEvent.payload");

    // 16. No Customer created by the route itself (test fixtures create their own Customers above;
    // verify the route's own calls without phone/customerName data don't add extras).
    const customerCountBefore = await prisma.customer.count({ where: { restaurantId: restaurantA.id } });
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: `${TEST_TAG}_call_no_customer` }),
    });
    const customerCountAfter = await prisma.customer.count({ where: { restaurantId: restaurantA.id } });
    assert.equal(customerCountAfter, customerCountBefore, "cancel-reservation-request must never create a Customer");

    // 17. No Reservation created/deleted by this route.
    const reservationCountBefore = await prisma.reservation.count({ where: { restaurantId: restaurantA.id } });
    assert.equal(reservationCountBefore, 1, "only the test fixture's Reservation should exist");

    // 18. No confirmed Reservation modified/cancelled (re-verified).
    const reservationFinal = await prisma.reservation.findUnique({ where: { id: confirmedReservation.id } });
    assert.equal(reservationFinal!.status, "confirmed");

    // 19. No hard-delete — all created ReservationRequest/Reservation rows still exist.
    const allRequestIds = [
      pendingRequest.id,
      confirmedRequest.id,
      matchRequest.id,
      ambiguousRequest1.id,
      ambiguousRequest2.id,
      camelRequest.id,
      nestedRequest.id,
    ];
    const survivingCount = await prisma.reservationRequest.count({ where: { id: { in: allRequestIds } } });
    assert.equal(survivingCount, allRequestIds.length, "no ReservationRequest must ever be hard-deleted");

    // 20. Cross-tenant isolation — a reservationRequestId belonging to restaurant B cannot be
    // cancelled through restaurant A's webhook key.
    const crossTenantRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantB.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Cross Tenant Customer",
        phoneNumber: "+33000000018",
        normalizedPhone: "33000000018",
        partySize: 2,
        reservationDate: new Date("2026-08-27T00:00:00.000Z"),
        reservationTime: "18:30",
        status: "new",
      },
    });
    const crossTenantRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_request_id: crossTenantRequest.id, call_id: `${TEST_TAG}_call_cross_tenant` }),
    });
    const crossTenantBody = await readJson(crossTenantRes);
    assert.equal(crossTenantBody.success, true);
    assert.equal(crossTenantBody.match_status, "unmatched", "cross-tenant id must be treated as not found");
    assert.ok(!crossTenantBody.reservation_request_cancelled);
    const crossTenantAfter = await prisma.reservationRequest.findUnique({ where: { id: crossTenantRequest.id } });
    assert.equal(crossTenantAfter!.status, "new", "cross-tenant ReservationRequest must never be mutated");

    // 21. ToolLog success/failure status works.
    const successToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurantA.id, toolName: "cancel_reservation_request", status: "success" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(successToolLog, "a success ToolLog row must exist for cancel_reservation_request");
    assertNoSensitiveFields(successToolLog!.responsePayload, "ToolLog.responsePayload");

    const failureToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurantA.id, toolName: "cancel_reservation_request", status: "failure" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(failureToolLog, "a failure ToolLog row must exist for the empty-payload call");

    // 22. Final sensitive/internal field response check.
    assertNoSensitiveFields(pendingBody, "final pending cancel sensitive-field check");
    assertNoSensitiveFields(confirmedBody, "final confirmed-request review sensitive-field check");
    assertNoSensitiveFields(reservationBody, "final confirmed-reservation review sensitive-field check");

    console.log("vapiCancelReservationRequest.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.integrationEvent.deleteMany({ where: { restaurantId: { in: [restaurantA.id, restaurantB.id] } } });
    await prisma.toolLog.deleteMany({ where: { restaurantId: { in: [restaurantA.id, restaurantB.id] } } });
    await prisma.reservation.deleteMany({ where: { restaurantId: { in: [restaurantA.id, restaurantB.id] } } });
    await prisma.reservationRequest.deleteMany({ where: { restaurantId: { in: [restaurantA.id, restaurantB.id] } } });
    await prisma.customer.deleteMany({ where: { restaurantId: { in: [restaurantA.id, restaurantB.id] } } });
    await prisma.integrationConnection.deleteMany({ where: { id: { in: [connectionA.id, inactiveConnection.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurantA.id, restaurantB.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationA.id, organizationB.id] } } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("vapiCancelReservationRequest.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
