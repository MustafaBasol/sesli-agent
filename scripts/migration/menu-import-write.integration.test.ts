/**
 * menu-import-write.integration.test.ts — end-to-end checks for the Phase 40
 * gated menu import write path (backend/src/scripts/menuImportWrite.ts)
 * against a real Postgres database.
 *
 * Needs a live DATABASE_URL (test/staging only — never point this at
 * production) and is NOT wired into any aggregate `npm test`. Run explicitly:
 *
 *   npx tsx scripts/migration/menu-import-write.integration.test.ts
 *   or
 *   npm run test:menu-import-write
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and
 * exits 0. Uses a disposable organization/restaurant created for this run
 * and cleans up everything in `finally`.
 *
 * This file never touches Supabase and never imports from a real export —
 * all sample data here is inline.
 *
 * Policy reference: docs/menu-data-migration-plan.md
 */
import assert from "node:assert/strict";
import { prisma } from "../../backend/src/prisma/client";
import { writeMenuImport, type WriteMenuCategoryInput, type WriteMenuItemInput } from "../../backend/src/scripts/menuImportWrite";

const TEST_TAG = `menuimportwrite_${Date.now()}`;

function category(overrides: Partial<WriteMenuCategoryInput> & { name: string }): WriteMenuCategoryInput {
  return {
    description: null,
    sortOrder: 0,
    status: "active",
    normalizedName: overrides.name.trim().toLowerCase(),
    ...overrides,
  };
}

function item(overrides: Partial<WriteMenuItemInput> & { name: string }): WriteMenuItemInput {
  return {
    sourceCategoryRef: null,
    categoryName: null,
    description: null,
    priceCents: null,
    currency: "EUR",
    allergensJson: undefined,
    dietaryTagsJson: undefined,
    aliasesJson: undefined,
    isAvailable: true,
    status: "active",
    sortOrder: 0,
    normalizedName: overrides.name.trim().toLowerCase(),
    ...overrides,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("menu-import-write.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("menu-import-write.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
    return;
  }

  const organization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org`, status: "active" } });
  const restaurant = await prisma.restaurant.create({
    data: { organizationId: organization.id, name: `${TEST_TAG}_restaurant`, slug: `${TEST_TAG}-restaurant` },
  });

  try {
    const startersName = `${TEST_TAG}-Starters`;
    const mainsName = `${TEST_TAG}-Mains`;

    // 1. Initial import: two categories, three items (one unavailable, one
    //    with an invalid/missing price, one referencing a category by label).
    const firstResult = await writeMenuImport({
      restaurantId: restaurant.id,
      categories: [category({ name: startersName, sortOrder: 1 }), category({ name: mainsName, sortOrder: 2 })],
      items: [
        item({ name: `${TEST_TAG}-Hummus`, categoryName: startersName, priceCents: 850 }),
        item({ name: `${TEST_TAG}-Steak`, categoryName: mainsName, priceCents: null, isAvailable: false, status: "inactive" }),
        item({ name: `${TEST_TAG}-Soup`, priceCents: null }), // no category at all
      ],
    });

    assert.equal(firstResult.categories.created, 2);
    assert.equal(firstResult.categories.updated, 0);
    assert.equal(firstResult.items.created, 3);
    assert.equal(firstResult.items.importedWithNullCategory, 1, "Soup has no category reference");

    const startersRow = await prisma.menuCategory.findFirst({ where: { restaurantId: restaurant.id, name: startersName } });
    assert.ok(startersRow);

    const hummusRow = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id, name: `${TEST_TAG}-Hummus` } });
    assert.ok(hummusRow);
    assert.equal(hummusRow!.categoryId, startersRow!.id, "item with a category label maps to the correct category");
    assert.equal(hummusRow!.priceCents, 850);

    const steakRow = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id, name: `${TEST_TAG}-Steak` } });
    assert.equal(steakRow!.isAvailable, false, "unavailable item maps to isAvailable:false");
    assert.equal(steakRow!.status, "inactive");
    assert.equal(steakRow!.priceCents, null, "invalid/missing price imports as priceCents:null");

    const soupRow = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id, name: `${TEST_TAG}-Soup` } });
    assert.equal(soupRow!.categoryId, null);

    // 2. Re-run with the exact same input -> idempotent, no duplicates created.
    const secondResult = await writeMenuImport({
      restaurantId: restaurant.id,
      categories: [category({ name: startersName, sortOrder: 1 }), category({ name: mainsName, sortOrder: 2 })],
      items: [
        item({ name: `${TEST_TAG}-Hummus`, categoryName: startersName, priceCents: 850 }),
        item({ name: `${TEST_TAG}-Steak`, categoryName: mainsName, priceCents: null, isAvailable: false, status: "inactive" }),
        item({ name: `${TEST_TAG}-Soup`, priceCents: null }),
      ],
    });
    assert.equal(secondResult.categories.created, 0);
    assert.equal(secondResult.categories.unchanged, 2);
    assert.equal(secondResult.items.created, 0);
    assert.equal(secondResult.items.unchanged, 3);

    const totalCategories = await prisma.menuCategory.count({ where: { restaurantId: restaurant.id } });
    assert.equal(totalCategories, 2, "re-running the same input must never create duplicate categories");
    const totalItems = await prisma.menuItem.count({ where: { restaurantId: restaurant.id } });
    assert.equal(totalItems, 3, "re-running the same input must never create duplicate items");

    // 3. Update path: changing a safe field (price) on a re-run updates the
    //    existing row instead of creating a new one.
    const thirdResult = await writeMenuImport({
      restaurantId: restaurant.id,
      categories: [category({ name: startersName, sortOrder: 1 })],
      items: [item({ name: `${TEST_TAG}-Hummus`, categoryName: startersName, priceCents: 950 })],
    });
    assert.equal(thirdResult.items.updated, 1);
    assert.equal(thirdResult.items.created, 0);
    const updatedHummus = await prisma.menuItem.findUnique({ where: { id: hummusRow!.id } });
    assert.equal(updatedHummus!.priceCents, 950);
    const totalItemsAfterUpdate = await prisma.menuItem.count({ where: { restaurantId: restaurant.id } });
    assert.equal(totalItemsAfterUpdate, 3, "updating a field must never create a duplicate row");

    // 4. Orphan category reference with a usable label -> auto-created with a warning.
    const dessertsLabel = `${TEST_TAG}-Desserts`;
    const fourthResult = await writeMenuImport({
      restaurantId: restaurant.id,
      categories: [],
      items: [item({ name: `${TEST_TAG}-Cake`, categoryName: null, sourceCategoryRef: dessertsLabel })],
    });
    assert.equal(fourthResult.categories.created, 1, "unmatched category label auto-creates a category");
    assert.equal(fourthResult.items.autoCreatedCategoryFromItemLabel, 1);
    assert.ok(fourthResult.warnings.some((w) => w.includes(dessertsLabel)));
    const autoCategory = await prisma.menuCategory.findFirst({ where: { restaurantId: restaurant.id, name: dessertsLabel } });
    assert.ok(autoCategory);
    const cakeRow = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id, name: `${TEST_TAG}-Cake` } });
    assert.equal(cakeRow!.categoryId, autoCategory!.id);

    console.log("menu-import-write.integration.test.ts: all checks passed");
  } finally {
    await prisma.menuItem.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.menuCategory.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurant.delete({ where: { id: restaurant.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("menu-import-write.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
