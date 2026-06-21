/**
 * dashboard.integration.test.ts — end-to-end checks for the Phase 8 admin
 * dashboard summary/recent/counts API against a real Postgres database.
 *
 * Like the other *.integration.test.ts files, this needs a live DATABASE_URL
 * and is NOT wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/dashboard.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 *
 * Scenarios covered:
 *  - Missing/invalid bearer token is rejected with 401.
 *  - STAFF can read summary/recent/counts (read-only dashboard access).
 *  - summary counts reservation requests by status, today/upcoming, customers,
 *    conversations, integrations (by status/channel), and health flags.
 *  - recent lists return only this restaurant's rows, newest first, capped by `limit`.
 *  - counts returns the lightweight badge counters.
 *  - cross-tenant restaurant id -> 403, no data leak.
 *  - no rawPayload, credentialsEncrypted, or webhookVerifyTokenHash anywhere in any response.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { signAuthToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";

const TEST_TAG = `dashtest_${Date.now()}`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("dashboard.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("dashboard.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
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
    data: { restaurantId: restaurant.id, fullName: "Ada Lovelace", phoneNumber: "+33000000001", normalizedPhone: "33000000001" },
  });
  await prisma.customer.create({ data: { restaurantId: restaurant.id, fullName: "No Phone Customer" } });
  // Belongs to the other tenant — must never leak into this restaurant's counts/lists.
  await prisma.customer.create({ data: { restaurantId: otherRestaurant.id, fullName: "Other Tenant Customer" } });

  await prisma.reservationRequest.createMany({
    data: [
      { restaurantId: restaurant.id, channel: "voice", status: "new", customerName: "Ada Lovelace", customerId: customer.id },
      { restaurantId: restaurant.id, channel: "voice", status: "pending_info" },
      { restaurantId: restaurant.id, channel: "whatsapp", status: "confirmed", reservationDate: new Date(Date.now() + 86400000) },
      { restaurantId: restaurant.id, channel: "voice", status: "rejected" },
      { restaurantId: restaurant.id, channel: "voice", status: "cancelled" },
      { restaurantId: restaurant.id, channel: "voice", status: "done" },
      { restaurantId: otherRestaurant.id, channel: "voice", status: "new" },
    ],
  });

  const conversation = await prisma.conversation.create({
    data: { restaurantId: restaurant.id, channel: "whatsapp", status: "open", customerId: customer.id, customerName: "Ada Lovelace" },
  });
  await prisma.conversation.create({ data: { restaurantId: restaurant.id, channel: "voice", status: "closed" } });
  await prisma.conversation.create({ data: { restaurantId: otherRestaurant.id, channel: "voice", status: "open" } });

  await prisma.message.create({
    data: {
      restaurantId: restaurant.id,
      conversationId: conversation.id,
      direction: "inbound",
      channel: "whatsapp",
      senderType: "customer",
      messageText: "Hello",
      rawPayload: { secret: "raw-provider-blob" },
    },
  });

  await prisma.integrationConnection.create({
    data: {
      restaurantId: restaurant.id,
      channel: "vapi",
      provider: "vapi",
      status: "active",
      publicWebhookKey: `${TEST_TAG}_vapi_key`,
      credentialsEncrypted: "should-never-be-returned",
      webhookVerifyTokenHash: "should-never-be-returned",
    },
  });
  await prisma.integrationConnection.create({
    data: { restaurantId: restaurant.id, channel: "sms", provider: "netgsm", status: "error", publicWebhookKey: `${TEST_TAG}_sms_key` },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/restaurants`;
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  try {
    // 1. Missing token -> 401.
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/dashboard/summary`);
    assert.equal(noAuthRes.status, 401);

    // 2. Invalid token -> 401.
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/dashboard/summary`, { headers: authed("not-a-real-token") });
    assert.equal(badAuthRes.status, 401);

    // 3. STAFF can read summary.
    const staffSummaryRes = await fetch(`${baseUrl}/${restaurant.id}/dashboard/summary`, { headers: authed(staffToken) });
    assert.equal(staffSummaryRes.status, 200, "STAFF must be able to read the dashboard summary");

    // 4. OWNER summary counts are scoped to this restaurant only.
    const summaryRes = await fetch(`${baseUrl}/${restaurant.id}/dashboard/summary`, { headers: authed(ownerToken) });
    assert.equal(summaryRes.status, 200);
    const summary = (await summaryRes.json()) as any;

    assert.equal(summary.reservationRequests.total, 6);
    assert.equal(summary.reservationRequests.new, 1);
    assert.equal(summary.reservationRequests.pendingInfo, 1);
    assert.equal(summary.reservationRequests.confirmed, 1);
    assert.equal(summary.reservationRequests.rejected, 1);
    assert.equal(summary.reservationRequests.cancelled, 1);
    assert.equal(summary.reservationRequests.done, 1);
    assert.equal(summary.reservationRequests.upcomingCount, 1);

    assert.equal(summary.customers.total, 2);
    assert.equal(summary.customers.withPhoneCount, 1);

    assert.equal(summary.conversations.total, 2);
    assert.equal(summary.conversations.open, 1);
    assert.equal(summary.conversations.closed, 1);
    assert.equal(summary.conversations.todayMessagesCount, 1);
    assert.equal("unreadCount" in summary.conversations, false, "unreadCount must be omitted, not fabricated");

    assert.equal(summary.integrations.total, 2);
    assert.equal(summary.integrations.active, 1);
    assert.equal(summary.integrations.error, 1);
    assert.equal(summary.integrations.byChannel.vapi, 1);
    assert.equal(summary.integrations.byChannel.sms, 1);

    assert.equal(summary.health.hasActiveVapiIntegration, true);
    assert.equal(summary.health.hasAnyActiveMessagingIntegration, false, "the sms integration is in error status, not active");
    assert.ok(summary.health.lastInboundAt);

    const summaryJson = JSON.stringify(summary);
    assert.ok(!summaryJson.includes("raw-provider-blob"));
    assert.ok(!summaryJson.includes("should-never-be-returned"));
    assert.ok(!summaryJson.includes("credentialsEncrypted"));
    assert.ok(!summaryJson.includes("webhookVerifyTokenHash"));

    // 5. recent lists, scoped and capped.
    const recentRes = await fetch(`${baseUrl}/${restaurant.id}/dashboard/recent?limit=2`, { headers: authed(ownerToken) });
    assert.equal(recentRes.status, 200);
    const recent = (await recentRes.json()) as any;
    assert.equal(recent.recentReservationRequests.length, 2);
    assert.equal(recent.recentCustomers.length, 2);
    assert.equal(recent.recentConversations.length, 2);
    assert.equal(recent.recentReservationRequests[0].customer.fullName, "Ada Lovelace");

    const recentJson = JSON.stringify(recent);
    assert.ok(!recentJson.includes("raw-provider-blob"));
    assert.ok(!recentJson.includes("should-never-be-returned"));

    // 6. STAFF can read recent and counts too.
    const staffRecentRes = await fetch(`${baseUrl}/${restaurant.id}/dashboard/recent`, { headers: authed(staffToken) });
    assert.equal(staffRecentRes.status, 200);
    const staffCountsRes = await fetch(`${baseUrl}/${restaurant.id}/dashboard/counts`, { headers: authed(staffToken) });
    assert.equal(staffCountsRes.status, 200);

    // 7. counts: lightweight badge counters.
    const countsRes = await fetch(`${baseUrl}/${restaurant.id}/dashboard/counts`, { headers: authed(ownerToken) });
    assert.equal(countsRes.status, 200);
    const counts = (await countsRes.json()) as any;
    assert.equal(counts.newReservationRequests, 1);
    assert.equal(counts.pendingInfoReservationRequests, 1);
    assert.equal(counts.openConversations, 1);
    assert.equal(counts.integrationErrors, 1);
    assert.equal(counts.todayMessages, 1);

    // 8. Cross-tenant restaurant id -> 403, no leak.
    const crossTenantRes = await fetch(`${baseUrl}/${otherRestaurant.id}/dashboard/summary`, { headers: authed(ownerToken) });
    assert.equal(crossTenantRes.status, 403, "a user with no access to otherRestaurant must get 403, not a data leak");

    console.log("dashboard.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.message.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.conversation.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.reservationRequest.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.integrationConnection.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.customer.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, staff.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("dashboard.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
