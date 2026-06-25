/**
 * menu-import-dry-run.test.ts — checks for the Phase 39 menu import dry-run
 * helpers and report generation. No real Supabase/database access.
 *
 * Run: npx tsx scripts/migration/menu-import-dry-run.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mapIsAvailable, mapStatus, normalizeMenuName, parsePriceToCents, toBoundedStringArray } from "./menuImportHelpers";

async function main() {
  // parsePriceToCents
  assert.equal(parsePriceToCents(12.5).cents, 1250);
  assert.equal(parsePriceToCents("12.50").cents, 1250);
  assert.equal(parsePriceToCents("12,50").cents, 1250);
  assert.equal(parsePriceToCents("€12.50").cents, 1250);
  assert.equal(parsePriceToCents("1.250,50").cents, 125050, "dot as thousands separator, comma as decimal");
  assert.equal(parsePriceToCents(null).cents, null);
  assert.equal(parsePriceToCents(null).warning, "missing price");
  assert.equal(parsePriceToCents("").warning, "missing price");
  assert.equal(parsePriceToCents("not-a-price").cents, null);
  assert.equal(parsePriceToCents("not-a-price").warning, "invalid price");
  assert.equal(parsePriceToCents(Number.NaN).warning, "invalid price");

  // normalizeMenuName
  assert.equal(normalizeMenuName("  Ribeye   Steak "), "ribeye steak");
  assert.equal(normalizeMenuName(123 as unknown), "");

  // toBoundedStringArray
  assert.deepEqual(toBoundedStringArray(["nuts", "  dairy  ", ""]), ["nuts", "dairy"]);
  assert.equal(toBoundedStringArray([]), undefined);
  assert.equal(toBoundedStringArray("nuts"), undefined);
  assert.equal(toBoundedStringArray(undefined), undefined);

  // mapIsAvailable
  assert.equal(mapIsAvailable({ is_available: false }), false);
  assert.equal(mapIsAvailable({ isAvailable: true }), true);
  assert.equal(mapIsAvailable({ status: "inactive" }), false);
  assert.equal(mapIsAvailable({}), true, "defaults to available when no field is present");

  // mapStatus
  assert.equal(mapStatus({ status: "inactive" }), "inactive");
  assert.equal(mapStatus({ is_active: false }), "inactive");
  assert.equal(mapStatus({}), "active");

  // Report generation against a tiny fake local fixture (throwaway temp dir,
  // not the committed sample-input — keeps this test self-contained).
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "menu-import-dry-run-test-"));
  try {
    fs.writeFileSync(
      path.join(tmpDir, "menu_categories.json"),
      JSON.stringify([
        { id: 1, name: "Starters", display_order: 1 },
        { id: 2, name: "Mains", display_order: 2 },
        { id: 3, name: "starters", display_order: 3 },
      ])
    );
    fs.writeFileSync(
      path.join(tmpDir, "menu_items.json"),
      JSON.stringify([
        { id: 10, name: "Hummus", category: "Starters", price: "8,50" },
        { id: 11, name: "Hummus", category: "Starters", price: 8.5 },
        { id: 12, name: "Steak", category: "Mains", price: "not-a-price" },
        { id: 13, name: "Soup", price: null },
        { id: 14, name: "Mystery Dish", category: "Unknown Category", price: 5 },
      ])
    );

    const { __buildReportForTest } = await import("./menu-import-dry-run");
    const report = __buildReportForTest(tmpDir, "test-restaurant-id");

    assert.equal(report.dryRun, true);
    assert.equal(report.writeEnabled, false);
    assert.equal(report.targetRestaurantId, "test-restaurant-id");

    assert.equal(report.counts.categoriesRead, 3);
    assert.equal(report.counts.validCategories, 2, "duplicate normalized category name is not double-counted");
    assert.equal(report.counts.duplicateCategoryNames, 1);
    assert.deepEqual(report.duplicateCategoryNamesList, ["starters"]);

    assert.equal(report.counts.itemsRead, 5);
    assert.equal(report.counts.validItems, 5, "all records have a name, none are skipped");
    assert.equal(report.counts.duplicateItemNames, 1, "second Hummus/Starters is a duplicate");
    assert.equal(report.counts.invalidPrice, 1);
    assert.equal(report.counts.missingPrice, 1);
    assert.equal(report.counts.missingCategory, 1, "Soup has no category reference");
    assert.equal(report.counts.orphanCategoryReferences, 1, "Mystery Dish references an unknown category");

    const hummus = report.proposedItemMappings.find((i) => i.sourceItemId === 10);
    assert.ok(hummus);
    assert.equal(hummus!.priceCents, 850);
    assert.equal(hummus!.categoryName, "Starters");

    assert.equal(fs.existsSync(path.join(tmpDir, "menu_categories.json")), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // No source files at all -> errors flagged, never crashes.
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "menu-import-dry-run-empty-"));
  try {
    const { __buildReportForTest } = await import("./menu-import-dry-run");
    const report = __buildReportForTest(emptyDir, "test-restaurant-id");
    assert.equal(report.counts.categoriesRead, 0);
    assert.equal(report.counts.itemsRead, 0);
    assert.ok(report.errors.length > 0);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }

  console.log("menu-import-dry-run.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("menu-import-dry-run.test.ts failed:", err);
  process.exitCode = 1;
});
