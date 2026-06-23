/**
 * vapiCreateReservationRequest.integration.test.ts — Phase 28 hardening
 * checks for POST /api/webhooks/vapi/:publicWebhookKey/create-reservation-request
 * against a real Postgres database, on top of the base coverage already in
 * vapiWebhook.integration.test.ts (valid payload, missing fields, unknown
 * key, customer upsert, cross-tenant isolation).
 *
 * This file adds the scenarios specific to Phase 28: payload-shape
 * normalization beyond flat snake_case, invalid (not just missing) field
 * handling, idempotency/duplicate-retry behavior, inactive-connection
 * rejection, and a response-shape sensitive-field grep.
 *
 * Needs a live DATABASE_URL, so it is NOT wired into `npm test` — run via:
 *
 *   npx tsx src/tests/vapiCreateReservationRequest.integration.test.ts
 *
 * If DATABASE_URL is unset or the database is unreachable, this script logs
 * a skip notice and exits 0 rather than failing the run.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";

const TEST_TAG = `vapicrr_${Date.now()}`;

/**
 * Phase 28's availability hard-block check rejects dates past the
 * restaurant's bookingWindowDays (defaults to 30 — see
 * restaurantAvailabilityService.ts DEFAULT_SETTINGS). A fixed far-future
 * date like "2027-06-01" is comfortably "in the future" but can fall
 * outside that 30-day window depending on when this test runs, so scenarios
 * that must reach a successful create use a date relative to today instead.
 */
function nearFutureDate(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

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
];

function assertNoSensitiveFields(body: unknown, label: string) {
  const json = JSON.stringify(body);
  for (const pattern of SENSITIVE_FIELD_PATTERNS) {
    assert.ok(!json.includes(pattern), `${label} response must not contain "${pattern}": ${json}`);
  }
}

interface VapiToolHttpBody {
  status?: string;
  text?: string;
  success?: boolean;
  missing_fields?: string[];
  blocked_reason?: string;
  reservation_request_id?: string;
  customer_id?: string;
  error?: string;
  results?: Array<{ toolCallId: string; result?: string; error?: string }>;
}

async function readVapiJson(res: Response): Promise<VapiToolHttpBody> {
  return (await res.json()) as VapiToolHttpBody;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("vapiCreateReservationRequest.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log(
      "vapiCreateReservationRequest.integration.test.ts: SKIPPED (database unreachable):",
      (err as Error).message
    );
    return;
  }

  const organization = await prisma.organization.create({
    data: { name: `${TEST_TAG}_org`, status: "active" },
  });
  const restaurant = await prisma.restaurant.create({
    data: { organizationId: organization.id, name: `${TEST_TAG}_restaurant`, slug: `${TEST_TAG}-restaurant` },
  });
  const connection = await prisma.integrationConnection.create({
    data: {
      restaurantId: restaurant.id,
      channel: "vapi",
      provider: "vapi",
      status: "active",
      publicWebhookKey: `${TEST_TAG}_key`,
    },
  });
  const inactiveConnection = await prisma.integrationConnection.create({
    data: {
      restaurantId: restaurant.id,
      channel: "vapi",
      provider: "vapi",
      status: "inactive",
      publicWebhookKey: `${TEST_TAG}_key_inactive`,
    },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/webhooks/vapi`;
  const url = `${baseUrl}/${connection.publicWebhookKey}/create-reservation-request`;

  try {
    // 1. camelCase payload creates a ReservationRequest.
    const camelCallId = `${TEST_TAG}_call_camel`;
    const camelRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_id: camelCallId,
        fullName: "Grace Hopper",
        phoneNumber: "+1 212 555 0100",
        reservationDate: nearFutureDate(5),
        reservationTime: "19:00",
        numberOfGuests: 2,
        specialRequests: "highchair needed",
      }),
    });
    const camelBody = await readVapiJson(camelRes);
    assert.equal(camelRes.status, 200);
    assert.equal(camelBody.success, true, `camelCase create must succeed: ${JSON.stringify(camelBody)}`);
    assertNoSensitiveFields(camelBody, "camelCase create");

    const camelRequest = await prisma.reservationRequest.findFirst({
      where: { restaurantId: restaurant.id, sourceExternalId: camelCallId },
    });
    assert.ok(camelRequest, "camelCase payload must create a ReservationRequest");
    assert.equal(camelRequest!.partySize, 2);
    assert.equal(camelRequest!.specialRequest, "highchair needed");

    // 2. Nested Vapi tool-call envelope with JSON-string arguments.
    const nestedCallId = `${TEST_TAG}_call_nested`;
    const nestedRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          call: { id: nestedCallId },
          toolCalls: [
            {
              id: "tc-nested-1",
              function: {
                arguments: JSON.stringify({
                  customer_name: "Margaret Hamilton",
                  phone_number: "+1 650 555 0100",
                  reservation_date: nearFutureDate(6),
                  reservation_time: "12:00",
                  party_size: 5,
                }),
              },
            },
          ],
        },
      }),
    });
    const nestedBody = await readVapiJson(nestedRes);
    assert.equal(nestedRes.status, 200);
    assert.equal(nestedBody.success, true, `nested tool-call create must succeed: ${JSON.stringify(nestedBody)}`);
    assertNoSensitiveFields(nestedBody, "nested tool-call create");

    const nestedRequest = await prisma.reservationRequest.findFirst({
      where: { restaurantId: restaurant.id, sourceExternalId: nestedCallId },
    });
    assert.ok(nestedRequest, "nested tool-call payload must create a ReservationRequest");
    assert.equal(nestedRequest!.partySize, 5);

    // 3. Invalid date format -> missing_fields, no row created, no 500.
    const invalidDateCallId = `${TEST_TAG}_call_invalid_date`;
    const invalidDateRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_id: invalidDateCallId,
        customer_name: "Bad Date",
        phone_number: "+1 555 1111",
        reservation_date: "not-a-date",
        reservation_time: "20:00",
        party_size: 2,
      }),
    });
    const invalidDateBody = await readVapiJson(invalidDateRes);
    assert.equal(invalidDateRes.status, 200, "invalid date must never surface as a 500");
    assert.equal(invalidDateBody.success, false);
    assert.ok(invalidDateBody.missing_fields?.includes("reservation_date"));
    assert.equal(
      await prisma.reservationRequest.findFirst({
        where: { restaurantId: restaurant.id, sourceExternalId: invalidDateCallId },
      }),
      null,
      "invalid date must not create a ReservationRequest"
    );

    // 4. Invalid time format -> missing_fields.
    const invalidTimeCallId = `${TEST_TAG}_call_invalid_time`;
    const invalidTimeRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_id: invalidTimeCallId,
        customer_name: "Bad Time",
        phone_number: "+1 555 1112",
        reservation_date: "2027-09-01",
        reservation_time: "25:99",
        party_size: 2,
      }),
    });
    const invalidTimeBody = await readVapiJson(invalidTimeRes);
    assert.equal(invalidTimeRes.status, 200);
    assert.equal(invalidTimeBody.success, false);
    assert.ok(invalidTimeBody.missing_fields?.includes("reservation_time"));

    // 5. Invalid party size -> missing_fields.
    const invalidPartyCallId = `${TEST_TAG}_call_invalid_party`;
    const invalidPartyRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_id: invalidPartyCallId,
        customer_name: "Bad Party",
        phone_number: "+1 555 1113",
        reservation_date: "2027-09-01",
        reservation_time: "20:00",
        party_size: "a lot",
      }),
    });
    const invalidPartyBody = await readVapiJson(invalidPartyRes);
    assert.equal(invalidPartyRes.status, 200);
    assert.equal(invalidPartyBody.success, false);
    assert.ok(invalidPartyBody.missing_fields?.includes("party_size"));

    // 6. Idempotency — retrying the same call_id must not create a duplicate
    // ReservationRequest, and must echo the same reservation_request_id.
    const idemCallId = `${TEST_TAG}_call_idem`;
    const idemPayload = {
      call_id: idemCallId,
      customer_name: "Idem Potent",
      phone_number: "+1 555 2222",
      reservation_date: nearFutureDate(7),
      reservation_time: "20:00",
      party_size: 2,
    };
    const firstRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(idemPayload),
    });
    const firstBody = await readVapiJson(firstRes);
    assert.equal(firstRes.status, 200);
    assert.ok(firstBody.reservation_request_id, "first create must return reservation_request_id");

    const secondRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(idemPayload),
    });
    const secondBody = await readVapiJson(secondRes);
    assert.equal(secondRes.status, 200);
    assert.equal(
      secondBody.reservation_request_id,
      firstBody.reservation_request_id,
      "retry with the same call_id must return the same reservation_request_id"
    );

    const idemRequests = await prisma.reservationRequest.findMany({
      where: { restaurantId: restaurant.id, sourceExternalId: idemCallId },
    });
    assert.equal(idemRequests.length, 1, "retry with the same call_id must not create a duplicate ReservationRequest");

    // 7. Inactive connection -> 401, same as unknown key.
    const inactiveRes = await fetch(`${baseUrl}/${inactiveConnection.publicWebhookKey}/create-reservation-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...idemPayload, call_id: `${TEST_TAG}_call_inactive` }),
    });
    assert.equal(inactiveRes.status, 401, "an inactive IntegrationConnection must be rejected like an unknown key");
    assert.equal(
      await prisma.reservationRequest.findFirst({
        where: { sourceExternalId: `${TEST_TAG}_call_inactive` },
      }),
      null,
      "inactive connection must never create a ReservationRequest"
    );

    // 8. No confirmed Reservation is ever created by this endpoint.
    const anyReservation = await prisma.reservation.findFirst({ where: { restaurantId: restaurant.id } });
    assert.equal(anyReservation, null, "create-reservation-request must never create a confirmed Reservation");

    // 9. ToolLog rows exist and are marked success for the valid calls above.
    const camelToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurant.id, externalCallId: camelCallId },
    });
    assert.ok(camelToolLog);
    assert.equal(camelToolLog!.status, "success");
    assertNoSensitiveFields(camelToolLog!.responsePayload, "camelCase ToolLog.responsePayload");

    console.log("vapiCreateReservationRequest.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.message.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.conversation.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.reservationRequest.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.toolLog.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.customer.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.integrationConnection.deleteMany({ where: { id: { in: [connection.id, inactiveConnection.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: restaurant.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("vapiCreateReservationRequest.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
