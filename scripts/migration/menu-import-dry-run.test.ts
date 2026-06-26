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
import {
  evaluateThresholdWarnings,
  mapIsAvailable,
  mapStatus,
  normalizeMenuName,
  parsePriceToCents,
  toBoundedStringArray,
} from "./menuImportHelpers";
import { evaluateWriteModeGates } from "./menuImportWriteGates";
import { buildMarkdownSummary } from "./menuImportMarkdownSummary";

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

    // Phase 40 write-mode counter blocks exist and mirror the dry-run counts
    // (write mode never ran, so created/updated/etc. stay at zero).
    assert.equal(report.categories.read, 3);
    assert.equal(report.categories.valid, 2);
    assert.equal(report.categories.duplicateSkipped, 1);
    assert.equal(report.categories.created, 0);
    assert.equal(report.items.read, 5);
    assert.equal(report.items.valid, 5);
    assert.equal(report.items.duplicateSkipped, 1);
    assert.equal(report.items.created, 0);
    assert.deepEqual(report.writeModeSafety, {
      writeEnabled: false,
      confirmationMatched: false,
      productionAllowed: false,
      productionConfirmationProvided: false,
    });

    // Phase 41 — this fixture has missing/invalid price and a duplicate item,
    // both of which should surface as non-blocking threshold warnings, and
    // the markdown summary should recommend NO-GO as a result.
    assert.ok(report.thresholdWarnings.length > 0);
    const markdown = buildMarkdownSummary(report);
    assert.ok(markdown.includes("**NO-GO**"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Phase 41 — real input directory path handling: an arbitrary directory
  // path (mirroring scripts/migration/menu-input-real/) is read the same way
  // as any other input dir, no special-casing, no write mode triggered.
  const realLikeDir = fs.mkdtempSync(path.join(os.tmpdir(), "menu-input-real-"));
  try {
    fs.writeFileSync(path.join(realLikeDir, "menu_categories.json"), JSON.stringify([{ id: 1, name: "Mains", display_order: 1 }]));
    fs.writeFileSync(
      path.join(realLikeDir, "menu_items.json"),
      JSON.stringify([{ id: 1, name: "Steak", category: "Mains", price: "12.00" }])
    );

    const { __buildReportForTest } = await import("./menu-import-dry-run");
    const report = __buildReportForTest(realLikeDir, "94581a20-a09a-4c9c-8ccb-88ab4e6df19f");

    assert.equal(report.dryRun, true);
    assert.equal(report.writeEnabled, false);
    assert.equal(report.inputDir, realLikeDir);
    assert.equal(report.counts.categoriesRead, 1);
    assert.equal(report.counts.itemsRead, 1);
    assert.deepEqual(report.thresholdWarnings, [], "a clean small dataset has no threshold warnings");

    const markdown = buildMarkdownSummary(report);
    assert.ok(markdown.includes("# Menu import dry-run report"));
    assert.ok(markdown.includes("**GO**"), "clean dataset recommends GO");
  } finally {
    fs.rmSync(realLikeDir, { recursive: true, force: true });
  }

  // evaluateThresholdWarnings — pure warning-threshold checks (Phase 41).
  {
    const noWarnings = evaluateThresholdWarnings({
      categoriesRead: 5,
      itemsRead: 10,
      validItems: 10,
      missingPrice: 0,
      invalidPrice: 0,
      orphanCategoryReferences: 0,
      duplicateItemNames: 0,
    });
    assert.deepEqual(noWarnings, []);
  }
  {
    const zeroRead = evaluateThresholdWarnings({
      categoriesRead: 0,
      itemsRead: 0,
      validItems: 0,
      missingPrice: 0,
      invalidPrice: 0,
      orphanCategoryReferences: 0,
      duplicateItemNames: 0,
    });
    assert.ok(zeroRead.some((w) => w.includes("0 categories read")));
    assert.ok(zeroRead.some((w) => w.includes("0 items read")));
  }
  {
    // 3 of 10 items (30%) have invalid/missing price -> exceeds the 20% threshold.
    const badPrice = evaluateThresholdWarnings({
      categoriesRead: 1,
      itemsRead: 10,
      validItems: 10,
      missingPrice: 2,
      invalidPrice: 1,
      orphanCategoryReferences: 0,
      duplicateItemNames: 0,
    });
    assert.ok(badPrice.some((w) => w.includes("missing/invalid price")));
  }
  {
    // 3 of 10 items (30%) have orphan category references -> exceeds the 20% threshold.
    const orphans = evaluateThresholdWarnings({
      categoriesRead: 1,
      itemsRead: 10,
      validItems: 10,
      missingPrice: 0,
      invalidPrice: 0,
      orphanCategoryReferences: 3,
      duplicateItemNames: 0,
    });
    assert.ok(orphans.some((w) => w.includes("orphan category references")));
  }
  {
    const duplicates = evaluateThresholdWarnings({
      categoriesRead: 1,
      itemsRead: 10,
      validItems: 10,
      missingPrice: 0,
      invalidPrice: 0,
      orphanCategoryReferences: 0,
      duplicateItemNames: 2,
    });
    assert.ok(duplicates.some((w) => w.includes("duplicate item name+category")));
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

  // evaluateWriteModeGates — pure write-mode safety gate checks (Phase 40).
  // Each call passes an explicit env object; process.env is never touched.
  const baseWriteEnv = {
    MENU_IMPORT_WRITE_ENABLED: "true",
    MENU_IMPORT_RESTAURANT_ID: "rest-1",
    MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID: "rest-1",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  };

  // Dry-run remains the default when MENU_IMPORT_WRITE_ENABLED is unset.
  {
    const gates = evaluateWriteModeGates({});
    assert.equal(gates.writeRequested, false);
    assert.equal(gates.canWrite, false);
  }

  // All gates satisfied -> write may proceed.
  {
    const gates = evaluateWriteModeGates(baseWriteEnv);
    assert.equal(gates.writeRequested, true);
    assert.equal(gates.canWrite, true);
    assert.deepEqual(gates.abortReasons, []);
  }

  // Missing DATABASE_URL -> abort.
  {
    const { DATABASE_URL, ...rest } = baseWriteEnv;
    const gates = evaluateWriteModeGates(rest);
    assert.equal(gates.canWrite, false);
    assert.ok(gates.abortReasons.some((r) => r.includes("DATABASE_URL")));
  }

  // Confirmation restaurant id mismatch -> abort.
  {
    const gates = evaluateWriteModeGates({ ...baseWriteEnv, MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID: "rest-2" });
    assert.equal(gates.canWrite, false);
    assert.equal(gates.safety.confirmationMatched, false);
    assert.ok(gates.abortReasons.some((r) => r.includes("does not match")));
  }

  // Production mode without explicit override -> abort.
  {
    const gates = evaluateWriteModeGates({ ...baseWriteEnv, NODE_ENV: "production" });
    assert.equal(gates.canWrite, false);
    assert.ok(gates.abortReasons.some((r) => r.includes("NODE_ENV=production")));
  }

  // Production mode with both required overrides -> allowed.
  {
    const gates = evaluateWriteModeGates({
      ...baseWriteEnv,
      NODE_ENV: "production",
      MENU_IMPORT_ALLOW_PRODUCTION: "true",
      MENU_IMPORT_PRODUCTION_CONFIRMATION: "I_UNDERSTAND_THIS_WRITES_MENU_DATA",
    });
    assert.equal(gates.canWrite, true);
  }

  // Phase 43 — replace mode gate checks (pure, no DB).

  // Replace mode not requested by default.
  {
    const gates = evaluateWriteModeGates(baseWriteEnv);
    assert.equal(gates.replace.requested, false);
    assert.equal(gates.replace.allowed, false);
    assert.deepEqual(gates.replace.abortReasons, []);
  }

  // Replace mode requested but no confirmation -> not allowed.
  {
    const gates = evaluateWriteModeGates({ ...baseWriteEnv, MENU_IMPORT_REPLACE_EXISTING: "true" });
    assert.equal(gates.replace.requested, true);
    assert.equal(gates.replace.allowed, false);
    assert.ok(gates.replace.abortReasons.some((r) => r.includes("MENU_IMPORT_REPLACE_CONFIRMATION")));
  }

  // Replace mode with wrong phrase -> not allowed.
  {
    const gates = evaluateWriteModeGates({
      ...baseWriteEnv,
      MENU_IMPORT_REPLACE_EXISTING: "true",
      MENU_IMPORT_REPLACE_CONFIRMATION: "not-the-right-phrase",
    });
    assert.equal(gates.replace.allowed, false);
    assert.equal(gates.replace.confirmationMatched, false);
  }

  // Replace mode with exact phrase and all write gates -> allowed.
  {
    const gates = evaluateWriteModeGates({
      ...baseWriteEnv,
      MENU_IMPORT_REPLACE_EXISTING: "true",
      MENU_IMPORT_REPLACE_CONFIRMATION: "I_UNDERSTAND_THIS_WILL_DISABLE_MENU_RECORDS_NOT_IN_SOURCE",
    });
    assert.equal(gates.replace.requested, true);
    assert.equal(gates.replace.confirmationMatched, true);
    assert.equal(gates.replace.allowed, true);
    assert.deepEqual(gates.replace.abortReasons, []);
  }

  // Replace mode cannot run without write mode enabled.
  {
    const gates = evaluateWriteModeGates({
      MENU_IMPORT_REPLACE_EXISTING: "true",
      MENU_IMPORT_REPLACE_CONFIRMATION: "I_UNDERSTAND_THIS_WILL_DISABLE_MENU_RECORDS_NOT_IN_SOURCE",
    });
    assert.equal(gates.canWrite, false);
    assert.equal(gates.replace.allowed, false);
    assert.ok(gates.replace.abortReasons.some((r) => r.includes("MENU_IMPORT_WRITE_ENABLED")));
  }

  // Replace mode not allowed when write gate fails (restaurant id mismatch).
  {
    const gates = evaluateWriteModeGates({
      ...baseWriteEnv,
      MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID: "wrong-id",
      MENU_IMPORT_REPLACE_EXISTING: "true",
      MENU_IMPORT_REPLACE_CONFIRMATION: "I_UNDERSTAND_THIS_WILL_DISABLE_MENU_RECORDS_NOT_IN_SOURCE",
    });
    assert.equal(gates.canWrite, false);
    assert.equal(gates.replace.allowed, false, "replace must be blocked when write gate fails");
  }

  console.log("menu-import-dry-run.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("menu-import-dry-run.test.ts failed:", err);
  process.exitCode = 1;
});
