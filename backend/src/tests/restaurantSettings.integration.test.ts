/**
 * restaurantSettings.integration.test.ts — end-to-end checks for the Phase 18
 * restaurant settings API against a real Postgres database.
 *
 * Like team.integration.test.ts, this needs a live DATABASE_URL and is NOT
 * wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/restaurantSettings.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 *
 * Scenarios covered:
 *  - Missing/invalid bearer token is rejected with 401.
 *  - OWNER/MANAGER/STAFF can all GET settings (read-only for STAFF).
 *  - STAFF cannot PATCH settings (403).
 *  - OWNER/MANAGER can PATCH safe fields and they persist.
 *  - Unsafe/unknown fields are rejected by the strict schema (400).
 *  - Cross-tenant access is blocked (403).
 *  - Responses never expose credentials, passwordHash, or other internal
 *    fields, and include a safe organization summary.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { signAuthToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";

const TEST_TAG = `settingstest_${Date.now()}`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("restaurantSettings.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("restaurantSettings.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
    return;
  }

  const organization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org`, status: "active" } });
  const restaurant = await prisma.restaurant.create({
    data: {
      organizationId: organization.id,
      name: `${TEST_TAG}_restaurant`,
      slug: `${TEST_TAG}-restaurant`,
      phone: "+33100000000",
      email: `${TEST_TAG}@example.com`,
    },
  });
  const otherOrganization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org_2`, status: "active" } });
  const otherRestaurant = await prisma.restaurant.create({
    data: { organizationId: otherOrganization.id, name: `${TEST_TAG}_restaurant_2`, slug: `${TEST_TAG}-restaurant-2` },
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
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/settings`);
    assert.equal(noAuthRes.status, 401, "missing bearer token must be rejected with 401");
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/settings`, { headers: authed("not-a-real-token") });
    assert.equal(badAuthRes.status, 401, "invalid bearer token must be rejected with 401");

    // 2. OWNER/MANAGER/STAFF can all GET settings.
    for (const token of [ownerToken, managerToken, staffToken]) {
      const getRes = await fetch(`${baseUrl}/${restaurant.id}/settings`, { headers: authed(token) });
      assert.equal(getRes.status, 200);
    }

    const getRes = await fetch(`${baseUrl}/${restaurant.id}/settings`, { headers: authed(ownerToken) });
    const getText = await getRes.text();
    assert.ok(!getText.includes("passwordHash"), "settings response must never include passwordHash");
    assert.ok(!getText.includes("credentialsEncrypted"), "settings response must never include credentialsEncrypted");
    assert.ok(!getText.includes("stateJson"), "settings response must never include stateJson");
    const getBody = JSON.parse(getText) as {
      id: string;
      organizationId: string;
      name: string;
      slug: string;
      organization: { id: string; name: string; status: string };
    };
    assert.equal(getBody.id, restaurant.id);
    assert.equal(getBody.organizationId, organization.id);
    assert.equal(getBody.organization.id, organization.id);
    assert.equal(getBody.organization.name, organization.name);

    // 3. STAFF cannot PATCH settings.
    const staffPatchRes = await fetch(`${baseUrl}/${restaurant.id}/settings`, {
      method: "PATCH",
      headers: json(staffToken),
      body: JSON.stringify({ name: "Staff Should Not Win" }),
    });
    assert.equal(staffPatchRes.status, 403);

    // 4. OWNER/MANAGER can PATCH safe fields and they persist.
    const patchRes = await fetch(`${baseUrl}/${restaurant.id}/settings`, {
      method: "PATCH",
      headers: json(ownerToken),
      body: JSON.stringify({
        name: "Updated Name",
        phone: "+33199999999",
        email: "updated@example.com",
        address: "1 Rue de Test",
        timezone: "Europe/Paris",
        defaultLanguage: "en",
      }),
    });
    assert.equal(patchRes.status, 200);
    const patched = (await patchRes.json()) as { name: string; phone: string; email: string; defaultLanguage: string };
    assert.equal(patched.name, "Updated Name");
    assert.equal(patched.phone, "+33199999999");
    assert.equal(patched.email, "updated@example.com");
    assert.equal(patched.defaultLanguage, "en");

    const reloaded = await prisma.restaurant.findUnique({ where: { id: restaurant.id } });
    assert.equal(reloaded?.name, "Updated Name");
    assert.equal(reloaded?.defaultLanguage, "en");

    // 5. Unsafe/unknown fields are rejected by the strict schema.
    const unsafePatchRes = await fetch(`${baseUrl}/${restaurant.id}/settings`, {
      method: "PATCH",
      headers: json(managerToken),
      body: JSON.stringify({ slug: "hacked-slug" }),
    });
    assert.equal(unsafePatchRes.status, 400, "slug must not be a patchable field");

    const statusPatchRes = await fetch(`${baseUrl}/${restaurant.id}/settings`, {
      method: "PATCH",
      headers: json(managerToken),
      body: JSON.stringify({ status: "inactive" }),
    });
    assert.equal(statusPatchRes.status, 400, "status must not be a patchable field in this phase");

    const noFieldsRes = await fetch(`${baseUrl}/${restaurant.id}/settings`, {
      method: "PATCH",
      headers: json(managerToken),
      body: JSON.stringify({}),
    });
    assert.equal(noFieldsRes.status, 400, "an empty patch body must be rejected");

    const unchangedSlug = await prisma.restaurant.findUnique({ where: { id: restaurant.id } });
    assert.equal(unchangedSlug?.slug, restaurant.slug, "slug must remain untouched");

    // 6. Cross-tenant access is blocked.
    const crossTenantGetRes = await fetch(`${baseUrl}/${otherRestaurant.id}/settings`, { headers: authed(ownerToken) });
    assert.equal(crossTenantGetRes.status, 403, "a user with no access to otherRestaurant must get 403, not a data leak");

    const noAccessRes = await fetch(`${baseUrl}/${restaurant.id}/settings`, { headers: authed(outsiderToken) });
    assert.equal(noAccessRes.status, 403);

    console.log("restaurantSettings.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, manager.id, staff.id, outsider.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organization.id, otherOrganization.id] } } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("restaurantSettings.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
