/**
 * menu-import-replace.integration.test.ts — Phase 43 integration tests for
 * the replace mode added to backend/src/scripts/menuImportWrite.ts.
 *
 * Requires a live DATABASE_URL (test/staging only — never point this at
 * production). If DATABASE_URL is unset or unreachable, the test exits 0
 * with a skip notice. Creates and cleans up a disposable restaurant.
 *
 * Run:
 *   DATABASE_URL=... npx tsx scripts/migration/menu-import-replace.integration.test.ts
 *   npm run test:menu-import-replace
 */
import assert from "node:assert/strict";
import { prisma } from "../../backend/src/prisma/client";
import { writeMenuImport, type WriteMenuCategoryInput, type WriteMenuItemInput } from "../../backend/src/scripts/menuImportWrite";
import { evaluateWriteModeGates, REPLACE_CONFIRMATION_PHRASE } from "./menuImportWriteGates";

const TEST_TAG = `menureplace_${Date.now()}`;

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
    console.log("menu-import-replace.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("menu-import-replace.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
    return;
  }

  const organization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org`, status: "active" } });
  const restaurant = await prisma.restaurant.create({
    data: { organizationId: organization.id, name: `${TEST_TAG}_restaurant`, slug: `${TEST_TAG}-restaurant` },
  });

  try {
    const catNameA = `${TEST_TAG}-Starters`;
    const catNameB = `${TEST_TAG}-Mains`;
    const catNameOld = `${TEST_TAG}-OldDemo`;

    // 1. Seed two source categories and four items, plus one "old/demo" category + item.
    const seedResult = await writeMenuImport({
      restaurantId: restaurant.id,
      categories: [category({ name: catNameA, sortOrder: 1 }), category({ name: catNameB, sortOrder: 2 }), category({ name: catNameOld, sortOrder: 99 })],
      items: [
        item({ name: `${TEST_TAG}-Hummus`, categoryName: catNameA, priceCents: 850 }),
        item({ name: `${TEST_TAG}-Steak`, categoryName: catNameB, priceCents: 2500 }),
        item({ name: `${TEST_TAG}-OldItem1` }),
        item({ name: `${TEST_TAG}-OldItem2` }),
      ],
    });
    assert.equal(seedResult.categories.created, 3);
    assert.equal(seedResult.items.created, 4);
    assert.equal(seedResult.replace.enabled, false, "replace mode should not run by default");
    assert.equal(seedResult.replace.dbOnlyCategoryCount, 0);
    assert.equal(seedResult.replace.dbOnlyItemCount, 0);

    const totalCategoriesAfterSeed = await prisma.menuCategory.count({ where: { restaurantId: restaurant.id } });
    const totalItemsAfterSeed = await prisma.menuItem.count({ where: { restaurantId: restaurant.id } });
    assert.equal(totalCategoriesAfterSeed, 3);
    assert.equal(totalItemsAfterSeed, 4);

    // 2. Upsert-only (no replace) with only the real source — old records remain.
    const upsertOnlyResult = await writeMenuImport({
      restaurantId: restaurant.id,
      categories: [category({ name: catNameA, sortOrder: 1 }), category({ name: catNameB, sortOrder: 2 })],
      items: [
        item({ name: `${TEST_TAG}-Hummus`, categoryName: catNameA, priceCents: 850 }),
        item({ name: `${TEST_TAG}-Steak`, categoryName: catNameB, priceCents: 2500 }),
      ],
      replaceMode: false,
    });
    assert.equal(upsertOnlyResult.replace.enabled, false);
    assert.equal(upsertOnlyResult.replace.dbOnlyCategoryCount, 0);
    assert.equal(upsertOnlyResult.replace.dbOnlyItemCount, 0);

    const totalCategoriesAfterUpsert = await prisma.menuCategory.count({ where: { restaurantId: restaurant.id } });
    const totalItemsAfterUpsert = await prisma.menuItem.count({ where: { restaurantId: restaurant.id } });
    assert.equal(totalCategoriesAfterUpsert, 3, "upsert-only must not remove old categories");
    assert.equal(totalItemsAfterUpsert, 4, "upsert-only must not remove old items");

    // 3. Replace mode enabled — DB-only records are soft-disabled.
    const replaceResult = await writeMenuImport({
      restaurantId: restaurant.id,
      categories: [category({ name: catNameA, sortOrder: 1 }), category({ name: catNameB, sortOrder: 2 })],
      items: [
        item({ name: `${TEST_TAG}-Hummus`, categoryName: catNameA, priceCents: 850 }),
        item({ name: `${TEST_TAG}-Steak`, categoryName: catNameB, priceCents: 2500 }),
      ],
      replaceMode: true,
    });

    assert.equal(replaceResult.replace.enabled, true);
    assert.equal(replaceResult.replace.dbOnlyCategoryCount, 1, "one DB-only category (OldDemo)");
    assert.equal(replaceResult.replace.dbOnlyItemCount, 2, "two DB-only items (OldItem1, OldItem2)");
    assert.equal(replaceResult.replace.disabledCategories, 1);
    assert.equal(replaceResult.replace.disabledItems, 2);
    assert.ok(replaceResult.replace.disabledCategoryNames.some((n) => n.includes("OldDemo")));
    assert.ok(replaceResult.replace.disabledItemNames.some((n) => n.includes("OldItem1")));
    assert.ok(replaceResult.replace.disabledItemNames.some((n) => n.includes("OldItem2")));

    // Rows still exist — only status/isAvailable changed.
    const oldCat = await prisma.menuCategory.findFirst({ where: { restaurantId: restaurant.id, name: catNameOld } });
    assert.ok(oldCat, "DB-only category must not be hard-deleted");
    assert.equal(oldCat!.status, "inactive", "DB-only category must be soft-disabled");

    const oldItem1 = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id, name: `${TEST_TAG}-OldItem1` } });
    assert.ok(oldItem1, "DB-only item must not be hard-deleted");
    assert.equal(oldItem1!.status, "inactive");
    assert.equal(oldItem1!.isAvailable, false);

    // Total row count is unchanged — soft-disable never deletes.
    const totalCategoriesAfterReplace = await prisma.menuCategory.count({ where: { restaurantId: restaurant.id } });
    const totalItemsAfterReplace = await prisma.menuItem.count({ where: { restaurantId: restaurant.id } });
    assert.equal(totalCategoriesAfterReplace, 3, "no hard deletes — total category count unchanged");
    assert.equal(totalItemsAfterReplace, 4, "no hard deletes — total item count unchanged");

    // Source records are still active.
    const hummus = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id, name: `${TEST_TAG}-Hummus` } });
    assert.equal(hummus!.status, "active");
    assert.equal(hummus!.isAvailable, true);

    // 4. Idempotency: rerun replace mode → already-disabled records are skipped.
    const idempotentResult = await writeMenuImport({
      restaurantId: restaurant.id,
      categories: [category({ name: catNameA, sortOrder: 1 }), category({ name: catNameB, sortOrder: 2 })],
      items: [
        item({ name: `${TEST_TAG}-Hummus`, categoryName: catNameA, priceCents: 850 }),
        item({ name: `${TEST_TAG}-Steak`, categoryName: catNameB, priceCents: 2500 }),
      ],
      replaceMode: true,
    });
    assert.equal(idempotentResult.replace.dbOnlyCategoryCount, 1);
    assert.equal(idempotentResult.replace.dbOnlyItemCount, 2);
    assert.equal(idempotentResult.replace.disabledCategories, 0, "already disabled → skipped");
    assert.equal(idempotentResult.replace.disabledItems, 0, "already disabled → skipped");
    assert.equal(idempotentResult.replace.skippedActions, 3, "1 category + 2 items already disabled");

    console.log("menu-import-replace.integration.test.ts: all checks passed");
  } finally {
    await prisma.menuItem.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.menuCategory.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurant.delete({ where: { id: restaurant.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

// --- Pure gate tests (no DB) ---

function gateTests() {
  const baseWriteEnv = {
    MENU_IMPORT_WRITE_ENABLED: "true",
    MENU_IMPORT_RESTAURANT_ID: "rest-1",
    MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID: "rest-1",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  };

  // Replace mode disabled by default.
  {
    const gates = evaluateWriteModeGates(baseWriteEnv);
    assert.equal(gates.replace.requested, false);
    assert.equal(gates.replace.allowed, false);
  }

  // Replace mode requested but no confirmation → not allowed.
  {
    const gates = evaluateWriteModeGates({ ...baseWriteEnv, MENU_IMPORT_REPLACE_EXISTING: "true" });
    assert.equal(gates.replace.requested, true);
    assert.equal(gates.replace.allowed, false);
    assert.ok(gates.replace.abortReasons.some((r) => r.includes("MENU_IMPORT_REPLACE_CONFIRMATION")));
  }

  // Replace mode with wrong confirmation phrase → not allowed.
  {
    const gates = evaluateWriteModeGates({
      ...baseWriteEnv,
      MENU_IMPORT_REPLACE_EXISTING: "true",
      MENU_IMPORT_REPLACE_CONFIRMATION: "wrong-phrase",
    });
    assert.equal(gates.replace.allowed, false);
    assert.equal(gates.replace.confirmationMatched, false);
  }

  // Replace mode with exact phrase → allowed (when write gates pass).
  {
    const gates = evaluateWriteModeGates({
      ...baseWriteEnv,
      MENU_IMPORT_REPLACE_EXISTING: "true",
      MENU_IMPORT_REPLACE_CONFIRMATION: REPLACE_CONFIRMATION_PHRASE,
    });
    assert.equal(gates.replace.requested, true);
    assert.equal(gates.replace.confirmationMatched, true);
    assert.equal(gates.replace.allowed, true);
    assert.deepEqual(gates.replace.abortReasons, []);
  }

  // Replace mode requested without write mode → not allowed, correct reason.
  {
    const gates = evaluateWriteModeGates({
      MENU_IMPORT_REPLACE_EXISTING: "true",
      MENU_IMPORT_REPLACE_CONFIRMATION: REPLACE_CONFIRMATION_PHRASE,
    });
    assert.equal(gates.replace.allowed, false);
    assert.ok(gates.replace.abortReasons.some((r) => r.includes("MENU_IMPORT_WRITE_ENABLED")));
  }

  // Replace mode allowed only when ALL write gates also pass.
  {
    const gates = evaluateWriteModeGates({
      ...baseWriteEnv,
      MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID: "wrong-restaurant",
      MENU_IMPORT_REPLACE_EXISTING: "true",
      MENU_IMPORT_REPLACE_CONFIRMATION: REPLACE_CONFIRMATION_PHRASE,
    });
    assert.equal(gates.canWrite, false);
    assert.equal(gates.replace.allowed, false, "replace must not be allowed if write gates fail");
  }

  console.log("menu-import-replace.integration.test.ts: gate tests passed");
}

gateTests();

main().catch(async (err) => {
  console.error("menu-import-replace.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
