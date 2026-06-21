/**
 * customers.integration.test.ts — end-to-end checks for the Phase 6 customer
 * list/detail/update API against a real Postgres database.
 *
 * Like reservationRequests.integration.test.ts, this needs a live DATABASE_URL
 * and is NOT wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/customers.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 *
 * Scenarios covered:
 *  - Missing/invalid bearer token is rejected with 401.
 *  - OWNER can list customers for their own restaurant with reservation/conversation counts.
 *  - Search by name, phone, and email.
 *  - Pagination (page/pageSize) behaves as expected.
 *  - STAFF can read customer detail, including recent reservation requests and conversations.
 *  - Cross-tenant list/detail access fails (403/404) without leaking data.
 *  - PATCH updates allowed fields and recomputes normalizedPhone from phoneNumber.
 *  - PATCH rejects unknown/forbidden fields (e.g. restaurantId, normalizedPhone) with 400.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { signAuthToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";

const TEST_TAG = `custtest_${Date.now()}`;

interface ApiError {
  error?: { message?: string };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("customers.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("customers.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
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

  const ada = await prisma.customer.create({
    data: {
      restaurantId: restaurant.id,
      fullName: "Ada Lovelace",
      phoneNumber: "+33612345678",
      normalizedPhone: "33612345678",
      email: "ada@example.com",
    },
  });
  const bob = await prisma.customer.create({
    data: { restaurantId: restaurant.id, fullName: "Bob Builder", phoneNumber: "+33611112222", normalizedPhone: "33611112222" },
  });
  const otherCustomer = await prisma.customer.create({
    data: { restaurantId: otherRestaurant.id, fullName: "Other Tenant", normalizedPhone: "490000000" },
  });

  const conversation = await prisma.conversation.create({
    data: {
      restaurantId: restaurant.id,
      customerId: ada.id,
      channel: "voice",
      provider: "vapi",
      externalThreadId: `${TEST_TAG}_call`,
      status: "open",
      lastMessageAt: new Date("2027-01-01T10:00:00.000Z"),
      lastMessagePreview: "Reservation request: 4 guests",
    },
  });
  await prisma.reservationRequest.create({
    data: { restaurantId: restaurant.id, customerId: ada.id, conversationId: conversation.id, channel: "voice", customerName: "Ada Lovelace", partySize: 4, status: "new" },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/restaurants`;

  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  try {
    // 1. Missing token -> 401.
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/customers`);
    assert.equal(noAuthRes.status, 401, "missing bearer token must be rejected with 401");

    // 2. Invalid token -> 401.
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/customers`, { headers: authed("not-a-real-token") });
    assert.equal(badAuthRes.status, 401, "invalid bearer token must be rejected with 401");

    // 3. OWNER can list customers for their own restaurant, with counts.
    const listRes = await fetch(`${baseUrl}/${restaurant.id}/customers`, { headers: authed(ownerToken) });
    assert.equal(listRes.status, 200);
    const listBody = (await listRes.json()) as {
      data: Array<{ id: string; reservationRequestCount: number; conversationCount: number; lastContactAt: string | null }>;
      pagination: { total: number };
    };
    assert.equal(listBody.pagination.total, 2, "list must only include this restaurant's customers");
    assert.ok(!listBody.data.some((c) => c.id === otherCustomer.id), "must never include another tenant's customer");
    const adaRow = listBody.data.find((c) => c.id === ada.id);
    assert.equal(adaRow?.reservationRequestCount, 1);
    assert.equal(adaRow?.conversationCount, 1);
    assert.ok(adaRow?.lastContactAt, "lastContactAt should be derived from the conversation's lastMessageAt");

    // 4. Search by name.
    const nameSearchRes = await fetch(`${baseUrl}/${restaurant.id}/customers?search=Ada`, { headers: authed(ownerToken) });
    const nameSearchBody = (await nameSearchRes.json()) as { data: Array<{ id: string }> };
    assert.equal(nameSearchBody.data.length, 1);
    assert.equal(nameSearchBody.data[0].id, ada.id);

    // 5. Search by email.
    const emailSearchRes = await fetch(`${baseUrl}/${restaurant.id}/customers?search=ada%40example.com`, {
      headers: authed(ownerToken),
    });
    const emailSearchBody = (await emailSearchRes.json()) as { data: Array<{ id: string }> };
    assert.equal(emailSearchBody.data.length, 1);
    assert.equal(emailSearchBody.data[0].id, ada.id);

    // 6. Search by phone.
    const phoneSearchRes = await fetch(`${baseUrl}/${restaurant.id}/customers?search=33611112222`, {
      headers: authed(ownerToken),
    });
    const phoneSearchBody = (await phoneSearchRes.json()) as { data: Array<{ id: string }> };
    assert.equal(phoneSearchBody.data.length, 1);
    assert.equal(phoneSearchBody.data[0].id, bob.id);

    // 7. Pagination: pageSize=1 returns exactly one row and correct totalPages.
    const pageRes = await fetch(`${baseUrl}/${restaurant.id}/customers?page=1&pageSize=1`, { headers: authed(ownerToken) });
    const pageBody = (await pageRes.json()) as { data: unknown[]; pagination: { totalPages: number } };
    assert.equal(pageBody.data.length, 1);
    assert.equal(pageBody.pagination.totalPages, 2);

    // 8. STAFF can access detail, with recent reservation requests and conversations.
    const detailRes = await fetch(`${baseUrl}/${restaurant.id}/customers/${ada.id}`, { headers: authed(staffToken) });
    assert.equal(detailRes.status, 200);
    const detailBody = (await detailRes.json()) as {
      reservationRequests: unknown[];
      conversations: Array<{ id: string }>;
    };
    assert.equal(detailBody.reservationRequests.length, 1);
    assert.equal(detailBody.conversations.length, 1);
    assert.equal(detailBody.conversations[0].id, conversation.id);

    // 9. PATCH updates allowed fields and recomputes normalizedPhone.
    const patchRes = await fetch(`${baseUrl}/${restaurant.id}/customers/${bob.id}`, {
      method: "PATCH",
      headers: { ...authed(staffToken), "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: "+33699999999", notes: "Prefers window seat" }),
    });
    assert.equal(patchRes.status, 200);
    const patched = await prisma.customer.findUnique({ where: { id: bob.id } });
    assert.equal(patched?.phoneNumber, "+33699999999");
    assert.equal(patched?.normalizedPhone, "33699999999", "normalizedPhone must be recomputed from phoneNumber, not accepted directly");
    assert.equal(patched?.notes, "Prefers window seat");

    // 10. PATCH cannot set restaurantId or normalizedPhone directly -> 400.
    const forbiddenPatchRes = await fetch(`${baseUrl}/${restaurant.id}/customers/${bob.id}`, {
      method: "PATCH",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ normalizedPhone: "00000000" }),
    });
    assert.equal(forbiddenPatchRes.status, 400, "unknown/forbidden fields must be rejected, never silently applied");
    const forbiddenPatchBody = (await forbiddenPatchRes.json()) as ApiError;
    assert.ok(forbiddenPatchBody.error);

    // 11. Cross-tenant list: STAFF assigned only to `restaurant` must not reach otherRestaurant's data.
    const crossTenantRes = await fetch(`${baseUrl}/${otherRestaurant.id}/customers`, { headers: authed(staffToken) });
    assert.equal(crossTenantRes.status, 403, "a user with no access to otherRestaurant must get 403, not a data leak");

    // 12. Cross-tenant detail: another tenant's customer id under this restaurant's scope must 404.
    const crossTenantDetailRes = await fetch(`${baseUrl}/${restaurant.id}/customers/${otherCustomer.id}`, {
      headers: authed(ownerToken),
    });
    assert.equal(crossTenantDetailRes.status, 404, "a customer id belonging to another restaurant must 404 under this restaurant's scope");

    console.log("customers.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.reservationRequest.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.conversation.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.customer.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, staff.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("customers.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
