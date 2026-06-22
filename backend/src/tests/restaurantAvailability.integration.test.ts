/**
 * restaurantAvailability.integration.test.ts — end-to-end checks for the
 * Phase 24 restaurant availability settings + blackout dates API against a
 * real Postgres database.
 *
 * Needs a live DATABASE_URL and is NOT wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/restaurantAvailability.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { signAuthToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";

const TEST_TAG = `availabilitytest_${Date.now()}`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("restaurantAvailability.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("restaurantAvailability.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
    return;
  }

  const organization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org`, status: "active" } });
  const restaurant = await prisma.restaurant.create({
    data: { organizationId: organization.id, name: `${TEST_TAG}_restaurant`, slug: `${TEST_TAG}-restaurant` },
  });
  const otherOrganization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org_2`, status: "active" } });
  const otherRestaurant = await prisma.restaurant.create({
    data: { organizationId: otherOrganization.id, name: `${TEST_TAG}_restaurant_2`, slug: `${TEST_TAG}-restaurant-2` },
  });

  const passwordHash = await hashPassword("Test1234!");
  const owner = await prisma.user.create({ data: { email: `${TEST_TAG}_owner@example.com`, passwordHash, status: "active" } });
  const manager = await prisma.user.create({ data: { email: `${TEST_TAG}_manager@example.com`, passwordHash, status: "active" } });
  const staff = await prisma.user.create({ data: { email: `${TEST_TAG}_staff@example.com`, passwordHash, status: "active" } });
  const outsider = await prisma.user.create({ data: { email: `${TEST_TAG}_outsider@example.com`, passwordHash, status: "active" } });

  await prisma.restaurantUser.create({ data: { restaurantId: restaurant.id, userId: owner.id, role: "OWNER", status: "active" } });
  await prisma.restaurantUser.create({ data: { restaurantId: restaurant.id, userId: manager.id, role: "MANAGER", status: "active" } });
  await prisma.restaurantUser.create({ data: { restaurantId: restaurant.id, userId: staff.id, role: "STAFF", status: "active" } });
  await prisma.restaurantUser.create({ data: { restaurantId: otherRestaurant.id, userId: outsider.id, role: "OWNER", status: "active" } });

  const ownerToken = signAuthToken({ sub: owner.id });
  const managerToken = signAuthToken({ sub: manager.id });
  const staffToken = signAuthToken({ sub: staff.id });
  const outsiderToken = signAuthToken({ sub: outsider.id });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/restaurants`;

  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });
  const json = (token: string) => ({ ...authed(token), "Content-Type": "application/json" });

  let createdBlackoutId: string | undefined;

  try {
    // 1. Missing/invalid token -> 401.
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/availability/settings`);
    assert.equal(noAuthRes.status, 401, "missing bearer token must be rejected with 401");
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/availability/settings`, {
      headers: authed("not-a-real-token"),
    });
    assert.equal(badAuthRes.status, 401, "invalid bearer token must be rejected with 401");

    // 2. Default settings row is created idempotently on first GET.
    const getRes = await fetch(`${baseUrl}/${restaurant.id}/availability/settings`, { headers: authed(ownerToken) });
    assert.equal(getRes.status, 200);
    const getText = await getRes.text();
    assert.ok(!getText.includes("passwordHash"), "settings response must never include passwordHash");
    assert.ok(!getText.includes("credentialsEncrypted"), "settings response must never include credentialsEncrypted");
    const settings = JSON.parse(getText) as {
      id: string;
      restaurantId: string;
      slotIntervalMinutes: number;
      defaultReservationDurationMinutes: number;
      minPartySize: number;
      maxPartySize: number;
    };
    assert.equal(settings.restaurantId, restaurant.id);
    assert.equal(settings.slotIntervalMinutes, 30);
    assert.equal(settings.defaultReservationDurationMinutes, 90);

    const getAgainRes = await fetch(`${baseUrl}/${restaurant.id}/availability/settings`, { headers: authed(ownerToken) });
    const settingsAgain = (await getAgainRes.json()) as { id: string };
    assert.equal(settingsAgain.id, settings.id, "repeated GET must not create a second settings row");

    // STAFF can read.
    const staffGetRes = await fetch(`${baseUrl}/${restaurant.id}/availability/settings`, { headers: authed(staffToken) });
    assert.equal(staffGetRes.status, 200);

    // 3. STAFF cannot mutate settings.
    const staffPatchRes = await fetch(`${baseUrl}/${restaurant.id}/availability/settings`, {
      method: "PATCH",
      headers: json(staffToken),
      body: JSON.stringify({ slotIntervalMinutes: 15 }),
    });
    assert.equal(staffPatchRes.status, 403);

    // 4. OWNER/MANAGER can PATCH settings and they persist.
    const patchRes = await fetch(`${baseUrl}/${restaurant.id}/availability/settings`, {
      method: "PATCH",
      headers: json(ownerToken),
      body: JSON.stringify({ slotIntervalMinutes: 15, maxPartySize: 20, minPartySize: 2 }),
    });
    assert.equal(patchRes.status, 200);
    const patched = (await patchRes.json()) as { slotIntervalMinutes: number; maxPartySize: number; minPartySize: number };
    assert.equal(patched.slotIntervalMinutes, 15);
    assert.equal(patched.maxPartySize, 20);
    assert.equal(patched.minPartySize, 2);

    // 5. Strict schema rejects unknown fields and invalid ranges.
    const unknownFieldRes = await fetch(`${baseUrl}/${restaurant.id}/availability/settings`, {
      method: "PATCH",
      headers: json(managerToken),
      body: JSON.stringify({ unknownField: "nope" }),
    });
    assert.equal(unknownFieldRes.status, 400);

    const badPartySizeRes = await fetch(`${baseUrl}/${restaurant.id}/availability/settings`, {
      method: "PATCH",
      headers: json(managerToken),
      body: JSON.stringify({ minPartySize: 10, maxPartySize: 5 }),
    });
    assert.equal(badPartySizeRes.status, 400, "maxPartySize below minPartySize must be rejected");

    // 6. Cross-tenant access to settings is blocked.
    const crossTenantSettingsRes = await fetch(`${baseUrl}/${otherRestaurant.id}/availability/settings`, {
      headers: authed(ownerToken),
    });
    assert.equal(crossTenantSettingsRes.status, 403);

    // --- Blackout dates ---

    // 7. Invalid localDate / time formats rejected.
    const badDateRes = await fetch(`${baseUrl}/${restaurant.id}/availability/blackouts`, {
      method: "POST",
      headers: json(ownerToken),
      body: JSON.stringify({ localDate: "22-06-2026", isFullDay: true }),
    });
    assert.equal(badDateRes.status, 400, "invalid localDate must be rejected");

    const nonFullDayMissingTimesRes = await fetch(`${baseUrl}/${restaurant.id}/availability/blackouts`, {
      method: "POST",
      headers: json(ownerToken),
      body: JSON.stringify({ localDate: "2026-07-01", isFullDay: false }),
    });
    assert.equal(nonFullDayMissingTimesRes.status, 400, "non-full-day blackout requires start/end times");

    const badTimeRes = await fetch(`${baseUrl}/${restaurant.id}/availability/blackouts`, {
      method: "POST",
      headers: json(ownerToken),
      body: JSON.stringify({ localDate: "2026-07-01", isFullDay: false, startsAtLocal: "25:00", endsAtLocal: "26:00" }),
    });
    assert.equal(badTimeRes.status, 400, "invalid HH:mm time must be rejected");

    const endBeforeStartRes = await fetch(`${baseUrl}/${restaurant.id}/availability/blackouts`, {
      method: "POST",
      headers: json(ownerToken),
      body: JSON.stringify({ localDate: "2026-07-01", isFullDay: false, startsAtLocal: "18:00", endsAtLocal: "17:00" }),
    });
    assert.equal(endBeforeStartRes.status, 400, "endsAtLocal before startsAtLocal must be rejected");

    // STAFF cannot create.
    const staffCreateRes = await fetch(`${baseUrl}/${restaurant.id}/availability/blackouts`, {
      method: "POST",
      headers: json(staffToken),
      body: JSON.stringify({ localDate: "2026-12-25", isFullDay: true, reason: "Christmas" }),
    });
    assert.equal(staffCreateRes.status, 403);

    // 8. OWNER/MANAGER can create/list/detail/update/deactivate a blackout date.
    const createRes = await fetch(`${baseUrl}/${restaurant.id}/availability/blackouts`, {
      method: "POST",
      headers: json(ownerToken),
      body: JSON.stringify({ localDate: "2026-12-25", isFullDay: true, reason: "Christmas" }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as { id: string; localDate: string; status: string };
    assert.equal(created.localDate, "2026-12-25");
    assert.equal(created.status, "active");
    createdBlackoutId = created.id;

    const listRes = await fetch(`${baseUrl}/${restaurant.id}/availability/blackouts`, { headers: authed(staffToken) });
    assert.equal(listRes.status, 200);
    const list = (await listRes.json()) as { data: Array<{ id: string }> };
    assert.ok(list.data.some((b) => b.id === createdBlackoutId));

    const detailRes = await fetch(`${baseUrl}/${restaurant.id}/availability/blackouts/${createdBlackoutId}`, {
      headers: authed(staffToken),
    });
    assert.equal(detailRes.status, 200);

    const updateRes = await fetch(`${baseUrl}/${restaurant.id}/availability/blackouts/${createdBlackoutId}`, {
      method: "PATCH",
      headers: json(managerToken),
      body: JSON.stringify({ reason: "Christmas Day (updated)" }),
    });
    assert.equal(updateRes.status, 200);
    const updated = (await updateRes.json()) as { reason: string };
    assert.equal(updated.reason, "Christmas Day (updated)");

    const deactivateRes = await fetch(`${baseUrl}/${restaurant.id}/availability/blackouts/${createdBlackoutId}`, {
      method: "DELETE",
      headers: authed(ownerToken),
    });
    assert.equal(deactivateRes.status, 200);
    const deactivated = (await deactivateRes.json()) as { status: string };
    assert.equal(deactivated.status, "inactive", "DELETE must soft-deactivate, not hard-delete");

    const stillExists = await prisma.blackoutDate.findUnique({ where: { id: createdBlackoutId } });
    assert.ok(stillExists, "blackout date row must still exist in the database after deactivation");

    // 9. Blackout date from another restaurant cannot be accessed.
    const otherBlackout = await prisma.blackoutDate.create({
      data: { restaurantId: otherRestaurant.id, localDate: "2026-01-01", isFullDay: true },
    });
    const crossTenantBlackoutRes = await fetch(`${baseUrl}/${restaurant.id}/availability/blackouts/${otherBlackout.id}`, {
      headers: authed(ownerToken),
    });
    assert.equal(crossTenantBlackoutRes.status, 404, "blackout from another restaurant must not be reachable via this restaurant's id");

    const crossTenantListRes = await fetch(`${baseUrl}/${otherRestaurant.id}/availability/blackouts`, {
      headers: authed(ownerToken),
    });
    assert.equal(crossTenantListRes.status, 403);

    const noAccessRes = await fetch(`${baseUrl}/${restaurant.id}/availability/settings`, { headers: authed(outsiderToken) });
    assert.equal(noAccessRes.status, 403);

    console.log("restaurantAvailability.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.blackoutDate.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.restaurantSettings.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, manager.id, staff.id, outsider.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organization.id, otherOrganization.id] } } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("restaurantAvailability.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
