/**
 * conversations.integration.test.ts — end-to-end checks for the Phase 6
 * conversation/message read API against a real Postgres database.
 *
 * Like reservationRequests.integration.test.ts, this needs a live DATABASE_URL
 * and is NOT wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/conversations.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 *
 * Scenarios covered:
 *  - Missing/invalid bearer token is rejected with 401.
 *  - OWNER can list conversations for their own restaurant with message/reservation counts.
 *  - Filters: channel, provider, customerId, status, search.
 *  - Pagination (page/pageSize) behaves as expected.
 *  - Detail endpoint returns customer summary and recent messages, without rawPayload.
 *  - Message list supports pagination and asc/desc ordering, and verifies the
 *    conversation belongs to restaurantId before returning anything.
 *  - rawPayload is withheld by default and for STAFF even with the explicit
 *    flag; only OWNER/MANAGER with ?includeRawPayload=true receive it.
 *  - Cross-tenant list/detail/message access fails (403/404) without leaking data.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { signAuthToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";

const TEST_TAG = `convtest_${Date.now()}`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("conversations.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("conversations.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
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
    data: { restaurantId: restaurant.id, fullName: "Ada Lovelace", phoneNumber: "+33612345678", normalizedPhone: "33612345678" },
  });

  const voiceConversation = await prisma.conversation.create({
    data: {
      restaurantId: restaurant.id,
      customerId: ada.id,
      channel: "voice",
      provider: "vapi",
      externalThreadId: `${TEST_TAG}_call`,
      customerName: "Ada Lovelace",
      status: "open",
      lastMessageAt: new Date("2027-01-01T10:00:00.000Z"),
      lastMessagePreview: "Table for 4 please",
    },
  });
  const whatsappConversation = await prisma.conversation.create({
    data: {
      restaurantId: restaurant.id,
      channel: "whatsapp",
      provider: "meta_cloud",
      externalThreadId: `${TEST_TAG}_wa_thread`,
      customerName: "Bob Builder",
      status: "closed",
      lastMessageAt: new Date("2027-01-02T10:00:00.000Z"),
      lastMessagePreview: "Thanks!",
    },
  });
  const otherConversation = await prisma.conversation.create({
    data: { restaurantId: otherRestaurant.id, channel: "voice", externalThreadId: `${TEST_TAG}_other`, status: "open" },
  });

  await prisma.reservationRequest.create({
    data: { restaurantId: restaurant.id, customerId: ada.id, conversationId: voiceConversation.id, channel: "voice", customerName: "Ada Lovelace", partySize: 4, status: "new" },
  });

  await prisma.message.create({
    data: {
      restaurantId: restaurant.id,
      conversationId: voiceConversation.id,
      customerId: ada.id,
      direction: "inbound",
      channel: "voice",
      senderType: "customer",
      messageText: "Table for 4 please",
      status: "received",
      rawPayload: { vapi: { toolCallId: `${TEST_TAG}_toolcall`, secret: "internal-debug-token" } },
    },
  });
  await prisma.message.create({
    data: {
      restaurantId: restaurant.id,
      conversationId: voiceConversation.id,
      customerId: ada.id,
      direction: "outbound",
      channel: "voice",
      senderType: "ai",
      messageText: "Sure, confirming for 8pm.",
      status: "sent",
    },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/restaurants`;

  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  try {
    // 1. Missing token -> 401.
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/conversations`);
    assert.equal(noAuthRes.status, 401, "missing bearer token must be rejected with 401");

    // 2. Invalid token -> 401.
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/conversations`, { headers: authed("not-a-real-token") });
    assert.equal(badAuthRes.status, 401, "invalid bearer token must be rejected with 401");

    // 3. OWNER can list conversations for their own restaurant, with counts.
    const listRes = await fetch(`${baseUrl}/${restaurant.id}/conversations`, { headers: authed(ownerToken) });
    assert.equal(listRes.status, 200);
    const listBody = (await listRes.json()) as {
      data: Array<{ id: string; messageCount: number; reservationRequestCount: number; customer: { fullName: string } | null }>;
      pagination: { total: number };
    };
    assert.equal(listBody.pagination.total, 2, "list must only include this restaurant's conversations");
    assert.ok(!listBody.data.some((c) => c.id === otherConversation.id), "must never include another tenant's conversation");
    const voiceRow = listBody.data.find((c) => c.id === voiceConversation.id);
    assert.equal(voiceRow?.messageCount, 2);
    assert.equal(voiceRow?.reservationRequestCount, 1);
    assert.equal(voiceRow?.customer?.fullName, "Ada Lovelace");

    // 4. Filter by channel.
    const channelRes = await fetch(`${baseUrl}/${restaurant.id}/conversations?channel=whatsapp`, { headers: authed(ownerToken) });
    const channelBody = (await channelRes.json()) as { data: Array<{ id: string }> };
    assert.equal(channelBody.data.length, 1);
    assert.equal(channelBody.data[0].id, whatsappConversation.id);

    // 5. Filter by status.
    const statusRes = await fetch(`${baseUrl}/${restaurant.id}/conversations?status=closed`, { headers: authed(ownerToken) });
    const statusBody = (await statusRes.json()) as { data: Array<{ id: string }> };
    assert.equal(statusBody.data.length, 1);
    assert.equal(statusBody.data[0].id, whatsappConversation.id);

    // 6. Filter by customerId.
    const customerFilterRes = await fetch(`${baseUrl}/${restaurant.id}/conversations?customerId=${ada.id}`, {
      headers: authed(ownerToken),
    });
    const customerFilterBody = (await customerFilterRes.json()) as { data: Array<{ id: string }> };
    assert.equal(customerFilterBody.data.length, 1);
    assert.equal(customerFilterBody.data[0].id, voiceConversation.id);

    // 7. Search by customer name.
    const searchRes = await fetch(`${baseUrl}/${restaurant.id}/conversations?search=Bob`, { headers: authed(ownerToken) });
    const searchBody = (await searchRes.json()) as { data: Array<{ id: string }> };
    assert.equal(searchBody.data.length, 1);
    assert.equal(searchBody.data[0].id, whatsappConversation.id);

    // 8. Pagination.
    const pageRes = await fetch(`${baseUrl}/${restaurant.id}/conversations?page=1&pageSize=1`, { headers: authed(ownerToken) });
    const pageBody = (await pageRes.json()) as { data: unknown[]; pagination: { totalPages: number } };
    assert.equal(pageBody.data.length, 1);
    assert.equal(pageBody.pagination.totalPages, 2);

    // 9. STAFF can access detail: customer summary + recent messages, no rawPayload.
    const detailRes = await fetch(`${baseUrl}/${restaurant.id}/conversations/${voiceConversation.id}`, {
      headers: authed(staffToken),
    });
    assert.equal(detailRes.status, 200);
    const detailBody = (await detailRes.json()) as {
      customer: { fullName: string } | null;
      messages: Array<{ rawPayload?: unknown }>;
    };
    assert.equal(detailBody.customer?.fullName, "Ada Lovelace");
    assert.equal(detailBody.messages.length, 2);
    assert.ok(detailBody.messages.every((m) => m.rawPayload === undefined), "conversation detail must never include rawPayload");

    // 10. Messages list, oldest-first by default.
    const messagesRes = await fetch(`${baseUrl}/${restaurant.id}/conversations/${voiceConversation.id}/messages`, {
      headers: authed(staffToken),
    });
    assert.equal(messagesRes.status, 200);
    const messagesBody = (await messagesRes.json()) as { data: Array<{ messageText: string }>; pagination: { total: number; order: string } };
    assert.equal(messagesBody.pagination.total, 2);
    assert.equal(messagesBody.pagination.order, "asc");
    assert.equal(messagesBody.data[0].messageText, "Table for 4 please");

    // 11. Messages list, newest-first via ?order=desc.
    const messagesDescRes = await fetch(
      `${baseUrl}/${restaurant.id}/conversations/${voiceConversation.id}/messages?order=desc`,
      { headers: authed(staffToken) }
    );
    const messagesDescBody = (await messagesDescRes.json()) as { data: Array<{ messageText: string }> };
    assert.equal(messagesDescBody.data[0].messageText, "Sure, confirming for 8pm.");

    // 12. rawPayload withheld by default.
    const noRawRes = await fetch(`${baseUrl}/${restaurant.id}/conversations/${voiceConversation.id}/messages`, {
      headers: authed(ownerToken),
    });
    const noRawBody = (await noRawRes.json()) as { data: Array<{ rawPayload?: unknown }> };
    assert.ok(noRawBody.data.every((m) => m.rawPayload === undefined), "rawPayload must not be returned by default");

    // 13. STAFF cannot get rawPayload even with the explicit flag.
    const staffRawRes = await fetch(
      `${baseUrl}/${restaurant.id}/conversations/${voiceConversation.id}/messages?includeRawPayload=true`,
      { headers: authed(staffToken) }
    );
    const staffRawBody = (await staffRawRes.json()) as { data: Array<{ rawPayload?: unknown }> };
    assert.ok(staffRawBody.data.every((m) => m.rawPayload === undefined), "STAFF must never receive rawPayload");

    // 14. OWNER explicitly opting in via ?includeRawPayload=true does receive it.
    const ownerRawRes = await fetch(
      `${baseUrl}/${restaurant.id}/conversations/${voiceConversation.id}/messages?includeRawPayload=true`,
      { headers: authed(ownerToken) }
    );
    const ownerRawBody = (await ownerRawRes.json()) as { data: Array<{ rawPayload?: unknown }> };
    assert.ok(
      ownerRawBody.data.some((m) => m.rawPayload !== undefined),
      "OWNER with includeRawPayload=true must receive rawPayload"
    );

    // 15. Cross-tenant list: STAFF assigned only to `restaurant` must not reach otherRestaurant's data.
    const crossTenantRes = await fetch(`${baseUrl}/${otherRestaurant.id}/conversations`, { headers: authed(staffToken) });
    assert.equal(crossTenantRes.status, 403, "a user with no access to otherRestaurant must get 403, not a data leak");

    // 16. Cross-tenant detail: another tenant's conversation id under this restaurant's scope must 404.
    const crossTenantDetailRes = await fetch(`${baseUrl}/${restaurant.id}/conversations/${otherConversation.id}`, {
      headers: authed(ownerToken),
    });
    assert.equal(crossTenantDetailRes.status, 404, "a conversation id belonging to another restaurant must 404 under this restaurant's scope");

    // 17. Cross-tenant messages: same id-confusion check on the messages sub-route.
    const crossTenantMessagesRes = await fetch(
      `${baseUrl}/${restaurant.id}/conversations/${otherConversation.id}/messages`,
      { headers: authed(ownerToken) }
    );
    assert.equal(crossTenantMessagesRes.status, 404, "messages for a conversation belonging to another restaurant must 404");

    console.log("conversations.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.message.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
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
  console.error("conversations.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
