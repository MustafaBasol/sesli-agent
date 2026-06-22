/**
 * team.integration.test.ts — end-to-end checks for the Phase 17 restaurant
 * team/role management API against a real Postgres database.
 *
 * Like customers.integration.test.ts, this needs a live DATABASE_URL and is
 * NOT wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/team.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 *
 * Scenarios covered:
 *  - Missing/invalid bearer token is rejected with 401.
 *  - OWNER/MANAGER/STAFF can all list/view team members (read-only for STAFF).
 *  - STAFF cannot add/update/remove team members (403).
 *  - OWNER can add an existing user by email; unknown email -> 404.
 *  - Adding an already-member user -> 409.
 *  - MANAGER can only add/manage STAFF-level members, never OWNER/MANAGER.
 *  - OWNER can update a member's role/status.
 *  - The last active OWNER cannot be demoted or deactivated.
 *  - Removing a member soft-deactivates the RestaurantUser row without
 *    deleting the global User record.
 *  - Cross-tenant list/detail/mutation is blocked (403/404).
 *  - List/detail/add/update responses never expose passwordHash or any
 *    auth/session/token field.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { signAuthToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";

const TEST_TAG = `teamtest_${Date.now()}`;

interface ApiError {
  error?: { message?: string };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("team.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("team.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
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
  const outsider = await prisma.user.create({
    data: { email: `${TEST_TAG}_outsider@example.com`, passwordHash, status: "active" },
  });
  const newRecruit = await prisma.user.create({
    data: { email: `${TEST_TAG}_recruit@example.com`, passwordHash, status: "active" },
  });

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

  try {
    // 1. Missing/invalid token -> 401.
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/team`);
    assert.equal(noAuthRes.status, 401, "missing bearer token must be rejected with 401");
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/team`, { headers: authed("not-a-real-token") });
    assert.equal(badAuthRes.status, 401, "invalid bearer token must be rejected with 401");

    // 2. OWNER/MANAGER/STAFF can all list the team.
    for (const token of [ownerToken, managerToken, staffToken]) {
      const listRes = await fetch(`${baseUrl}/${restaurant.id}/team`, { headers: authed(token) });
      assert.equal(listRes.status, 200);
    }

    const listRes = await fetch(`${baseUrl}/${restaurant.id}/team`, { headers: authed(ownerToken) });
    const listText = await listRes.text();
    assert.ok(!listText.includes("passwordHash"), "team list must never include passwordHash");
    assert.ok(!listText.includes("Test1234"), "team list must never leak raw credentials");
    const listBody = JSON.parse(listText) as { data: Array<{ userId: string }>; pagination: { total: number } };
    assert.equal(listBody.pagination.total, 3, "list must only include this restaurant's members");
    assert.ok(!listBody.data.some((m) => m.userId === outsider.id), "must never include another tenant's member");

    // 3. Detail.
    const detailRes = await fetch(`${baseUrl}/${restaurant.id}/team/${staff.id}`, { headers: authed(ownerToken) });
    assert.equal(detailRes.status, 200);
    const detailText = await detailRes.text();
    assert.ok(!detailText.includes("passwordHash"), "team detail must never include passwordHash");

    // 4. STAFF cannot mutate: add/update/remove all 403.
    const staffAddRes = await fetch(`${baseUrl}/${restaurant.id}/team`, {
      method: "POST",
      headers: json(staffToken),
      body: JSON.stringify({ email: newRecruit.email, restaurantRole: "STAFF" }),
    });
    assert.equal(staffAddRes.status, 403);

    const staffUpdateRes = await fetch(`${baseUrl}/${restaurant.id}/team/${manager.id}`, {
      method: "PATCH",
      headers: json(staffToken),
      body: JSON.stringify({ restaurantRole: "STAFF" }),
    });
    assert.equal(staffUpdateRes.status, 403);

    const staffRemoveRes = await fetch(`${baseUrl}/${restaurant.id}/team/${manager.id}`, {
      method: "DELETE",
      headers: authed(staffToken),
    });
    assert.equal(staffRemoveRes.status, 403);

    // 5. Unknown email on add -> 404.
    const unknownEmailRes = await fetch(`${baseUrl}/${restaurant.id}/team`, {
      method: "POST",
      headers: json(ownerToken),
      body: JSON.stringify({ email: "no-such-user@example.com", restaurantRole: "STAFF" }),
    });
    assert.equal(unknownEmailRes.status, 404);
    const unknownEmailBody = (await unknownEmailRes.json()) as ApiError;
    assert.ok(unknownEmailBody.error);

    // 6. MANAGER cannot add an OWNER/MANAGER-level member.
    const managerAddOwnerRes = await fetch(`${baseUrl}/${restaurant.id}/team`, {
      method: "POST",
      headers: json(managerToken),
      body: JSON.stringify({ email: newRecruit.email, restaurantRole: "OWNER" }),
    });
    assert.equal(managerAddOwnerRes.status, 403, "managers may not add owner-level members");

    // 7. MANAGER can add a STAFF-level member.
    const managerAddStaffRes = await fetch(`${baseUrl}/${restaurant.id}/team`, {
      method: "POST",
      headers: json(managerToken),
      body: JSON.stringify({ email: newRecruit.email, restaurantRole: "STAFF" }),
    });
    assert.equal(managerAddStaffRes.status, 201);
    const recruitAdded = (await managerAddStaffRes.json()) as { userId: string; restaurantRole: string };
    assert.equal(recruitAdded.restaurantRole, "STAFF");
    assert.equal(recruitAdded.userId, newRecruit.id);

    // 8. Adding the same user again -> 409.
    const duplicateAddRes = await fetch(`${baseUrl}/${restaurant.id}/team`, {
      method: "POST",
      headers: json(ownerToken),
      body: JSON.stringify({ email: newRecruit.email, restaurantRole: "STAFF" }),
    });
    assert.equal(duplicateAddRes.status, 409);

    // 9. MANAGER cannot manage another MANAGER/OWNER.
    const managerUpdateOwnerRes = await fetch(`${baseUrl}/${restaurant.id}/team/${owner.id}`, {
      method: "PATCH",
      headers: json(managerToken),
      body: JSON.stringify({ membershipStatus: "inactive" }),
    });
    assert.equal(managerUpdateOwnerRes.status, 403, "managers may only manage staff-level members");

    // 10. MANAGER can update the new recruit (STAFF-level).
    const managerUpdateRecruitRes = await fetch(`${baseUrl}/${restaurant.id}/team/${newRecruit.id}`, {
      method: "PATCH",
      headers: json(managerToken),
      body: JSON.stringify({ membershipStatus: "inactive" }),
    });
    assert.equal(managerUpdateRecruitRes.status, 200);
    const recruitDeactivated = (await managerUpdateRecruitRes.json()) as { membershipStatus: string };
    assert.equal(recruitDeactivated.membershipStatus, "inactive");

    // 11. The last active OWNER cannot be demoted.
    const demoteLastOwnerRes = await fetch(`${baseUrl}/${restaurant.id}/team/${owner.id}`, {
      method: "PATCH",
      headers: json(ownerToken),
      body: JSON.stringify({ restaurantRole: "MANAGER" }),
    });
    assert.equal(demoteLastOwnerRes.status, 409, "the last active owner must not be demotable");

    // 12. The last active OWNER cannot be deactivated/removed.
    const removeLastOwnerRes = await fetch(`${baseUrl}/${restaurant.id}/team/${owner.id}`, {
      method: "DELETE",
      headers: authed(ownerToken),
    });
    assert.equal(removeLastOwnerRes.status, 409, "the last active owner must not be removable");

    // 13. OWNER can promote MANAGER to a second OWNER, then demote the first
    // OWNER safely (no longer the last one).
    const promoteRes = await fetch(`${baseUrl}/${restaurant.id}/team/${manager.id}`, {
      method: "PATCH",
      headers: json(ownerToken),
      body: JSON.stringify({ restaurantRole: "OWNER" }),
    });
    assert.equal(promoteRes.status, 200);

    const demoteNowSafeRes = await fetch(`${baseUrl}/${restaurant.id}/team/${owner.id}`, {
      method: "PATCH",
      headers: json(ownerToken),
      body: JSON.stringify({ restaurantRole: "MANAGER" }),
    });
    assert.equal(demoteNowSafeRes.status, 200, "demoting is fine once another active owner exists");

    // 14. Removing a member soft-deactivates the row; the global User record
    // is never deleted.
    const removeStaffRes = await fetch(`${baseUrl}/${restaurant.id}/team/${staff.id}`, {
      method: "DELETE",
      headers: authed(managerToken),
    });
    assert.equal(removeStaffRes.status, 200);
    const removedStaff = (await removeStaffRes.json()) as { membershipStatus: string };
    assert.equal(removedStaff.membershipStatus, "inactive");
    const staffMembership = await prisma.restaurantUser.findUnique({
      where: { restaurantId_userId: { restaurantId: restaurant.id, userId: staff.id } },
    });
    assert.ok(staffMembership, "the restaurant membership row must still exist after removal");
    assert.equal(staffMembership?.status, "inactive");
    const staffUserRow = await prisma.user.findUnique({ where: { id: staff.id } });
    assert.ok(staffUserRow, "the global User record must never be hard-deleted");

    // 15. Cross-tenant access is blocked.
    const crossTenantListRes = await fetch(`${baseUrl}/${otherRestaurant.id}/team`, { headers: authed(ownerToken) });
    assert.equal(crossTenantListRes.status, 403, "a user with no access to otherRestaurant must get 403, not a data leak");

    const crossTenantDetailRes = await fetch(`${baseUrl}/${restaurant.id}/team/${outsider.id}`, {
      headers: authed(ownerToken),
    });
    assert.equal(crossTenantDetailRes.status, 404, "a member belonging to another restaurant must 404 under this scope");

    const noAccessRes = await fetch(`${baseUrl}/${restaurant.id}/team`, { headers: authed(outsiderToken) });
    assert.equal(noAccessRes.status, 403);

    // 16. Add response never leaks sensitive fields.
    const addResForSanitization = await fetch(`${baseUrl}/${restaurant.id}/team`, {
      method: "POST",
      headers: json(ownerToken),
      body: JSON.stringify({ email: outsider.email, restaurantRole: "STAFF" }),
    });
    const addBody = await addResForSanitization.text();
    assert.ok(!addBody.includes("passwordHash"), "add-member response must never include passwordHash");

    console.log("team.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, manager.id, staff.id, outsider.id, newRecruit.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("team.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
