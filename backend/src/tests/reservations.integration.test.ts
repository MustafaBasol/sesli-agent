/**
 * reservations.integration.test.ts — end-to-end checks for the Phase 15
 * confirmed-Reservation API against a real Postgres database.
 *
 * Like reservationRequests.integration.test.ts, this needs a live
 * DATABASE_URL and is NOT wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/reservations.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 *
 * Scenarios covered:
 *  - Confirming a reservation request (with date/time/partySize) creates a
 *    linked Reservation row, atomically with the status transition.
 *  - Confirming a reservation request missing date/time/partySize is
 *    rejected with a controlled 400 (Reservation columns are non-nullable).
 *  - OWNER can list and filter (status/date/search/customerId) reservations.
 *  - Pagination behaves as expected.
 *  - Detail endpoint returns sanitized customer/table/reservationRequest/
 *    conversation summaries, with no rawPayload/stateJson/credentials/
 *    webhook-token fields anywhere in the response.
 *  - STAFF can read; only OWNER/MANAGER can PATCH.
 *  - PATCH rejects a table id that belongs to another restaurant.
 *  - Cross-tenant list (403) and detail (404) are blocked, no data leak.
 *  - Missing/invalid bearer token is rejected with 401.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { hashPassword } from "../utils/password";
import { signAuthToken } from "../utils/jwt";

const TEST_TAG = `restest_${Date.now()}`;

interface ApiError {
  error?: { message?: string };
}

const FORBIDDEN_SUBSTRINGS = [
  "rawPayload",
  "stateJson",
  "credentialsEncrypted",
  "webhookVerifyTokenHash",
  "publicWebhookKey",
];

function assertNoForbiddenFields(body: unknown, label: string) {
  const json = JSON.stringify(body);
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    assert.ok(!json.includes(needle), `${label} must not contain "${needle}"`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("reservations.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("reservations.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
    return;
  }

  const organization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org`, status: "active" } });
  const restaurant = await prisma.restaurant.create({
    data: { organizationId: organization.id, name: `${TEST_TAG}_restaurant`, slug: `${TEST_TAG}-restaurant` },
  });
  const otherRestaurant = await prisma.restaurant.create({
    data: { organizationId: organization.id, name: `${TEST_TAG}_restaurant_2`, slug: `${TEST_TAG}-restaurant-2` },
  });

  const passwordHash = await hashPassword("Test1234!");
  const owner = await prisma.user.create({
    data: { email: `${TEST_TAG}_owner@example.com`, passwordHash, status: "active" },
  });
  const staff = await prisma.user.create({
    data: { email: `${TEST_TAG}_staff@example.com`, passwordHash, status: "active" },
  });

  await prisma.restaurantUser.create({ data: { restaurantId: restaurant.id, userId: owner.id, role: "OWNER", status: "active" } });
  await prisma.restaurantUser.create({ data: { restaurantId: restaurant.id, userId: staff.id, role: "STAFF", status: "active" } });

  const ownerToken = signAuthToken({ sub: owner.id });
  const staffToken = signAuthToken({ sub: staff.id });

  const customer = await prisma.customer.create({
    data: { restaurantId: restaurant.id, fullName: "Ada Lovelace", phoneNumber: "+33612345678", normalizedPhone: "33612345678" },
  });
  const table = await prisma.restaurantTable.create({
    data: { restaurantId: restaurant.id, tableNumber: `${TEST_TAG}-T1`, capacity: 4 },
  });
  const otherTable = await prisma.restaurantTable.create({
    data: { restaurantId: otherRestaurant.id, tableNumber: `${TEST_TAG}-OT1`, capacity: 2 },
  });
  const conversation = await prisma.conversation.create({
    data: {
      restaurantId: restaurant.id,
      customerId: customer.id,
      channel: "voice",
      provider: "vapi",
      externalThreadId: `${TEST_TAG}_call`,
      status: "open",
      lastMessagePreview: "Reservation request: 4 guests",
    },
  });

  const confirmableRequest = await prisma.reservationRequest.create({
    data: {
      restaurantId: restaurant.id,
      customerId: customer.id,
      conversationId: conversation.id,
      channel: "voice",
      provider: "vapi",
      customerName: "Ada Lovelace",
      phoneNumber: "+33612345678",
      partySize: 4,
      reservationDate: new Date("2027-07-01T00:00:00.000Z"),
      reservationTime: "19:30",
      specialRequest: "Window seat please",
      status: "new",
      rawPayload: { vapi: { toolCallId: `${TEST_TAG}_toolcall`, secret: "internal-debug-token" } },
    },
  });

  const incompleteRequest = await prisma.reservationRequest.create({
    data: {
      restaurantId: restaurant.id,
      channel: "website",
      customerName: "No Date Guest",
      partySize: 2,
      status: "new",
      // reservationDate/reservationTime intentionally omitted.
    },
  });

  const manualReservation = await prisma.reservation.create({
    data: {
      restaurantId: restaurant.id,
      sourceChannel: "manual",
      reservationDate: new Date("2027-07-10T00:00:00.000Z"),
      reservationTime: "20:00",
      partySize: 2,
      status: "completed",
      assignedTableId: table.id,
    },
  });

  const otherReservation = await prisma.reservation.create({
    data: {
      restaurantId: otherRestaurant.id,
      sourceChannel: "manual",
      reservationDate: new Date("2027-07-10T00:00:00.000Z"),
      reservationTime: "20:00",
      partySize: 3,
      status: "confirmed",
    },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/restaurants`;

  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  try {
    // 1. Missing token -> 401.
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/reservations`);
    assert.equal(noAuthRes.status, 401, "missing bearer token must be rejected with 401");

    // 2. Invalid token -> 401.
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/reservations`, { headers: authed("not-a-real-token") });
    assert.equal(badAuthRes.status, 401, "invalid bearer token must be rejected with 401");

    // 3. Confirming a request missing date/time/partySize is a controlled 400, no Reservation created.
    const incompleteConfirmRes = await fetch(
      `${baseUrl}/${restaurant.id}/reservation-requests/${incompleteRequest.id}/confirm`,
      { method: "POST", headers: authed(ownerToken) }
    );
    assert.equal(incompleteConfirmRes.status, 400, "confirming a request without date/time/partySize must 400");
    const incompleteConfirmBody = (await incompleteConfirmRes.json()) as ApiError;
    assert.ok(incompleteConfirmBody.error?.message?.includes("missing date, time, or party size"));
    const incompleteCount = await prisma.reservation.count({ where: { reservationRequestId: incompleteRequest.id } });
    assert.equal(incompleteCount, 0, "no Reservation must be created for an incomplete request");

    // 4. Confirming a complete request creates a linked Reservation atomically.
    const confirmRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests/${confirmableRequest.id}/confirm`, {
      method: "POST",
      headers: authed(ownerToken),
    });
    assert.equal(confirmRes.status, 200);
    const confirmedRequestRow = await prisma.reservationRequest.findUnique({ where: { id: confirmableRequest.id } });
    assert.equal(confirmedRequestRow?.status, "confirmed");
    const createdReservation = await prisma.reservation.findFirst({
      where: { reservationRequestId: confirmableRequest.id },
    });
    assert.ok(createdReservation, "confirm must create a linked Reservation row");
    assert.equal(createdReservation?.customerId, customer.id);
    assert.equal(createdReservation?.partySize, 4);
    assert.equal(createdReservation?.status, "confirmed");

    // 5. OWNER lists reservations for their own restaurant — sees both, not the other tenant's.
    const listRes = await fetch(`${baseUrl}/${restaurant.id}/reservations`, { headers: authed(ownerToken) });
    assert.equal(listRes.status, 200);
    const listBody = (await listRes.json()) as { data: Array<{ id: string }>; pagination: { total: number } };
    assert.equal(listBody.pagination.total, 2, "list must only include this restaurant's reservations");
    assert.ok(listBody.data.some((r) => r.id === createdReservation!.id));
    assert.ok(listBody.data.some((r) => r.id === manualReservation.id));
    assert.ok(!listBody.data.some((r) => r.id === otherReservation.id), "must never include another tenant's reservation");
    assertNoForbiddenFields(listBody, "list response");

    // 6. Filter by status.
    const statusRes = await fetch(`${baseUrl}/${restaurant.id}/reservations?status=completed`, {
      headers: authed(ownerToken),
    });
    const statusBody = (await statusRes.json()) as { data: Array<{ id: string }> };
    assert.equal(statusBody.data.length, 1);
    assert.equal(statusBody.data[0].id, manualReservation.id);

    // 7. Filter by date range around the confirmed reservation only.
    const dateRes = await fetch(
      `${baseUrl}/${restaurant.id}/reservations?dateFrom=2027-07-01&dateTo=2027-07-01`,
      { headers: authed(ownerToken) }
    );
    const dateBody = (await dateRes.json()) as { data: Array<{ id: string }> };
    assert.equal(dateBody.data.length, 1);
    assert.equal(dateBody.data[0].id, createdReservation!.id);

    // 8. Search by customer name resolves through Customer, not a direct column.
    const searchRes = await fetch(`${baseUrl}/${restaurant.id}/reservations?search=Ada`, { headers: authed(ownerToken) });
    const searchBody = (await searchRes.json()) as { data: Array<{ id: string; customerName: string | null }> };
    assert.equal(searchBody.data.length, 1);
    assert.equal(searchBody.data[0].id, createdReservation!.id);
    assert.equal(searchBody.data[0].customerName, "Ada Lovelace");

    // 9. Filter by customerId.
    const customerIdRes = await fetch(`${baseUrl}/${restaurant.id}/reservations?customerId=${customer.id}`, {
      headers: authed(ownerToken),
    });
    const customerIdBody = (await customerIdRes.json()) as { data: Array<{ id: string }> };
    assert.equal(customerIdBody.data.length, 1);
    assert.equal(customerIdBody.data[0].id, createdReservation!.id);

    // 10. Pagination: pageSize=1 returns exactly one row and correct totalPages.
    const pageRes = await fetch(`${baseUrl}/${restaurant.id}/reservations?page=1&pageSize=1`, {
      headers: authed(ownerToken),
    });
    const pageBody = (await pageRes.json()) as { data: unknown[]; pagination: { totalPages: number } };
    assert.equal(pageBody.data.length, 1);
    assert.equal(pageBody.pagination.totalPages, 2);

    // 11. STAFF can read detail; sanitized customer/table/reservationRequest/conversation summaries included.
    const detailRes = await fetch(`${baseUrl}/${restaurant.id}/reservations/${createdReservation!.id}`, {
      headers: authed(staffToken),
    });
    assert.equal(detailRes.status, 200);
    const detailBody = (await detailRes.json()) as {
      customer: { fullName: string } | null;
      reservationRequest: { id: string; specialRequest: string | null } | null;
      conversation: { id: string } | null;
      table: unknown;
    };
    assert.equal(detailBody.customer?.fullName, "Ada Lovelace");
    assert.equal(detailBody.reservationRequest?.id, confirmableRequest.id);
    assert.equal(detailBody.reservationRequest?.specialRequest, "Window seat please");
    assert.equal(detailBody.conversation?.id, conversation.id);
    assertNoForbiddenFields(detailBody, "detail response");

    // 11b. Detail for the manual reservation includes a table summary.
    const manualDetailRes = await fetch(`${baseUrl}/${restaurant.id}/reservations/${manualReservation.id}`, {
      headers: authed(ownerToken),
    });
    const manualDetailBody = (await manualDetailRes.json()) as { table: { tableNumber: string } | null };
    assert.equal(manualDetailBody.table?.tableNumber, `${TEST_TAG}-T1`);

    // 12. STAFF cannot PATCH (read-only role) -> 403.
    const staffPatchRes = await fetch(`${baseUrl}/${restaurant.id}/reservations/${manualReservation.id}`, {
      method: "PATCH",
      headers: { ...authed(staffToken), "Content-Type": "application/json" },
      body: JSON.stringify({ internalNote: "Staff should not be able to do this" }),
    });
    assert.equal(staffPatchRes.status, 403, "STAFF must not be able to PATCH reservations");

    // 13. OWNER can PATCH allowed fields.
    const patchRes = await fetch(`${baseUrl}/${restaurant.id}/reservations/${manualReservation.id}`, {
      method: "PATCH",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ internalNote: "VIP, seat by window", status: "no_show" }),
    });
    assert.equal(patchRes.status, 200);
    const patched = await prisma.reservation.findUnique({ where: { id: manualReservation.id } });
    assert.equal(patched?.internalNote, "VIP, seat by window");
    assert.equal(patched?.status, "no_show");

    // 14. PATCH rejects a table id belonging to another restaurant.
    const crossTablePatchRes = await fetch(`${baseUrl}/${restaurant.id}/reservations/${manualReservation.id}`, {
      method: "PATCH",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ assignedTableId: otherTable.id }),
    });
    assert.equal(crossTablePatchRes.status, 400, "assigning a table from another restaurant must be rejected");

    // 15. Cross-tenant list: STAFF assigned only to `restaurant` must not reach otherRestaurant's data.
    const crossTenantRes = await fetch(`${baseUrl}/${otherRestaurant.id}/reservations`, { headers: authed(staffToken) });
    assert.equal(crossTenantRes.status, 403, "a user with no access to otherRestaurant must get 403, not a data leak");

    // 16. Cross-tenant detail: requesting otherRestaurant's reservation id under `restaurant`'s scope must 404.
    const crossTenantDetailRes = await fetch(`${baseUrl}/${restaurant.id}/reservations/${otherReservation.id}`, {
      headers: authed(ownerToken),
    });
    assert.equal(crossTenantDetailRes.status, 404, "a reservation id belonging to another restaurant must 404 under this restaurant's scope");

    console.log("reservations.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.reservation.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.reservationRequest.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.conversation.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.restaurantTable.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.customer.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, staff.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("reservations.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
