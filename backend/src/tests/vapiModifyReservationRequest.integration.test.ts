/**
 * vapiModifyReservationRequest.integration.test.ts — Phase 35 DB-backed
 * checks for POST /api/webhooks/vapi/:publicWebhookKey/modify-reservation-request,
 * against a real Postgres database. Same convention as
 * vapiCancelReservationRequest.integration.test.ts: needs a live DATABASE_URL,
 * so it is NOT wired into `npm test` — run via:
 *
 *   npx tsx src/tests/vapiModifyReservationRequest.integration.test.ts
 *
 * If DATABASE_URL is unset or the database is unreachable, this script logs
 * a skip notice and exits 0 rather than failing the run.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";

const TEST_TAG = `vapimodify_${Date.now()}`;

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
// serialized JSON text, so a sensitive word inside a legitimate VALUE is not
// a false positive while a field actually named like a sensitive pattern is
// still caught at any nesting depth.
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

interface VapiModifyReservationRequestBody {
  success?: boolean;
  message?: string;
  modification_requested?: boolean;
  modification_logged?: boolean;
  change_request_created?: boolean;
  requires_review?: boolean;
  match_status?: string;
  event_id?: string;
  change_request_id?: string;
  reservation_request_id?: string;
  missing_fields?: string[];
  error?: string;
  results?: Array<{ toolCallId: string; result?: string; error?: string }>;
}

async function readJson(res: Response): Promise<VapiModifyReservationRequestBody> {
  return (await res.json()) as VapiModifyReservationRequestBody;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("vapiModifyReservationRequest.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log(
      "vapiModifyReservationRequest.integration.test.ts: SKIPPED (database unreachable):",
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
  const url = `${baseUrl}/${connectionA.publicWebhookKey}/modify-reservation-request`;

  const createdRequestIds: string[] = [];
  const createdReservationIds: string[] = [];

  try {
    // 1. Unknown publicWebhookKey is rejected.
    const unknownRes = await fetch(`${baseUrl}/${TEST_TAG}_no_such_key/modify-reservation-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: "x" }),
    });
    assert.equal(unknownRes.status, 401, "unknown publicWebhookKey must be rejected");

    // 2. Inactive IntegrationConnection is rejected.
    const inactiveRes = await fetch(`${baseUrl}/${inactiveConnection.publicWebhookKey}/modify-reservation-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: "x" }),
    });
    assert.equal(inactiveRes.status, 401, "inactive IntegrationConnection must be rejected like an unknown key");

    // 3. Completely empty payload -> success:false with missing_fields, never a 500.
    const emptyRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const emptyBody = await readJson(emptyRes);
    assert.equal(emptyRes.status, 200, "missing fields must never surface as a 500");
    assert.equal(emptyBody.success, false);
    assert.ok(emptyBody.missing_fields?.length);

    // 4. Identity present but no requested change -> success:false.
    const identityOnlyRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: `${TEST_TAG}_call_identity_only` }),
    });
    const identityOnlyBody = await readJson(identityOnlyRes);
    assert.equal(identityOnlyBody.success, false);
    assert.ok(identityOnlyBody.missing_fields?.length);

    // 5. Requested change present but no identity -> success:false.
    const changeOnlyRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Need to move the reservation." }),
    });
    const changeOnlyBody = await readJson(changeOnlyRes);
    assert.equal(changeOnlyBody.success, false);
    assert.ok(changeOnlyBody.missing_fields?.length);

    // 6. Explicit pending reservationRequestId logs modification intent and creates a
    // linked "change" ReservationRequest — the original is never overwritten.
    const pendingCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Pending Customer", phoneNumber: "+33000000020", normalizedPhone: "33000000020" },
    });
    const pendingRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: pendingCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Pending Customer",
        phoneNumber: "+33000000020",
        normalizedPhone: "33000000020",
        partySize: 2,
        reservationDate: new Date("2026-09-10T00:00:00.000Z"),
        reservationTime: "20:00",
        status: "new",
      },
    });
    createdRequestIds.push(pendingRequest.id);
    const pendingRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_request_id: pendingRequest.id,
        call_id: `${TEST_TAG}_call_pending`,
        new_date: "2026-09-12",
        new_time: "21:00",
        new_party_size: 3,
        reason: "Need a bigger table.",
      }),
    });
    const pendingBody = await readJson(pendingRes);
    assert.equal(pendingRes.status, 200);
    assert.equal(pendingBody.success, true, `pending modify must succeed: ${JSON.stringify(pendingBody)}`);
    assert.equal(pendingBody.change_request_created, true);
    assert.equal(pendingBody.requires_review, true);
    assert.equal(pendingBody.match_status, "exact");
    assert.equal(pendingBody.reservation_request_id, pendingRequest.id);
    assert.ok(pendingBody.change_request_id);
    assert.ok(!/\bchanged\b/i.test(pendingBody.message ?? ""), "must not claim the reservation was changed");
    assertNoSensitiveFields(pendingBody, "pending reservationRequestId modify");
    createdRequestIds.push(pendingBody.change_request_id!);

    const originalAfter = await prisma.reservationRequest.findUnique({ where: { id: pendingRequest.id } });
    assert.equal(originalAfter!.status, "new", "original pending request must not be mutated");
    assert.equal(originalAfter!.reservationTime, "20:00", "original pending request's time must be untouched");

    const changeRequest = await prisma.reservationRequest.findUnique({ where: { id: pendingBody.change_request_id! } });
    assert.ok(changeRequest, "a change ReservationRequest must exist");
    assert.equal(changeRequest!.requestType, "change");
    assert.equal(changeRequest!.status, "new", "change request must be pending/review-required, not confirmed");
    assert.equal(changeRequest!.reservationTime, "21:00");
    assert.equal(changeRequest!.partySize, 3);

    // 7. Explicit non-existing reservationRequestId logs IntegrationEvent, no mutation, no change request.
    const nonExistingRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_request_id: `${TEST_TAG}_nonexisting_request`,
        call_id: `${TEST_TAG}_call_nonexisting`,
        new_time: "19:00",
      }),
    });
    const nonExistingBody = await readJson(nonExistingRes);
    assert.equal(nonExistingBody.success, true);
    assert.equal(nonExistingBody.requires_review, true);
    assert.equal(nonExistingBody.modification_logged, true);
    assert.equal(nonExistingBody.match_status, "unmatched");
    assert.ok(nonExistingBody.event_id);
    assert.ok(!nonExistingBody.change_request_created);

    // 8. Confirmed/converted ReservationRequest logs review-required intent, no force mutation,
    // no change request created from this branch.
    const confirmedCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Confirmed Customer", phoneNumber: "+33000000021", normalizedPhone: "33000000021" },
    });
    const confirmedRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: confirmedCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Confirmed Customer",
        phoneNumber: "+33000000021",
        normalizedPhone: "33000000021",
        partySize: 3,
        reservationDate: new Date("2026-09-13T00:00:00.000Z"),
        reservationTime: "19:00",
        status: "confirmed",
      },
    });
    createdRequestIds.push(confirmedRequest.id);
    const confirmedRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_request_id: confirmedRequest.id,
        call_id: `${TEST_TAG}_call_confirmed`,
        new_time: "20:00",
      }),
    });
    const confirmedBody = await readJson(confirmedRes);
    assert.equal(confirmedBody.success, true);
    assert.equal(confirmedBody.requires_review, true);
    assert.equal(confirmedBody.match_status, "confirmed_reservation_review_required");
    assert.ok(!confirmedBody.change_request_created);
    assert.ok(!/\bchanged\b/i.test(confirmedBody.message ?? ""), "must not claim a confirmed request was changed");
    const stillConfirmedRequest = await prisma.reservationRequest.findUnique({ where: { id: confirmedRequest.id } });
    assert.equal(stillConfirmedRequest!.status, "confirmed", "confirmed request must not be force-mutated");
    assert.equal(stillConfirmedRequest!.reservationTime, "19:00");

    // 9. Explicit confirmed reservationId logs review-required intent, creates a change
    // ReservationRequest for human review, and never updates the Reservation directly.
    const reservationCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Reservation Customer", phoneNumber: "+33000000022", normalizedPhone: "33000000022" },
    });
    const confirmedReservation = await prisma.reservation.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: reservationCustomer.id,
        sourceChannel: "voice",
        reservationDate: new Date("2026-09-14T00:00:00.000Z"),
        reservationTime: "20:30",
        partySize: 2,
        status: "confirmed",
      },
    });
    createdReservationIds.push(confirmedReservation.id);
    const reservationRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_id: confirmedReservation.id,
        call_id: `${TEST_TAG}_call_reservation`,
        new_party_size: 5,
      }),
    });
    const reservationBody = await readJson(reservationRes);
    assert.equal(reservationBody.success, true);
    assert.equal(reservationBody.requires_review, true);
    assert.equal(reservationBody.match_status, "confirmed_reservation_review_required");
    assert.ok(!/\bchanged\b/i.test(reservationBody.message ?? ""), "must not claim the confirmed Reservation was changed");
    const reservationAfter = await prisma.reservation.findUnique({ where: { id: confirmedReservation.id } });
    assert.equal(reservationAfter!.partySize, 2, "confirmed Reservation must never be directly updated");
    assert.equal(reservationAfter!.status, "confirmed");
    if (reservationBody.change_request_id) createdRequestIds.push(reservationBody.change_request_id);

    // 10. Phone/date/time matching exactly one pending request creates/logs a change intent
    // but never mutates the original request.
    const matchCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Match Customer", phoneNumber: "+33000000023", normalizedPhone: "33000000023" },
    });
    const matchRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: matchCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Match Customer",
        phoneNumber: "+33000000023",
        normalizedPhone: "33000000023",
        partySize: 2,
        reservationDate: new Date("2026-09-15T00:00:00.000Z"),
        reservationTime: "21:00",
        status: "new",
      },
    });
    createdRequestIds.push(matchRequest.id);
    const matchRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "+33000000023",
        current_date: "2026-09-15",
        current_time: "21:00",
        new_time: "22:00",
        call_id: `${TEST_TAG}_call_match`,
      }),
    });
    const matchBody = await readJson(matchRes);
    assert.equal(matchBody.success, true);
    assert.equal(matchBody.match_status, "exact");
    assert.equal(matchBody.reservation_request_id, matchRequest.id);
    assert.ok(matchBody.change_request_id);
    createdRequestIds.push(matchBody.change_request_id!);
    const matchedRequestAfter = await prisma.reservationRequest.findUnique({ where: { id: matchRequest.id } });
    assert.equal(matchedRequestAfter!.status, "new", "matched original request must not be mutated");
    assert.equal(matchedRequestAfter!.reservationTime, "21:00");

    // 11. Ambiguous matches log intent and mutate nothing.
    const ambiguousCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Ambiguous Customer", phoneNumber: "+33000000024", normalizedPhone: "33000000024" },
    });
    const ambiguousRequest1 = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: ambiguousCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Ambiguous Customer",
        phoneNumber: "+33000000024",
        normalizedPhone: "33000000024",
        partySize: 2,
        reservationDate: new Date("2026-09-16T00:00:00.000Z"),
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
        phoneNumber: "+33000000024",
        normalizedPhone: "33000000024",
        partySize: 4,
        reservationDate: new Date("2026-09-16T00:00:00.000Z"),
        reservationTime: "18:00",
        status: "pending_info",
      },
    });
    createdRequestIds.push(ambiguousRequest1.id, ambiguousRequest2.id);
    const ambiguousRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "+33000000024",
        current_date: "2026-09-16",
        current_time: "18:00",
        new_time: "19:00",
        call_id: `${TEST_TAG}_call_ambiguous`,
      }),
    });
    const ambiguousBody = await readJson(ambiguousRes);
    assert.equal(ambiguousBody.success, true);
    assert.equal(ambiguousBody.match_status, "ambiguous");
    assert.ok(!ambiguousBody.change_request_created);
    const ambiguous1After = await prisma.reservationRequest.findUnique({ where: { id: ambiguousRequest1.id } });
    const ambiguous2After = await prisma.reservationRequest.findUnique({ where: { id: ambiguousRequest2.id } });
    assert.equal(ambiguous1After!.status, "new", "ambiguous match 1 must not be mutated");
    assert.equal(ambiguous2After!.status, "pending_info", "ambiguous match 2 must not be mutated");

    // 12. camelCase/snake_case alias normalization.
    const camelCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Camel Customer", phoneNumber: "+33000000025", normalizedPhone: "33000000025" },
    });
    const camelRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: camelCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Camel Customer",
        phoneNumber: "+33000000025",
        normalizedPhone: "33000000025",
        partySize: 2,
        reservationDate: new Date("2026-09-17T00:00:00.000Z"),
        reservationTime: "17:00",
        status: "new",
      },
    });
    createdRequestIds.push(camelRequest.id);
    const camelRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationRequestId: camelRequest.id, callId: `${TEST_TAG}_call_camel`, newTime: "18:30" }),
    });
    const camelBody = await readJson(camelRes);
    assert.equal(camelBody.success, true);
    assert.equal(camelBody.change_request_created, true);
    createdRequestIds.push(camelBody.change_request_id!);

    // 13. Nested Vapi tool-call payload -> results[] envelope, inner JSON has success:true.
    const nestedCustomer = await prisma.customer.create({
      data: { restaurantId: restaurantA.id, fullName: "Nested Customer", phoneNumber: "+33000000026", normalizedPhone: "33000000026" },
    });
    const nestedRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantA.id,
        customerId: nestedCustomer.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Nested Customer",
        phoneNumber: "+33000000026",
        normalizedPhone: "33000000026",
        partySize: 2,
        reservationDate: new Date("2026-09-18T00:00:00.000Z"),
        reservationTime: "16:00",
        status: "new",
      },
    });
    createdRequestIds.push(nestedRequest.id);
    const nestedRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          call: { id: `${TEST_TAG}_call_nested` },
          toolCalls: [
            {
              id: "tc-nested-1",
              function: { arguments: JSON.stringify({ reservation_request_id: nestedRequest.id, new_time: "17:00" }) },
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
    const nestedBody = JSON.parse(nestedEnvelope.results![0].result!) as VapiModifyReservationRequestBody;
    assert.equal(nestedBody.success, true);
    assert.equal(nestedBody.change_request_created, true);
    assertNoSensitiveFields(nestedEnvelope, "nested tool-call modify-reservation-request");
    if (nestedBody.change_request_id) createdRequestIds.push(nestedBody.change_request_id);

    // 14. JSON-string function arguments parsed (covered by step 13's JSON.stringify(...) argument shape).
    assert.equal(typeof nestedBody.reservation_request_id, "string");

    // 15. Long reason/newNotes bounded/truncated.
    const longReason = "z".repeat(3000);
    const longNotes = "y".repeat(3000);
    const longTextRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_id: `${TEST_TAG}_call_long_text`,
        reason: longReason,
        new_notes: longNotes,
      }),
    });
    const longTextBody = await readJson(longTextRes);
    assert.equal(longTextBody.success, true);
    const longTextEvent = await prisma.integrationEvent.findUnique({ where: { id: longTextBody.event_id! } });
    const longTextPayload = longTextEvent!.payload as { reason?: string; newNotes?: string };
    assert.ok((longTextPayload.reason?.length ?? 0) <= 2000, "stored reason must be bounded to <= 2000 characters");
    assert.ok((longTextPayload.newNotes?.length ?? 0) <= 2000, "stored newNotes must be bounded to <= 2000 characters");
    assert.ok((longTextPayload.reason?.length ?? 0) < longReason.length, "stored reason must be truncated from input");
    assert.ok((longTextPayload.newNotes?.length ?? 0) < longNotes.length, "stored newNotes must be truncated from input");

    // 16. IntegrationEvent payload contains safe expected metadata.
    assert.equal(longTextEvent!.restaurantId, restaurantA.id);
    assert.equal(longTextEvent!.eventType, "reservation_modification_requested");
    assert.equal(longTextEvent!.channel, "voice");
    assert.equal(longTextEvent!.provider, "vapi");
    assertNoSensitiveFields(longTextEvent!.payload, "IntegrationEvent.payload");

    // 17. Invalid date/time format -> safe success:false, HTTP 200.
    const invalidRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: `${TEST_TAG}_call_invalid`, current_date: "not-a-date", new_time: "20:00" }),
    });
    const invalidBody = await readJson(invalidRes);
    assert.equal(invalidRes.status, 200, "invalid date/time format must never surface as a 500");
    assert.equal(invalidBody.success, false);

    // 18. No Customer created by the route itself.
    const customerCountBefore = await prisma.customer.count({ where: { restaurantId: restaurantA.id } });
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: `${TEST_TAG}_call_no_customer`, reason: "Just checking." }),
    });
    const customerCountAfter = await prisma.customer.count({ where: { restaurantId: restaurantA.id } });
    assert.equal(customerCountAfter, customerCountBefore, "modify-reservation-request must never create a Customer");

    // 19. No Reservation created/deleted by this route.
    const reservationCountAfter = await prisma.reservation.count({ where: { restaurantId: restaurantA.id } });
    assert.equal(reservationCountAfter, 1, "only the test fixture's Reservation should exist");

    // 20. No confirmed Reservation modified (re-verified).
    const reservationFinal = await prisma.reservation.findUnique({ where: { id: confirmedReservation.id } });
    assert.equal(reservationFinal!.status, "confirmed");
    assert.equal(reservationFinal!.partySize, 2);

    // 21. No hard-delete — all created ReservationRequest rows still exist.
    const survivingCount = await prisma.reservationRequest.count({ where: { id: { in: createdRequestIds } } });
    assert.equal(survivingCount, createdRequestIds.length, "no ReservationRequest must ever be hard-deleted");

    // 22. Cross-tenant isolation — a reservationRequestId belonging to restaurant B cannot be
    // targeted through restaurant A's webhook key.
    const crossTenantRequest = await prisma.reservationRequest.create({
      data: {
        restaurantId: restaurantB.id,
        channel: "voice",
        provider: "vapi",
        customerName: "Cross Tenant Customer",
        phoneNumber: "+33000000027",
        normalizedPhone: "33000000027",
        partySize: 2,
        reservationDate: new Date("2026-09-19T00:00:00.000Z"),
        reservationTime: "18:30",
        status: "new",
      },
    });
    const crossTenantRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_request_id: crossTenantRequest.id,
        call_id: `${TEST_TAG}_call_cross_tenant`,
        new_time: "19:00",
      }),
    });
    const crossTenantBody = await readJson(crossTenantRes);
    assert.equal(crossTenantBody.success, true);
    assert.equal(crossTenantBody.match_status, "unmatched", "cross-tenant id must be treated as not found");
    assert.ok(!crossTenantBody.change_request_created);
    const crossTenantAfter = await prisma.reservationRequest.findUnique({ where: { id: crossTenantRequest.id } });
    assert.equal(crossTenantAfter!.status, "new", "cross-tenant ReservationRequest must never be mutated");
    await prisma.reservationRequest.delete({ where: { id: crossTenantRequest.id } });

    // 23. ToolLog success/failure status works.
    const successToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurantA.id, toolName: "modify_reservation_request", status: "success" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(successToolLog, "a success ToolLog row must exist for modify_reservation_request");
    assertNoSensitiveFields(successToolLog!.responsePayload, "ToolLog.responsePayload");

    const failureToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurantA.id, toolName: "modify_reservation_request", status: "failure" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(failureToolLog, "a failure ToolLog row must exist for the empty-payload call");

    // 24. Final sensitive/internal field response check.
    assertNoSensitiveFields(pendingBody, "final pending modify sensitive-field check");
    assertNoSensitiveFields(confirmedBody, "final confirmed-request review sensitive-field check");
    assertNoSensitiveFields(reservationBody, "final confirmed-reservation review sensitive-field check");

    console.log("vapiModifyReservationRequest.integration.test.ts: all checks passed");
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
  console.error("vapiModifyReservationRequest.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
