/**
 * menu.integration.test.ts — end-to-end checks for the Phase 37 menu
 * category/item list/detail/create/update API against a real Postgres
 * database.
 *
 * Needs a live DATABASE_URL and is NOT wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/menu.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 *
 * Scenarios covered:
 *  - Missing/invalid bearer token is rejected with 401.
 *  - OWNER/MANAGER can create/update categories and items; STAFF can only read.
 *  - Category create validation (name required, duplicate name -> 409).
 *  - Item create validation (categoryId must belong to same restaurant).
 *  - List filters: search/category/status/isAvailable.
 *  - Update item price/availability/status/category safely.
 *  - Category list includes item count.
 *  - Cross-tenant access is blocked (403 list / 404 detail), never a data leak.
 *  - Pagination works.
 *  - Responses never expose raw/internal fields (rawPayload, stateJson).
 *  - No hard delete endpoint exists.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { signAuthToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";

const TEST_TAG = `menutest_${Date.now()}`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("menu.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("menu.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
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

  const categoryA = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: `${TEST_TAG}-Starters`, sortOrder: 1 },
  });
  const categoryB = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: `${TEST_TAG}-Mains`, sortOrder: 2, status: "inactive" },
  });
  const otherCategory = await prisma.menuCategory.create({
    data: { restaurantId: otherRestaurant.id, name: `${TEST_TAG}-Other` },
  });

  const itemA = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: categoryA.id,
      name: `${TEST_TAG}-Soup`,
      priceCents: 850,
      currency: "EUR",
    },
  });
  const itemB = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: categoryB.id,
      name: `${TEST_TAG}-Steak`,
      priceCents: 2400,
      isAvailable: false,
    },
  });
  const otherItem = await prisma.menuItem.create({
    data: { restaurantId: otherRestaurant.id, name: `${TEST_TAG}-OtherItem` },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/restaurants`;

  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  try {
    // 1. Missing token -> 401.
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/menu/categories`);
    assert.equal(noAuthRes.status, 401, "missing bearer token must be rejected with 401");

    // 2. Invalid token -> 401.
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/menu/categories`, { headers: authed("not-a-real-token") });
    assert.equal(badAuthRes.status, 401, "invalid bearer token must be rejected with 401");

    // 3. STAFF can list categories; response includes item counts, no raw fields.
    const catListRes = await fetch(`${baseUrl}/${restaurant.id}/menu/categories`, { headers: authed(staffToken) });
    assert.equal(catListRes.status, 200);
    const catListText = await catListRes.text();
    assert.ok(!catListText.includes("rawPayload"), "category list must never include rawPayload");
    assert.ok(!catListText.includes("stateJson"), "category list must never include stateJson");
    const catListBody = JSON.parse(catListText) as {
      data: Array<{ id: string; itemCount: number; status: string }>;
      pagination: { total: number };
    };
    assert.equal(catListBody.pagination.total, 2, "list must only include this restaurant's categories");
    assert.ok(!catListBody.data.some((c) => c.id === otherCategory.id), "must never include another tenant's category");
    const categoryARow = catListBody.data.find((c) => c.id === categoryA.id);
    assert.equal(categoryARow?.itemCount, 1);

    // 4. Status filter on categories.
    const inactiveCatRes = await fetch(`${baseUrl}/${restaurant.id}/menu/categories?status=inactive`, { headers: authed(staffToken) });
    const inactiveCatBody = (await inactiveCatRes.json()) as { data: Array<{ id: string }> };
    assert.equal(inactiveCatBody.data.length, 1);
    assert.equal(inactiveCatBody.data[0].id, categoryB.id);

    // 5. STAFF cannot create a category.
    const staffCatCreateRes = await fetch(`${baseUrl}/${restaurant.id}/menu/categories`, {
      method: "POST",
      headers: { ...authed(staffToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${TEST_TAG}-Desserts` }),
    });
    assert.equal(staffCatCreateRes.status, 403, "STAFF must not be able to create categories");

    // 6. MANAGER can create a category.
    const managerCatCreateRes = await fetch(`${baseUrl}/${restaurant.id}/menu/categories`, {
      method: "POST",
      headers: { ...authed(managerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${TEST_TAG}-Desserts`, sortOrder: 3 }),
    });
    assert.equal(managerCatCreateRes.status, 201);
    const createdCategory = (await managerCatCreateRes.json()) as { id: string; status: string };
    assert.equal(createdCategory.status, "active");

    // 7. Duplicate category name within the same restaurant -> 409.
    const dupCatRes = await fetch(`${baseUrl}/${restaurant.id}/menu/categories`, {
      method: "POST",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name: categoryA.name }),
    });
    assert.equal(dupCatRes.status, 409);

    // 8. Missing name -> 400.
    const invalidCatRes = await fetch(`${baseUrl}/${restaurant.id}/menu/categories`, {
      method: "POST",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(invalidCatRes.status, 400);

    // 9. OWNER can update a category.
    const ownerCatUpdateRes = await fetch(`${baseUrl}/${restaurant.id}/menu/categories/${createdCategory.id}`, {
      method: "PATCH",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "inactive" }),
    });
    assert.equal(ownerCatUpdateRes.status, 200);
    const updatedCategory = (await ownerCatUpdateRes.json()) as { status: string };
    assert.equal(updatedCategory.status, "inactive");

    // 10. STAFF can list items; search/category/status/isAvailable filters.
    const itemListRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items`, { headers: authed(staffToken) });
    assert.equal(itemListRes.status, 200);
    const itemListText = await itemListRes.text();
    assert.ok(!itemListText.includes("rawPayload"), "item list must never include rawPayload");
    const itemListBody = JSON.parse(itemListText) as {
      data: Array<{ id: string; priceCents: number | null; isAvailable: boolean }>;
      pagination: { total: number };
    };
    assert.equal(itemListBody.pagination.total, 2, "list must only include this restaurant's items");
    assert.ok(!itemListBody.data.some((i) => i.id === otherItem.id), "must never include another tenant's item");

    const categoryFilterRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items?categoryId=${categoryA.id}`, { headers: authed(staffToken) });
    const categoryFilterBody = (await categoryFilterRes.json()) as { data: Array<{ id: string }> };
    assert.equal(categoryFilterBody.data.length, 1);
    assert.equal(categoryFilterBody.data[0].id, itemA.id);

    const availFilterRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items?isAvailable=false`, { headers: authed(staffToken) });
    const availFilterBody = (await availFilterRes.json()) as { data: Array<{ id: string }> };
    assert.equal(availFilterBody.data.length, 1);
    assert.equal(availFilterBody.data[0].id, itemB.id);

    const searchRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items?search=Soup`, { headers: authed(staffToken) });
    const searchBody = (await searchRes.json()) as { data: Array<{ id: string }> };
    assert.ok(searchBody.data.some((i) => i.id === itemA.id));

    // 11. Pagination.
    const pageRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items?page=1&pageSize=1`, { headers: authed(staffToken) });
    const pageBody = (await pageRes.json()) as { data: unknown[]; pagination: { totalPages: number } };
    assert.equal(pageBody.data.length, 1);
    assert.equal(pageBody.pagination.totalPages, 2);

    // 12. STAFF cannot create an item.
    const staffItemCreateRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items`, {
      method: "POST",
      headers: { ...authed(staffToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${TEST_TAG}-Salad` }),
    });
    assert.equal(staffItemCreateRes.status, 403, "STAFF must not be able to create items");

    // 13. MANAGER can create an item without a price (price is not mandatory).
    const managerItemCreateRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items`, {
      method: "POST",
      headers: { ...authed(managerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${TEST_TAG}-Salad`, allergensJson: ["nuts"], aliasesJson: ["green salad"] }),
    });
    assert.equal(managerItemCreateRes.status, 201);
    const createdItem = (await managerItemCreateRes.json()) as { id: string; priceCents: number | null; allergens: string[] };
    assert.equal(createdItem.priceCents, null);
    assert.deepEqual(createdItem.allergens, ["nuts"]);

    // 14. categoryId from another restaurant is rejected.
    const crossCategoryItemRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items`, {
      method: "POST",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${TEST_TAG}-BadItem`, categoryId: otherCategory.id }),
    });
    assert.equal(crossCategoryItemRes.status, 400, "categoryId from another restaurant must be rejected");

    // 15. OWNER can update item price/availability/status/category.
    const ownerItemUpdateRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items/${createdItem.id}`, {
      method: "PATCH",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ priceCents: 1200, isAvailable: false, status: "inactive", categoryId: categoryA.id }),
    });
    assert.equal(ownerItemUpdateRes.status, 200);
    const updatedItem = (await ownerItemUpdateRes.json()) as {
      priceCents: number;
      isAvailable: boolean;
      status: string;
      categoryId: string;
    };
    assert.equal(updatedItem.priceCents, 1200);
    assert.equal(updatedItem.isAvailable, false);
    assert.equal(updatedItem.status, "inactive");
    assert.equal(updatedItem.categoryId, categoryA.id);

    // 16. STAFF cannot update an item.
    const staffItemUpdateRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items/${createdItem.id}`, {
      method: "PATCH",
      headers: { ...authed(staffToken), "Content-Type": "application/json" },
      body: JSON.stringify({ priceCents: 999 }),
    });
    assert.equal(staffItemUpdateRes.status, 403, "STAFF must not be able to update items");

    // 17. Moving an item to a category from another restaurant is rejected.
    const crossCategoryUpdateRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items/${createdItem.id}`, {
      method: "PATCH",
      headers: { ...authed(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: otherCategory.id }),
    });
    assert.equal(crossCategoryUpdateRes.status, 400, "moving an item to another tenant's category must be rejected");

    // 18. Cross-tenant list: a user with no access to otherRestaurant must get 403.
    const crossTenantListRes = await fetch(`${baseUrl}/${otherRestaurant.id}/menu/categories`, { headers: authed(staffToken) });
    assert.equal(crossTenantListRes.status, 403, "a user with no access to otherRestaurant must get 403, not a data leak");

    // 19. Cross-tenant detail: another tenant's item id under this restaurant's scope must 404.
    const crossTenantDetailRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items/${otherItem.id}`, {
      headers: authed(ownerToken),
    });
    assert.equal(crossTenantDetailRes.status, 404, "an item id belonging to another restaurant must 404 under this restaurant's scope");

    // 20. No hard-delete endpoint exists (deactivate via PATCH status instead).
    const deleteRes = await fetch(`${baseUrl}/${restaurant.id}/menu/items/${createdItem.id}`, {
      method: "DELETE",
      headers: authed(ownerToken),
    });
    assert.equal(deleteRes.status, 404, "no DELETE route should exist for menu items");

    console.log("menu.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.menuCategory.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, manager.id, staff.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("menu.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
