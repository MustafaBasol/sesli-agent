/**
 * menu-import-dry-run.ts — Phase 39 menu data migration/import dry-run.
 *
 * This script is READ-ONLY. It does not connect to Supabase, does not write
 * to the backend database, and does not perform a real import. It reads
 * local JSON export files from a directory, normalizes/validates/maps them
 * against the backend MenuCategory/MenuItem shape, and produces a JSON
 * report describing what a future write import *would* do.
 *
 * Policy reference: docs/menu-data-migration-plan.md
 * Run:
 *   MENU_IMPORT_RESTAURANT_ID=<id> npx tsx scripts/migration/menu-import-dry-run.ts
 *   (optionally set MENU_IMPORT_INPUT_DIR to override the default
 *   scripts/migration/menu-input directory)
 */
import fs from "node:fs";
import path from "node:path";
import {
  mapIsAvailable,
  mapStatus,
  normalizeMenuName,
  parsePriceToCents,
  readCategoryReference,
  readSortOrder,
  readSourceId,
  toBoundedStringArray,
} from "./menuImportHelpers";
import type { MappedMenuCategory, MappedMenuItem, MenuImportReport, SourceMenuCategory, SourceMenuItem } from "./menuImportTypes";
import { evaluateWriteModeGates } from "./menuImportWriteGates";

const SOURCE_FILES = ["menu_categories.json", "menu_items.json"] as const;

const DEFAULT_INPUT_DIR = path.join(process.cwd(), "scripts/migration/menu-input");

function readJsonArray(filePath: string): unknown[] | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function buildCategoryMappings(
  records: SourceMenuCategory[],
  report: MenuImportReport
): { byNormalizedName: Map<string, MappedMenuCategory>; duplicateNames: string[] } {
  const byNormalizedName = new Map<string, MappedMenuCategory>();
  const duplicateNames: string[] = [];

  records.forEach((record, index) => {
    if (typeof record !== "object" || record === null) {
      report.warnings.push(`menu_categories.json: record ${index} is not an object, skipped`);
      report.counts.skippedCategories += 1;
      return;
    }
    const obj = record as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) {
      report.warnings.push(`menu_categories.json: record ${index} missing name, skipped`);
      report.counts.skippedCategories += 1;
      return;
    }

    const normalizedName = normalizeMenuName(name);
    const status = mapStatus(obj);
    if (status === "inactive") report.counts.inactiveCategories += 1;

    const mapped: MappedMenuCategory = {
      sourceCategoryId: readSourceId(obj),
      name,
      normalizedName,
      description: typeof obj.description === "string" ? obj.description : null,
      sortOrder: readSortOrder(obj),
      status,
    };

    if (byNormalizedName.has(normalizedName)) {
      duplicateNames.push(name);
      report.warnings.push(`menu_categories.json: duplicate category name "${name}" (record ${index}), keeping first occurrence`);
    } else {
      byNormalizedName.set(normalizedName, mapped);
      report.counts.validCategories += 1;
    }
  });

  return { byNormalizedName, duplicateNames };
}

function buildItemMappings(
  records: SourceMenuItem[],
  categoriesByNormalizedName: Map<string, MappedMenuCategory>,
  report: MenuImportReport
): { mapped: MappedMenuItem[]; duplicateKeys: string[] } {
  const mapped: MappedMenuItem[] = [];
  const seenKeys = new Set<string>();
  const duplicateKeys: string[] = [];

  records.forEach((record, index) => {
    if (typeof record !== "object" || record === null) {
      report.warnings.push(`menu_items.json: record ${index} is not an object, skipped`);
      report.counts.skippedItems += 1;
      return;
    }
    const obj = record as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) {
      report.warnings.push(`menu_items.json: record ${index} missing name, skipped`);
      report.counts.skippedItems += 1;
      return;
    }

    const normalizedName = normalizeMenuName(name);
    const categoryRef = readCategoryReference(obj);
    const warnings: string[] = [];

    let categoryName: string | null = null;
    if (categoryRef !== null) {
      const refNormalized = normalizeMenuName(String(categoryRef));
      const matched = categoriesByNormalizedName.get(refNormalized);
      if (matched) {
        categoryName = matched.name;
      } else {
        report.counts.orphanCategoryReferences += 1;
        warnings.push(`category reference "${categoryRef}" does not match any known category`);
      }
    } else {
      report.counts.missingCategory += 1;
      warnings.push("no category reference present");
    }

    const priceRaw = obj.price ?? obj.priceCents ?? obj.price_cents;
    const { cents: priceCents, warning: priceWarning } = parsePriceToCents(priceRaw);
    if (priceWarning === "missing price") report.counts.missingPrice += 1;
    if (priceWarning === "invalid price") report.counts.invalidPrice += 1;
    if (priceWarning) warnings.push(priceWarning);

    const isAvailable = mapIsAvailable(obj);
    if (!isAvailable) report.counts.unavailableItems += 1;
    const status = mapStatus(obj);

    const currencyRaw = obj.currency;
    const currency = typeof currencyRaw === "string" && currencyRaw.trim() ? currencyRaw.trim().toUpperCase() : "EUR";

    const dupKey = `${normalizedName}::${categoryName ? normalizeMenuName(categoryName) : "uncategorized"}`;
    if (seenKeys.has(dupKey)) {
      duplicateKeys.push(dupKey);
      warnings.push("duplicate name+category combination");
    } else {
      seenKeys.add(dupKey);
    }

    const item: MappedMenuItem = {
      sourceItemId: readSourceId(obj),
      name,
      normalizedName,
      sourceCategoryRef: categoryRef,
      categoryName,
      description: typeof obj.description === "string" ? obj.description : null,
      priceCents,
      currency,
      allergensJson: toBoundedStringArray(obj.allergens ?? obj.allergen_info ?? obj.allergensJson),
      dietaryTagsJson: toBoundedStringArray(obj.dietary_tags ?? obj.labels ?? obj.dietaryTagsJson),
      aliasesJson: toBoundedStringArray(obj.aliases ?? obj.aliasesJson),
      isAvailable,
      status,
      sortOrder: readSortOrder(obj),
      warnings,
    };

    mapped.push(item);
    report.counts.validItems += 1;
  });

  return { mapped, duplicateKeys };
}

export function __buildReportForTest(inputDir: string, targetRestaurantId: string): MenuImportReport {
  return buildReport(inputDir, targetRestaurantId);
}

function buildReport(inputDir: string, targetRestaurantId: string): MenuImportReport {
  const report: MenuImportReport = {
    runStartedAt: new Date().toISOString(),
    inputDir,
    targetRestaurantId,
    dryRun: true,
    writeEnabled: false,
    sourceFiles: [],
    counts: {
      categoriesRead: 0,
      itemsRead: 0,
      validCategories: 0,
      validItems: 0,
      skippedCategories: 0,
      skippedItems: 0,
      duplicateCategoryNames: 0,
      duplicateItemNames: 0,
      missingPrice: 0,
      invalidPrice: 0,
      missingCategory: 0,
      orphanCategoryReferences: 0,
      inactiveCategories: 0,
      unavailableItems: 0,
    },
    categories: { read: 0, valid: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, duplicateSkipped: 0 },
    items: {
      read: 0,
      valid: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      duplicateSkipped: 0,
      importedWithNullCategory: 0,
      autoCreatedCategoryFromItemLabel: 0,
    },
    proposedCategoryMappings: [],
    proposedItemMappings: [],
    duplicateCategoryNamesList: [],
    duplicateItemKeysList: [],
    warnings: [],
    errors: [],
    recommendedNextActions: [],
    writeModeSafety: { writeEnabled: false, confirmationMatched: false, productionAllowed: false, productionConfirmationProvided: false },
  };

  const categoriesPath = path.join(inputDir, "menu_categories.json");
  const itemsPath = path.join(inputDir, "menu_items.json");

  const categoryRecords = readJsonArray(categoriesPath);
  const itemRecords = readJsonArray(itemsPath);

  for (const file of SOURCE_FILES) {
    const records = file === "menu_categories.json" ? categoryRecords : itemRecords;
    report.sourceFiles.push({ file, found: records !== null, recordCount: records?.length ?? 0 });
  }

  if (categoryRecords === null) {
    report.warnings.push("menu_categories.json: file not found, skipped");
  }
  if (itemRecords === null) {
    report.warnings.push("menu_items.json: file not found, skipped");
  }

  report.counts.categoriesRead = categoryRecords?.length ?? 0;
  report.counts.itemsRead = itemRecords?.length ?? 0;

  const { byNormalizedName, duplicateNames } = buildCategoryMappings((categoryRecords ?? []) as SourceMenuCategory[], report);
  report.proposedCategoryMappings = [...byNormalizedName.values()];
  report.duplicateCategoryNamesList = duplicateNames;
  report.counts.duplicateCategoryNames = duplicateNames.length;

  const { mapped, duplicateKeys } = buildItemMappings((itemRecords ?? []) as SourceMenuItem[], byNormalizedName, report);
  report.proposedItemMappings = mapped;
  report.duplicateItemKeysList = duplicateKeys;
  report.counts.duplicateItemNames = duplicateKeys.length;

  report.categories.read = report.counts.categoriesRead;
  report.categories.valid = report.counts.validCategories;
  report.categories.skipped = report.counts.skippedCategories;
  report.categories.duplicateSkipped = report.counts.duplicateCategoryNames;

  report.items.read = report.counts.itemsRead;
  report.items.valid = report.counts.validItems;
  report.items.skipped = report.counts.skippedItems;
  report.items.duplicateSkipped = report.counts.duplicateItemNames;

  if (report.counts.categoriesRead === 0 && report.counts.itemsRead === 0) {
    report.errors.push("no source records found in menu_categories.json or menu_items.json — nothing to report on");
  }

  report.recommendedNextActions.push(
    "review duplicateCategoryNamesList/duplicateItemKeysList before any write import is attempted",
    "review orphanCategoryReferences and missingCategory items before any write import is attempted",
    "review invalidPrice/missingPrice items — these would import with a null priceCents and must be fixed by hand",
    "to write for real, set MENU_IMPORT_WRITE_ENABLED=true plus MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID and DATABASE_URL — see docs/menu-data-migration-plan.md §11; prefer a VPS/test database first"
  );

  return report;
}

function printUsageAndExit(message: string): never {
  console.log(
    [
      "menu-import-dry-run.ts — read-only dry-run report generator.",
      "",
      message,
      "",
      "Usage:",
      "  MENU_IMPORT_RESTAURANT_ID=<restaurant-id> npx tsx scripts/migration/menu-import-dry-run.ts",
      "",
      "Optional:",
      "  MENU_IMPORT_INPUT_DIR=./scripts/migration/menu-input-sample (defaults to scripts/migration/menu-input)",
      "",
      "This script never connects to Supabase and never writes to any database.",
    ].join("\n")
  );
  process.exit(1);
}

function writeReportFile(report: MenuImportReport): void {
  console.log(JSON.stringify(report, null, 2));
  const outputDir = path.join(process.cwd(), "scripts/migration/output");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "menu-import-report.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nReport also written to: ${outputPath}`);
}

async function main() {
  const targetRestaurantId = process.env.MENU_IMPORT_RESTAURANT_ID;
  if (!targetRestaurantId || !targetRestaurantId.trim()) {
    printUsageAndExit("MENU_IMPORT_RESTAURANT_ID is required — this script never guesses a target restaurant.");
  }

  const inputDir = process.env.MENU_IMPORT_INPUT_DIR || DEFAULT_INPUT_DIR;
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    printUsageAndExit(`Input directory not found: ${inputDir}`);
  }

  const report = buildReport(inputDir, targetRestaurantId as string);
  const gates = evaluateWriteModeGates(process.env);

  report.writeModeSafety = gates.safety;

  if (!gates.writeRequested) {
    // Default dry-run path — unchanged from Phase 39 behavior.
    writeReportFile(report);
    return;
  }

  if (!gates.canWrite) {
    report.dryRun = true;
    report.writeEnabled = false;
    for (const reason of gates.abortReasons) {
      report.errors.push(`write mode aborted: ${reason}`);
    }
    writeReportFile(report);
    console.error("\nWrite mode was requested but aborted by a safety gate — see report.errors. No database write occurred.");
    process.exitCode = 1;
    return;
  }

  try {
    const { writeMenuImport } = await import("../../backend/src/scripts/menuImportWrite");
    const writeResult = await writeMenuImport({
      restaurantId: targetRestaurantId as string,
      categories: report.proposedCategoryMappings,
      items: report.proposedItemMappings,
    });

    report.dryRun = false;
    report.writeEnabled = true;
    report.categories.created = writeResult.categories.created;
    report.categories.updated = writeResult.categories.updated;
    report.categories.unchanged = writeResult.categories.unchanged;
    report.items.created = writeResult.items.created;
    report.items.updated = writeResult.items.updated;
    report.items.unchanged = writeResult.items.unchanged;
    report.items.importedWithNullCategory = writeResult.items.importedWithNullCategory;
    report.items.autoCreatedCategoryFromItemLabel = writeResult.items.autoCreatedCategoryFromItemLabel;
    report.warnings.push(...writeResult.warnings);

    writeReportFile(report);
  } catch (err) {
    report.dryRun = true;
    report.writeEnabled = false;
    report.errors.push(`write mode failed: ${err instanceof Error ? err.message : String(err)}`);
    writeReportFile(report);
    console.error("\nWrite mode failed — no partial writes should remain (single transaction). See report.errors.");
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
