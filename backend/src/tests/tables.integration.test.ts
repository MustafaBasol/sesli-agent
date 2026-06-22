/**
 * tables.integration.test.ts — end-to-end checks for the Phase 16 restaurant
 * table list/detail/create/update API against a real Postgres database.
 *
 * Needs a live DATABASE_URL and is NOT wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/tables.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 *
 * Scenarios covered:
 *  - Missing/invalid bearer token is rejected with 401.
 *  - OWNER/STAFF can list tables for their own restaurant.
 *  - Status and search filters work.
 *  - Detail includes upcoming reservation summaries.
 *  - OWNER/MANAGER can create/update tables; STAFF cannot.
 *  - Cross-tenant list returns 403, cross-tenant detail returns 404.
 *  - Responses never expose rawPayload, stateJson, or other internal fields.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { signAuthToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";

const TEST_TAG = `tabletest_${Date.now()}`;

interface ApiError {
  error?: { message?: string };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("tables.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("tables.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
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
  const manager = await prisma.user.create({
    data: { email: `${TEST_TAG}_manager@example.com`, passwordHash, status: "active" },
  });
  const staff = await prisma.user.create({
    data: { email: `${TEST_TAG}_staff@example.com`, passwordHash, status: "active" },
  });

  await prisma.restaurantUser.create({ data: { restaurantId: restaurant.id, userId: owner.id, role: "OWNER", status: "active" } });
  await prisma.restaurantUser.create({ data: { restaurantId: restaurant.id, userId: manager.id, role: "MANAGER", status: "active" } });
  await prisma.restaurantUser.create({ data: { restaurantId: restaurant.id, userId: staff.id, role: "STAFF", status: "active" } });

  const ownerToken = signAuthToken({ sub: owner.id });
  const managerToken = signAuthToken({ sub: manager.id });
  const staffToken = signAuthToken({ sub: staff.id });

  const tableA = await prisma.restaurantTable.create({
    data: { restaurantId: restaurant.id, tableNumber: `${TEST_TAG}-A`, capacity: 2, location: "window" },
  });
  const tableB = await prisma.restaurantTable.create({
    data: { restaurantId: restaurant.id, tableNumber: `${TEST_TAG}-B`, capacity: 6, location: "main", isActive: false },
  });
  const otherTable = await prisma.restaurantTable.create({
    data: { restaurantId: otherRestaurant.id, tableNumber: `${TEST_TAG}-OTHER`, capacity: 4 },
  });

  const customer = await prisma.customer.create({
    data: { restaurantId: restaurant.id, fullName: "Ada Lovelace", phoneNumber: "+33612345678", normalizedPhone: "33612345678" },
  });
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const reservation = await prisma.reservation.create({
    data: {
      restaurantId: restaurant.id,
      customerId: customer.id,
      assignedTableId: tableA.id,
      sourceChannel: "voice",
      reservationDate: futureDate,
      reservationTime: "19:00",
      partySize: 2,
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
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/tables`);
    assert.equal(noAuthRes.status, 401, "missing bearer token must be rejected with 401");

    // 2. Invalid token -> 401.
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/tables`, { headers: authed("not-a-real-token") });
    assert.equal(badAuthRes.status, 401, "invalid bearer token must be rejected with 401");

    // 3. STAFF (read role) can list tables for their own restaurant.
    const listRes = await fetch(`${baseUrl}/${restaurant.id}/tables`, { headers: authed(staffToken) });
    assert.equal(listRes.status, 200);
    const listResText = await listRes.text();
    assert.ok(!listResText.includes("rawPayload"), "table list response must never include rawPayload");
    assert.ok(!listResText.includes("stateJson"), "table list response must never include stateJson");
    const listBody = JSON.parse(listResText) as {
      data: Array<{ id: string; status: string; upcomingReservationCount: number }>;
      pagination: { total: number };
    };
    assert.equal(listBody.pagination.total, 2, "list must only include this restaurant's tables");
    assert.ok(!listBody.data.some((t) => t.id === otherTable.id), "must never include another tenant's table");
    const tableARow = listBody.data.find((t) => t.id === tableA.id);
    assert.equal(tableARow?.status, "active");
    assert.equal(tableARow?.upcomingReservationCount, 1);

    // 4. Status filter.
    const inactiveRes = await fetch(`${baseUrl}/${restaurant.id}/tables?status=inactive`, { headers: authed(staffToken) });
    const inactiveBody = (await inactiveRes.json()) as { data: Array<{ id: string }> };
    assert.equal(inactiveBody.data.length, 1);
    assert.equal(inactiveBody.data[0].id, tableB.id);

    // 5. Search filter.
    const searchRes = await fetch(`${baseUrl}/${restaurant.id}/tables?search=window`, { headers: authed(staffToken) });
    const searchBody = (await searchRes.json()) as { data: Array<{ id: string }> };
    assert.equal(searchBody.data.length, 1);
    assert.equal(searchBody.data[0].id, tableA.id);

    // 6. Detail includes upcoming reservation summaries, never raw fields.
    const detailRes = await fetch(`${baseUrl}/${restaurant.id}/tables/${tableA.id}`, { headers: authed(staffToken) });
    assert.equal(detailRes.status, 200);
    const detailResText = await detailRes.text();
    assert.ok(!detailResText.includes("rawPayload"), "table detail response must never include rawPayload");
    assert.ok(!detailResText.includes("stateJson"), "table detail response must never include stateJson");
    const detailBody = JSON.parse(detailResText) as {
      upcomingReservations: Array<{ id: string; customerName: string | null }>;
    };
    assert.equal(detailBody.upcomingReservations.length, 1);
    assert.equal(detailBody.upcomingReservations[0].id, reservation.id);
    assert.equal(detailBody.upcomingReservations[0].customerName, "Ada Lovelace");

    // 7. STAFF cannot create a table.
    const staffCreateRes = await fetch(`${baseUrl}/${restaurant.id}/tables`, {
      method: "POST",
      headers: { ...authed(staffToken), "Content-Type": "application/json" },
      body: JSON.stringify({ tableNumber: `${TEST_TAG}-C`, capacity: 4 }),
    });
    assert.equal(staffCreateRes.status, 403, "STAFF must not be able to create tables");

    // 8. MANAGER can create a table.
    const managerCreateRes = await fetch(`${baseUrl}/${restaurant.id}/tables`, {
      method: "POST",
      headers: { ...authed(managerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ tableNumber: `${TEST_TAG}-C`, capacity: 4, location: "terrace" }),
    });
    assert.equal(managerCreateRes.status, 201);
    const created = (await managerCreateRes.json()) as { id: string; status: string };
    assert.equal(created.status, "active");

    // 9. OWNER can update a table.
    const ownerUpdateRes = await fetch(`${baseUrl}/${restaurant.id}/tables/${created.id}`, {
      method: "PATCH",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ capacity: 8, status: "inactive" }),
    });
    assert.equal(ownerUpdateRes.status, 200);
    const updated = (await ownerUpdateRes.json()) as { capacity: number; status: string };
    assert.equal(updated.capacity, 8);
    assert.equal(updated.status, "inactive");

    // 10. STAFF cannot update a table.
    const staffUpdateRes = await fetch(`${baseUrl}/${restaurant.id}/tables/${created.id}`, {
      method: "PATCH",
      headers: { ...authed(staffToken), "Content-Type": "application/json" },
      body: JSON.stringify({ capacity: 10 }),
    });
    assert.equal(staffUpdateRes.status, 403, "STAFF must not be able to update tables");

    // 11. Cross-tenant list: a user with no access to otherRestaurant must get 403.
    const crossTenantRes = await fetch(`${baseUrl}/${otherRestaurant.id}/tables`, { headers: authed(staffToken) });
    assert.equal(crossTenantRes.status, 403, "a user with no access to otherRestaurant must get 403, not a data leak");

    // 12. Cross-tenant detail: another tenant's table id under this restaurant's scope must 404.
    const crossTenantDetailRes = await fetch(`${baseUrl}/${restaurant.id}/tables/${otherTable.id}`, {
      headers: authed(ownerToken),
    });
    assert.equal(crossTenantDetailRes.status, 404, "a table id belonging to another restaurant must 404 under this restaurant's scope");

    // 13. Duplicate tableNumber within the same restaurant is rejected with 409.
    const duplicateRes = await fetch(`${baseUrl}/${restaurant.id}/tables`, {
      method: "POST",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ tableNumber: tableA.tableNumber, capacity: 2 }),
    });
    assert.equal(duplicateRes.status, 409);
    const duplicateBody = (await duplicateRes.json()) as ApiError;
    assert.ok(duplicateBody.error);

    console.log("tables.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.reservation.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.customer.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.restaurantTable.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, manager.id, staff.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("tables.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
