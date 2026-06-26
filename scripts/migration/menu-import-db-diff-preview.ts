/**
 * menu-import-db-diff-preview.ts — Phase 43 read-only diff preview.
 *
 * Compares the source import files against current DB rows to show what a
 * write import would create, update, leave unchanged, and what DB-only
 * records would be left behind (or soft-disabled in replace mode).
 * This script NEVER mutates any database row.
 *
 * Required env vars:
 *   DATABASE_URL              — backend PostgreSQL connection string
 *   MENU_IMPORT_RESTAURANT_ID — target restaurant uuid
 *   MENU_IMPORT_INPUT_DIR     — path to directory with menu_categories.json + menu_items.json
 *
 * Usage:
 *   npm run migration:menu:diff-preview
 *   DATABASE_URL=... MENU_IMPORT_RESTAURANT_ID=... MENU_IMPORT_INPUT_DIR=... \
 *     npx tsx scripts/migration/menu-import-db-diff-preview.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import type { MappedMenuCategory, MappedMenuItem } from "./menuImportTypes";

// --- Pure types and comparison function (exported for testing) ---

export type DbCategoryForDiff = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  status: string;
};

export type DbItemForDiff = {
  id: string;
  name: string;
  categoryId: string | null;
  description: string | null;
  priceCents: number | null;
  isAvailable: boolean;
  status: string;
};

export type DiffCategoryOutcome = "create" | "update" | "unchanged";
export type DiffItemOutcome = "create" | "update" | "unchanged";

export type DiffCategoryEntry = {
  normalizedName: string;
  sourceName: string;
  outcome: DiffCategoryOutcome;
};

export type DiffItemEntry = {
  normalizedName: string;
  sourceName: string;
  sourceCategoryName: string | null;
  outcome: DiffItemOutcome;
};

export type DbOnlyCategory = {
  id: string;
  name: string;
  normalizedName: string;
  status: string;
};

export type DbOnlyItem = {
  id: string;
  name: string;
  normalizedName: string;
  categoryId: string | null;
  status: string;
  isAvailable: boolean;
};

export type MenuDiffResult = {
  generatedAt: string;
  restaurantId: string;
  inputDir: string;
  sourceCategoryCount: number;
  sourceItemCount: number;
  dbCategoryCount: number;
  dbItemCount: number;
  categories: {
    toCreate: number;
    toUpdate: number;
    unchanged: number;
    entries: DiffCategoryEntry[];
  };
  items: {
    toCreate: number;
    toUpdate: number;
    unchanged: number;
    entries: DiffItemEntry[];
  };
  dbOnlyCategories: DbOnlyCategory[];
  dbOnlyItems: DbOnlyItem[];
  dbOnlyCategoryCount: number;
  dbOnlyItemCount: number;
  /** True when DB has records not in source — replace mode recommended. */
  replaceRecommended: boolean;
  /** When true, upsert-only import will leave DB-only records active alongside real menu. */
  upsertOnlyWarning: string | null;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function computeMenuDiff(
  restaurantId: string,
  inputDir: string,
  sourceCategories: MappedMenuCategory[],
  sourceItems: MappedMenuItem[],
  dbCategories: DbCategoryForDiff[],
  dbItems: DbItemForDiff[]
): MenuDiffResult {
  const now = new Date().toISOString();

  // Build DB lookup maps.
  const dbCategoryByNorm = new Map<string, DbCategoryForDiff>();
  for (const dbCat of dbCategories) {
    dbCategoryByNorm.set(normalizeName(dbCat.name), dbCat);
  }

  const dbCategoryNameById = new Map<string, string>();
  for (const dbCat of dbCategories) {
    dbCategoryNameById.set(dbCat.id, dbCat.name);
  }

  const dbItemByKey = new Map<string, DbItemForDiff>();
  for (const dbItem of dbItems) {
    const catName = dbItem.categoryId ? (dbCategoryNameById.get(dbItem.categoryId) ?? null) : null;
    const key = `${normalizeName(dbItem.name)}::${catName ? normalizeName(catName) : "null"}`;
    dbItemByKey.set(key, dbItem);
  }

  // Classify source categories.
  const categoryEntries: DiffCategoryEntry[] = [];
  const sourceCategoryNorms = new Set<string>();

  for (const srcCat of sourceCategories) {
    sourceCategoryNorms.add(srcCat.normalizedName);
    const dbCat = dbCategoryByNorm.get(srcCat.normalizedName);
    let outcome: DiffCategoryOutcome;
    if (!dbCat) {
      outcome = "create";
    } else {
      const changed =
        dbCat.description !== srcCat.description ||
        dbCat.sortOrder !== srcCat.sortOrder ||
        dbCat.status !== srcCat.status;
      outcome = changed ? "update" : "unchanged";
    }
    categoryEntries.push({ normalizedName: srcCat.normalizedName, sourceName: srcCat.name, outcome });
  }

  // Classify source items.
  const itemEntries: DiffItemEntry[] = [];
  const sourceItemKeys = new Set<string>();

  for (const srcItem of sourceItems) {
    const key = `${srcItem.normalizedName}::${srcItem.categoryName ? normalizeName(srcItem.categoryName) : "null"}`;
    sourceItemKeys.add(key);
    const dbItem = dbItemByKey.get(key);
    let outcome: DiffItemOutcome;
    if (!dbItem) {
      outcome = "create";
    } else {
      const changed =
        dbItem.description !== srcItem.description ||
        dbItem.priceCents !== srcItem.priceCents ||
        dbItem.isAvailable !== srcItem.isAvailable ||
        dbItem.status !== srcItem.status;
      outcome = changed ? "update" : "unchanged";
    }
    itemEntries.push({
      normalizedName: srcItem.normalizedName,
      sourceName: srcItem.name,
      sourceCategoryName: srcItem.categoryName,
      outcome,
    });
  }

  // Find DB-only categories.
  const dbOnlyCategories: DbOnlyCategory[] = [];
  for (const dbCat of dbCategories) {
    const norm = normalizeName(dbCat.name);
    if (!sourceCategoryNorms.has(norm)) {
      dbOnlyCategories.push({ id: dbCat.id, name: dbCat.name, normalizedName: norm, status: dbCat.status });
    }
  }

  // Find DB-only items.
  const dbOnlyItems: DbOnlyItem[] = [];
  for (const dbItem of dbItems) {
    const catName = dbItem.categoryId ? (dbCategoryNameById.get(dbItem.categoryId) ?? null) : null;
    const key = `${normalizeName(dbItem.name)}::${catName ? normalizeName(catName) : "null"}`;
    if (!sourceItemKeys.has(key)) {
      dbOnlyItems.push({
        id: dbItem.id,
        name: dbItem.name,
        normalizedName: normalizeName(dbItem.name),
        categoryId: dbItem.categoryId,
        status: dbItem.status,
        isAvailable: dbItem.isAvailable,
      });
    }
  }

  const replaceRecommended = dbOnlyCategories.length > 0 || dbOnlyItems.length > 0;
  const upsertOnlyWarning = replaceRecommended
    ? `Upsert-only import will leave ${dbOnlyItems.length} DB-only item(s) and ${dbOnlyCategories.length} DB-only category(ies) active. Use replace mode to soft-disable them.`
    : null;

  return {
    generatedAt: now,
    restaurantId,
    inputDir,
    sourceCategoryCount: sourceCategories.length,
    sourceItemCount: sourceItems.length,
    dbCategoryCount: dbCategories.length,
    dbItemCount: dbItems.length,
    categories: {
      toCreate: categoryEntries.filter((e) => e.outcome === "create").length,
      toUpdate: categoryEntries.filter((e) => e.outcome === "update").length,
      unchanged: categoryEntries.filter((e) => e.outcome === "unchanged").length,
      entries: categoryEntries,
    },
    items: {
      toCreate: itemEntries.filter((e) => e.outcome === "create").length,
      toUpdate: itemEntries.filter((e) => e.outcome === "update").length,
      unchanged: itemEntries.filter((e) => e.outcome === "unchanged").length,
      entries: itemEntries,
    },
    dbOnlyCategories,
    dbOnlyItems,
    dbOnlyCategoryCount: dbOnlyCategories.length,
    dbOnlyItemCount: dbOnlyItems.length,
    replaceRecommended,
    upsertOnlyWarning,
  };
}

function buildDiffMarkdown(diff: MenuDiffResult): string {
  const lines: string[] = [];

  lines.push("# Menu Import DB Diff Preview");
  lines.push("");
  lines.push(`- Generated at: ${diff.generatedAt}`);
  lines.push(`- Restaurant ID: \`${diff.restaurantId}\``);
  lines.push(`- Input directory: \`${diff.inputDir}\``);
  lines.push("");

  lines.push("## Counts");
  lines.push("");
  lines.push(`| | Source | DB |`);
  lines.push(`|-|--------|-----|`);
  lines.push(`| Categories | ${diff.sourceCategoryCount} | ${diff.dbCategoryCount} |`);
  lines.push(`| Items | ${diff.sourceItemCount} | ${diff.dbItemCount} |`);
  lines.push("");

  lines.push("## Categories");
  lines.push("");
  lines.push(`- To create: **${diff.categories.toCreate}**`);
  lines.push(`- To update: **${diff.categories.toUpdate}**`);
  lines.push(`- Unchanged: **${diff.categories.unchanged}**`);
  lines.push(`- DB-only (not in source): **${diff.dbOnlyCategoryCount}**`);
  lines.push("");

  lines.push("## Items");
  lines.push("");
  lines.push(`- To create: **${diff.items.toCreate}**`);
  lines.push(`- To update: **${diff.items.toUpdate}**`);
  lines.push(`- Unchanged: **${diff.items.unchanged}**`);
  lines.push(`- DB-only (not in source): **${diff.dbOnlyItemCount}**`);
  lines.push("");

  if (diff.dbOnlyCategories.length > 0) {
    lines.push("## DB-Only Categories (would remain after upsert-only import)");
    lines.push("");
    lines.push("These categories exist in DB but are NOT in the source. They will remain unless replace mode is used.");
    lines.push("");
    for (const cat of diff.dbOnlyCategories) {
      lines.push(`- **${cat.name}** (${cat.status})`);
    }
    lines.push("");
  }

  if (diff.dbOnlyItems.length > 0) {
    lines.push("## DB-Only Items (would remain after upsert-only import)");
    lines.push("");
    lines.push("These items exist in DB but are NOT in the source. They will remain unless replace mode is used.");
    lines.push("");
    for (const item of diff.dbOnlyItems.slice(0, 50)) {
      lines.push(`- **${item.name}** (${item.status}${item.isAvailable ? "" : ", unavailable"})`);
    }
    if (diff.dbOnlyItems.length > 50) {
      lines.push(`- ...and ${diff.dbOnlyItems.length - 50} more (see JSON report)`);
    }
    lines.push("");
  }

  if (diff.upsertOnlyWarning) {
    lines.push("## WARNING");
    lines.push("");
    lines.push(`> ${diff.upsertOnlyWarning}`);
    lines.push("");
    lines.push("To soft-disable DB-only records, run with replace mode:");
    lines.push("```");
    lines.push("MENU_IMPORT_REPLACE_EXISTING=true");
    lines.push('MENU_IMPORT_REPLACE_CONFIRMATION="I_UNDERSTAND_THIS_WILL_DISABLE_MENU_RECORDS_NOT_IN_SOURCE"');
    lines.push("```");
    lines.push("Replace mode soft-disables only — it NEVER hard-deletes any record.");
    lines.push("");
  } else {
    lines.push("No DB-only records found. Upsert-only import is sufficient.");
    lines.push("");
  }

  return lines.join("\n");
}

// --- Script entry point (runs against real DB) ---

async function main() {
  const restaurantId = process.env.MENU_IMPORT_RESTAURANT_ID;
  const databaseUrl = process.env.DATABASE_URL;
  const inputDir = process.env.MENU_IMPORT_INPUT_DIR;

  if (!restaurantId) {
    console.error("MENU_IMPORT_RESTAURANT_ID is required");
    process.exit(1);
  }
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  if (!inputDir) {
    console.error("MENU_IMPORT_INPUT_DIR is required");
    process.exit(1);
  }
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    console.error(`Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  // Read source files using the same helpers as the dry-run.
  const { __buildReportForTest } = await import("./menu-import-dry-run");
  const dryRunReport = __buildReportForTest(inputDir, restaurantId);

  const { prisma } = await import("../../backend/src/prisma/client");

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("Database unreachable:", (err as Error).message);
    await prisma.$disconnect();
    process.exit(1);
  }

  const [dbCategories, dbItems] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { restaurantId },
      select: { id: true, name: true, description: true, sortOrder: true, status: true },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId },
      select: { id: true, name: true, categoryId: true, description: true, priceCents: true, isAvailable: true, status: true },
    }),
  ]);

  await prisma.$disconnect();

  const diff = computeMenuDiff(
    restaurantId,
    inputDir,
    dryRunReport.proposedCategoryMappings,
    dryRunReport.proposedItemMappings,
    dbCategories,
    dbItems
  );

  const outputDir = path.join(process.cwd(), "scripts/migration/output");
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, "menu-import-db-diff-preview.json");
  const mdPath = path.join(outputDir, "menu-import-db-diff-preview.md");
  fs.writeFileSync(jsonPath, JSON.stringify(diff, null, 2), "utf-8");
  fs.writeFileSync(mdPath, buildDiffMarkdown(diff), "utf-8");

  console.log(JSON.stringify(
    {
      sourceCategoryCount: diff.sourceCategoryCount,
      sourceItemCount: diff.sourceItemCount,
      dbCategoryCount: diff.dbCategoryCount,
      dbItemCount: diff.dbItemCount,
      categories: { toCreate: diff.categories.toCreate, toUpdate: diff.categories.toUpdate, unchanged: diff.categories.unchanged },
      items: { toCreate: diff.items.toCreate, toUpdate: diff.items.toUpdate, unchanged: diff.items.unchanged },
      dbOnlyCategoryCount: diff.dbOnlyCategoryCount,
      dbOnlyItemCount: diff.dbOnlyItemCount,
      replaceRecommended: diff.replaceRecommended,
    },
    null,
    2
  ));
  if (diff.upsertOnlyWarning) {
    console.warn(`\nWARNING: ${diff.upsertOnlyWarning}`);
  }
  console.log(`\nFull diff written to: ${jsonPath}`);
  console.log(`Markdown written to: ${mdPath}`);
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error("menu-import-db-diff-preview.ts failed:", err);
    process.exitCode = 1;
  });
}
