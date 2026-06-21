/**
 * vapiWebhook.integration.test.ts — end-to-end checks for
 * POST /api/webhooks/vapi/:publicWebhookKey/create-reservation-request
 * against a real Postgres database.
 *
 * This is the one Phase 4 test that needs a live DATABASE_URL (unlike the
 * pure-logic tests elsewhere in src/tests/), so it is NOT wired into
 * `npm test`. Run it explicitly wherever Postgres is reachable
 * (e.g. on the VPS, or locally against `docker compose up db`):
 *
 *   npx tsx src/tests/vapiWebhook.integration.test.ts
 *
 * If DATABASE_URL is unset or the database is unreachable, this script logs
 * a skip notice and exits 0 rather than failing the run.
 *
 * Scenarios covered:
 *  - valid payload creates Customer + Conversation + Message + ReservationRequest + ToolLog(success)
 *  - missing required fields returns the Vapi missing-fields shape, no rows created
 *  - unknown publicWebhookKey returns an error response, no rows created
 *  - a second call with the same phone number reuses the same Customer (upsert, not duplicate)
 *  - tenant scoping: a connection from a different restaurant never resolves into this restaurant's rows
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";

const TEST_TAG = `vapitest_${Date.now()}`;

interface VapiToolHttpBody {
  status?: string;
  text?: string;
  success?: boolean;
  missing_fields?: string[];
  error?: string;
  results?: Array<{ toolCallId: string; result?: string; error?: string }>;
}

async function readVapiJson(res: Response): Promise<VapiToolHttpBody> {
  return (await res.json()) as VapiToolHttpBody;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("vapiWebhook.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("vapiWebhook.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
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

  // Second tenant, used only for the cross-tenant isolation check below.
  const otherRestaurant = await prisma.restaurant.create({
    data: { organizationId: organization.id, name: `${TEST_TAG}_restaurant_2`, slug: `${TEST_TAG}-restaurant-2` },
  });
  const otherConnection = await prisma.integrationConnection.create({
    data: {
      restaurantId: otherRestaurant.id,
      channel: "vapi",
      provider: "vapi",
      status: "active",
      publicWebhookKey: `${TEST_TAG}_key_other`,
    },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/webhooks/vapi`;

  try {
    // 1. Valid payload -> success, all related rows created under this restaurant.
    const validPayload = {
      call_id: `${TEST_TAG}_call_1`,
      customer_name: "Ada Lovelace",
      phone_number: "+33 6 12 34 56 78",
      reservation_date: "2027-05-20",
      reservation_time: "20:30",
      party_size: 4,
      language: "en",
      special_request: "window seat",
    };

    const validRes = await fetch(`${baseUrl}/${connection.publicWebhookKey}/create-reservation-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });
    const validBody = await readVapiJson(validRes);
    assert.equal(validRes.status, 200, "valid payload should return 200");
    assert.ok(validBody.status === "received" || validBody.results, "expected a Vapi-compatible success body");

    const reservationRequest = await prisma.reservationRequest.findFirst({
      where: { restaurantId: restaurant.id, sourceExternalId: validPayload.call_id },
    });
    assert.ok(reservationRequest, "ReservationRequest must be created for the valid payload");
    assert.equal(reservationRequest!.channel, "voice");
    assert.equal(reservationRequest!.provider, "vapi");
    assert.equal(reservationRequest!.status, "new");
    assert.equal(reservationRequest!.partySize, 4);

    const customer = await prisma.customer.findFirst({
      where: { restaurantId: restaurant.id, normalizedPhone: "33612345678" },
    });
    assert.ok(customer, "Customer must be upserted under the resolved restaurant");
    assert.equal(customer!.totalReservations, 1);

    const conversation = await prisma.conversation.findFirst({
      where: { restaurantId: restaurant.id, externalThreadId: validPayload.call_id },
    });
    assert.ok(conversation, "Conversation must be created for the call");

    const message = await prisma.message.findFirst({
      where: { restaurantId: restaurant.id, conversationId: conversation!.id },
    });
    assert.ok(message, "an inbound Message must be logged against the conversation");

    const toolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurant.id, externalCallId: validPayload.call_id },
    });
    assert.ok(toolLog, "ToolLog must be created");
    assert.equal(toolLog!.status, "success");

    // 2. Missing required fields -> Vapi missing-fields shape, nothing created.
    const missingRes = await fetch(`${baseUrl}/${connection.publicWebhookKey}/create-reservation-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: `${TEST_TAG}_call_missing`, customer_name: "No Phone" }),
    });
    const missingBody = await readVapiJson(missingRes);
    assert.equal(missingRes.status, 200);
    assert.equal(missingBody.success, false);
    assert.ok(Array.isArray(missingBody.missing_fields) && missingBody.missing_fields.includes("phone_number"));

    const noReservationForMissing = await prisma.reservationRequest.findFirst({
      where: { restaurantId: restaurant.id, sourceExternalId: `${TEST_TAG}_call_missing` },
    });
    assert.equal(noReservationForMissing, null, "missing-fields requests must not create a ReservationRequest");

    // 3. Unknown publicWebhookKey -> error response, nothing created anywhere.
    const unknownKeyCallId = `${TEST_TAG}_call_unknown_key`;
    const unknownRes = await fetch(`${baseUrl}/${TEST_TAG}_does_not_exist/create-reservation-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, call_id: unknownKeyCallId }),
    });
    const unknownBody = await readVapiJson(unknownRes);
    assert.equal(unknownRes.status, 401, "unknown webhook key must return a controlled 401, never a 500");
    assert.equal(
      unknownBody.error,
      "Unknown or inactive webhook key",
      "unknown webhook key must return a Vapi-compatible error payload, not an internal-error shape"
    );

    const noToolLogForUnknownKey = await prisma.toolLog.findFirst({
      where: { externalCallId: unknownKeyCallId },
    });
    assert.equal(noToolLogForUnknownKey, null, "unknown webhook key must not create a ToolLog under any restaurant");

    const noReservationForUnknownKey = await prisma.reservationRequest.findFirst({
      where: { sourceExternalId: unknownKeyCallId },
    });
    assert.equal(noReservationForUnknownKey, null, "unknown webhook key must not create a ReservationRequest");

    // 4. Same phone again -> upsert reuses the Customer (no duplicate row).
    const secondCallPayload = { ...validPayload, call_id: `${TEST_TAG}_call_2` };
    const secondRes = await fetch(`${baseUrl}/${connection.publicWebhookKey}/create-reservation-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(secondCallPayload),
    });
    assert.equal(secondRes.status, 200);

    const customersForPhone = await prisma.customer.findMany({
      where: { restaurantId: restaurant.id, normalizedPhone: "33612345678" },
    });
    assert.equal(customersForPhone.length, 1, "duplicate phone must upsert, not duplicate, the Customer row");
    assert.equal(customersForPhone[0].totalReservations, 2, "totalReservations must increment on repeat calls");

    // 5. Tenant scoping — the other restaurant's connection must never resolve
    // into this restaurant's rows, even when given the same call_id.
    const otherRes = await fetch(`${baseUrl}/${otherConnection.publicWebhookKey}/create-reservation-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, call_id: `${TEST_TAG}_call_cross_tenant` }),
    });
    assert.equal(otherRes.status, 200);

    const crossTenantLeak = await prisma.reservationRequest.findFirst({
      where: { restaurantId: restaurant.id, sourceExternalId: `${TEST_TAG}_call_cross_tenant` },
    });
    assert.equal(crossTenantLeak, null, "other restaurant's call must not land under this restaurant");

    const otherRestaurantRequest = await prisma.reservationRequest.findFirst({
      where: { restaurantId: otherRestaurant.id, sourceExternalId: `${TEST_TAG}_call_cross_tenant` },
    });
    assert.ok(otherRestaurantRequest, "other restaurant's own ReservationRequest must still be created");

    console.log("vapiWebhook.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.message.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.conversation.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.reservationRequest.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.toolLog.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.customer.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.integrationConnection.deleteMany({ where: { id: { in: [connection.id, otherConnection.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("vapiWebhook.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
