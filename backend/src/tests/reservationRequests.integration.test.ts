/**
 * reservationRequests.integration.test.ts — end-to-end checks for the Phase 5
 * reservation-request management API against a real Postgres database.
 *
 * Like vapiWebhook.integration.test.ts, this needs a live DATABASE_URL and is
 * NOT wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/reservationRequests.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 *
 * Scenarios covered:
 *  - OWNER can list and filter reservation requests for their own restaurant.
 *  - STAFF can list/detail/update reservation requests for their assigned restaurant.
 *  - Detail endpoint returns customer/conversation/message summaries.
 *  - PATCH updates status/internalNote/partySize and rejects invalid status transitions.
 *  - confirm/reject endpoints move status and respect terminal-state guards.
 *  - Cross-tenant access (another restaurant's id) is rejected with 403, no data leak.
 *  - Missing/invalid bearer token is rejected with 401.
 *  - Pagination (page/pageSize) behaves as expected.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { hashPassword } from "../utils/password";
import { signAuthToken } from "../utils/jwt";

const TEST_TAG = `rrtest_${Date.now()}`;

interface ApiError {
  error?: { message?: string };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("reservationRequests.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("reservationRequests.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
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
  await prisma.message.create({
    data: {
      restaurantId: restaurant.id,
      conversationId: conversation.id,
      customerId: customer.id,
      direction: "inbound",
      channel: "voice",
      senderType: "customer",
      messageText: "Table for 4 please",
      status: "received",
    },
  });

  const request1 = await prisma.reservationRequest.create({
    data: {
      restaurantId: restaurant.id,
      customerId: customer.id,
      conversationId: conversation.id,
      channel: "voice",
      provider: "vapi",
      sourceExternalId: `${TEST_TAG}_call`,
      customerName: "Ada Lovelace",
      phoneNumber: "+33612345678",
      normalizedPhone: "33612345678",
      partySize: 4,
      reservationDate: new Date("2027-06-01T00:00:00.000Z"),
      reservationTime: "20:00",
      status: "new",
      rawPayload: { vapi: { toolCallId: `${TEST_TAG}_toolcall`, secret: "internal-debug-token" } },
    },
  });
  const request2 = await prisma.reservationRequest.create({
    data: {
      restaurantId: restaurant.id,
      channel: "website",
      customerName: "Bob Builder",
      phoneNumber: "+33611112222",
      partySize: 2,
      reservationDate: new Date("2027-06-05T00:00:00.000Z"),
      reservationTime: "19:00",
      status: "confirmed",
    },
  });
  const otherRequest = await prisma.reservationRequest.create({
    data: { restaurantId: otherRestaurant.id, channel: "voice", customerName: "Other Tenant", partySize: 1, status: "new" },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/restaurants`;

  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  try {
    // 1. Missing token -> 401.
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests`);
    assert.equal(noAuthRes.status, 401, "missing bearer token must be rejected with 401");

    // 2. Invalid token -> 401.
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests`, {
      headers: authed("not-a-real-token"),
    });
    assert.equal(badAuthRes.status, 401, "invalid bearer token must be rejected with 401");

    // 3. OWNER can list for their own restaurant.
    const listRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests`, { headers: authed(ownerToken) });
    assert.equal(listRes.status, 200);
    const listBody = (await listRes.json()) as {
      data: Array<{ id: string; rawPayload?: unknown }>;
      pagination: { total: number };
    };
    assert.equal(listBody.pagination.total, 2, "list must only include this restaurant's requests");
    assert.ok(listBody.data.some((r) => r.id === request1.id));
    assert.ok(!listBody.data.some((r) => r.id === otherRequest.id), "must never include another tenant's request");
    assert.ok(
      listBody.data.every((r) => r.rawPayload === undefined),
      "list endpoint must never include rawPayload, even for OWNER"
    );

    // 4. Filter by status.
    const filteredRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests?status=confirmed`, {
      headers: authed(ownerToken),
    });
    const filteredBody = (await filteredRes.json()) as { data: Array<{ id: string }> };
    assert.equal(filteredBody.data.length, 1);
    assert.equal(filteredBody.data[0].id, request2.id);

    // 5. Search by customer name.
    const searchRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests?search=Ada`, {
      headers: authed(ownerToken),
    });
    const searchBody = (await searchRes.json()) as { data: Array<{ id: string }> };
    assert.equal(searchBody.data.length, 1);
    assert.equal(searchBody.data[0].id, request1.id);

    // 6. Pagination: pageSize=1 returns exactly one row and correct totalPages.
    const pageRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests?page=1&pageSize=1`, {
      headers: authed(ownerToken),
    });
    const pageBody = (await pageRes.json()) as { data: unknown[]; pagination: { totalPages: number } };
    assert.equal(pageBody.data.length, 1);
    assert.equal(pageBody.pagination.totalPages, 2);

    // 7. STAFF can access detail and see customer/conversation/message summaries.
    const detailRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests/${request1.id}`, {
      headers: authed(staffToken),
    });
    assert.equal(detailRes.status, 200);
    const detailBody = (await detailRes.json()) as {
      customer: { fullName: string } | null;
      conversation: { id: string } | null;
      messages: unknown[];
      rawPayload?: unknown;
    };
    assert.equal(detailBody.customer?.fullName, "Ada Lovelace");
    assert.equal(detailBody.conversation?.id, conversation.id);
    assert.equal(detailBody.messages.length, 1);
    assert.equal(detailBody.rawPayload, undefined, "rawPayload must not be returned by default");

    // 7b. rawPayload is withheld even for STAFF that explicitly asks for it.
    const staffRawRes = await fetch(
      `${baseUrl}/${restaurant.id}/reservation-requests/${request1.id}?includeRawPayload=true`,
      { headers: authed(staffToken) }
    );
    const staffRawBody = (await staffRawRes.json()) as { rawPayload?: unknown };
    assert.equal(staffRawBody.rawPayload, undefined, "STAFF must never receive rawPayload");

    // 7c. OWNER explicitly opting in via ?includeRawPayload=true does receive it.
    const ownerRawRes = await fetch(
      `${baseUrl}/${restaurant.id}/reservation-requests/${request1.id}?includeRawPayload=true`,
      { headers: authed(ownerToken) }
    );
    const ownerRawBody = (await ownerRawRes.json()) as { rawPayload?: unknown };
    assert.notEqual(ownerRawBody.rawPayload, undefined, "OWNER with includeRawPayload=true must receive rawPayload");

    // 8. PATCH updates allowed fields.
    const patchRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests/${request1.id}`, {
      method: "PATCH",
      headers: { ...authed(staffToken), "Content-Type": "application/json" },
      body: JSON.stringify({ internalNote: "Called back, confirmed verbally", partySize: 5 }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = (await patchRes.json()) as { rawPayload?: unknown };
    assert.equal(patchBody.rawPayload, undefined, "PATCH response must not include rawPayload");
    const patched = await prisma.reservationRequest.findUnique({ where: { id: request1.id } });
    assert.equal(patched?.internalNote, "Called back, confirmed verbally");
    assert.equal(patched?.partySize, 5);

    // 9. PATCH cannot change restaurantId/customerId/provider (not accepted at all -> 400).
    const forbiddenPatchRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests/${request1.id}`, {
      method: "PATCH",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: otherRestaurant.id }),
    });
    assert.equal(forbiddenPatchRes.status, 400, "unknown/forbidden fields must be rejected, never silently applied");

    // 10. Invalid status transition -> controlled 400.
    const invalidTransitionRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests/${request2.id}`, {
      method: "PATCH",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending_info" }), // confirmed -> pending_info is not allowed
    });
    assert.equal(invalidTransitionRes.status, 400);
    const invalidTransitionBody = (await invalidTransitionRes.json()) as ApiError;
    assert.ok(invalidTransitionBody.error?.message?.includes("Cannot transition"));

    // 11. confirm endpoint moves new -> confirmed.
    const confirmRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests/${request1.id}/confirm`, {
      method: "POST",
      headers: authed(ownerToken),
    });
    assert.equal(confirmRes.status, 200);
    const confirmBody = (await confirmRes.json()) as { rawPayload?: unknown };
    assert.equal(confirmBody.rawPayload, undefined, "confirm response must not include rawPayload");
    const confirmedRow = await prisma.reservationRequest.findUnique({ where: { id: request1.id } });
    assert.equal(confirmedRow?.status, "confirmed");

    // 12. reject happy-path needs a fresh fixture in a valid source status
    // ("new"/"pending_info"). request2 is "confirmed", and per
    // STATUS_TRANSITIONS confirmed only goes to {done, cancelled} — confirmed
    // reservations are cancelled, not "rejected" (rejection is a pre-confirmation
    // decision), so reusing request2 here was the bug: it could never reach 200.
    const rejectCandidate = await prisma.reservationRequest.create({
      data: { restaurantId: restaurant.id, channel: "website", customerName: "Carol Reject Me", partySize: 3, status: "pending_info" },
    });
    const rejectRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests/${rejectCandidate.id}/reject`, {
      method: "POST",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Fully booked" }),
    });
    assert.equal(rejectRes.status, 200);
    const rejectBody = (await rejectRes.json()) as { rawPayload?: unknown };
    assert.equal(rejectBody.rawPayload, undefined, "reject response must not include rawPayload");
    const rejectedRow = await prisma.reservationRequest.findUnique({ where: { id: rejectCandidate.id } });
    assert.equal(rejectedRow?.status, "rejected");
    assert.equal(rejectedRow?.internalNote, "Fully booked");

    // 13. reject again on that now-terminal ("rejected") request -> controlled 400.
    const rejectAgainRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests/${rejectCandidate.id}/reject`, {
      method: "POST",
      headers: authed(ownerToken),
    });
    assert.equal(rejectAgainRes.status, 400, "rejecting an already-rejected request must be a controlled 400");

    // 13b. Dedicated terminal-status fixture (separate from the reject-twice
    // case above): a request created directly as "cancelled" must also
    // reject the reject attempt with a controlled 400, never a 200.
    const cancelledFixture = await prisma.reservationRequest.create({
      data: { restaurantId: restaurant.id, channel: "website", customerName: "Dana Cancelled", partySize: 2, status: "cancelled" },
    });
    const rejectCancelledRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests/${cancelledFixture.id}/reject`, {
      method: "POST",
      headers: authed(ownerToken),
    });
    assert.equal(rejectCancelledRes.status, 400, "rejecting a cancelled (terminal) request must be a controlled 400");

    // 13c. request2 ("confirmed") legitimately cannot be rejected per business
    // rules; confirm that this still returns a controlled 400, not a 200.
    const rejectConfirmedRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests/${request2.id}/reject`, {
      method: "POST",
      headers: authed(ownerToken),
    });
    assert.equal(rejectConfirmedRes.status, 400, "a confirmed request cannot be rejected (only done/cancelled)");

    // 14. Cross-tenant access: STAFF assigned only to `restaurant` must not reach otherRestaurant's data.
    const crossTenantRes = await fetch(`${baseUrl}/${otherRestaurant.id}/reservation-requests`, {
      headers: authed(staffToken),
    });
    assert.equal(crossTenantRes.status, 403, "a user with no access to otherRestaurant must get 403, not a data leak");

    // 15. Cross-tenant detail: requesting otherRestaurant's own request id under `restaurant`'s id must 404, not leak.
    const crossTenantDetailRes = await fetch(`${baseUrl}/${restaurant.id}/reservation-requests/${otherRequest.id}`, {
      headers: authed(ownerToken),
    });
    assert.equal(crossTenantDetailRes.status, 404, "a request id belonging to another restaurant must 404 under this restaurant's scope");

    console.log("reservationRequests.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.message.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.conversation.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.reservationRequest.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.customer.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, staff.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("reservationRequests.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
