/**
 * menu-import-db-diff-preview.test.ts — Phase 43 unit tests for the
 * diff preview pure comparison function. No database required.
 *
 * Run: npx tsx scripts/migration/menu-import-db-diff-preview.test.ts
 *      npm run test:menu-import-db-diff-preview
 */
import assert from "node:assert/strict";
import { computeMenuDiff } from "./menu-import-db-diff-preview";
import type { MappedMenuCategory, MappedMenuItem } from "./menuImportTypes";

function cat(name: string, status: "active" | "inactive" = "active"): MappedMenuCategory {
  return {
    sourceCategoryId: null,
    name,
    normalizedName: name.trim().toLowerCase(),
    description: null,
    sortOrder: 0,
    status,
  };
}

function item(name: string, categoryName: string | null = null, priceCents: number | null = null): MappedMenuItem {
  return {
    sourceItemId: null,
    name,
    normalizedName: name.trim().toLowerCase(),
    sourceCategoryRef: categoryName,
    categoryName,
    description: null,
    priceCents,
    currency: "EUR",
    allergensJson: undefined,
    dietaryTagsJson: undefined,
    aliasesJson: undefined,
    isAvailable: true,
    status: "active",
    sortOrder: 0,
    warnings: [],
  };
}

function dbCat(id: string, name: string, status = "active"): { id: string; name: string; description: null; sortOrder: number; status: string } {
  return { id, name, description: null, sortOrder: 0, status };
}

function dbItem(id: string, name: string, categoryId: string | null = null, status = "active"): {
  id: string; name: string; categoryId: string | null; description: null; priceCents: null; isAvailable: boolean; status: string;
} {
  return { id, name, categoryId, description: null, priceCents: null, isAvailable: true, status };
}

async function main() {
  // Empty source, empty DB → all zeros, no replace needed.
  {
    const diff = computeMenuDiff("rest-1", "/input", [], [], [], []);
    assert.equal(diff.sourceCategoryCount, 0);
    assert.equal(diff.sourceItemCount, 0);
    assert.equal(diff.dbCategoryCount, 0);
    assert.equal(diff.dbItemCount, 0);
    assert.equal(diff.categories.toCreate, 0);
    assert.equal(diff.categories.toUpdate, 0);
    assert.equal(diff.categories.unchanged, 0);
    assert.equal(diff.dbOnlyCategoryCount, 0);
    assert.equal(diff.dbOnlyItemCount, 0);
    assert.equal(diff.replaceRecommended, false);
    assert.equal(diff.upsertOnlyWarning, null);
  }

  // All new: source has categories/items, DB is empty.
  {
    const diff = computeMenuDiff("rest-1", "/input",
      [cat("Starters"), cat("Mains")],
      [item("Hummus", "Starters"), item("Steak", "Mains")],
      [],
      []
    );
    assert.equal(diff.categories.toCreate, 2);
    assert.equal(diff.categories.unchanged, 0);
    assert.equal(diff.items.toCreate, 2);
    assert.equal(diff.dbOnlyCategoryCount, 0);
    assert.equal(diff.dbOnlyItemCount, 0);
    assert.equal(diff.replaceRecommended, false);
  }

  // All existing and unchanged.
  {
    const diff = computeMenuDiff("rest-1", "/input",
      [cat("Starters")],
      [item("Hummus", "Starters")],
      [dbCat("cat-1", "Starters")],
      [dbItem("item-1", "Hummus", "cat-1")]
    );
    assert.equal(diff.categories.unchanged, 1);
    assert.equal(diff.categories.toCreate, 0);
    assert.equal(diff.items.unchanged, 1);
    assert.equal(diff.items.toCreate, 0);
    assert.equal(diff.dbOnlyCategoryCount, 0);
    assert.equal(diff.dbOnlyItemCount, 0);
    assert.equal(diff.replaceRecommended, false);
  }

  // Mixed: some new, some existing, some DB-only.
  {
    const diff = computeMenuDiff("rest-1", "/input",
      [cat("Starters"), cat("Mains")],
      [item("Hummus", "Starters"), item("Steak", "Mains")],
      // DB has Starters + an old demo category.
      [dbCat("cat-1", "Starters"), dbCat("cat-demo", "Old Demo")],
      // DB has Hummus + an old demo item.
      [dbItem("item-1", "Hummus", "cat-1"), dbItem("item-demo", "Demo Item", null)]
    );
    // Starters is unchanged; Mains is new.
    assert.equal(diff.categories.unchanged, 1);
    assert.equal(diff.categories.toCreate, 1);
    assert.equal(diff.categories.toUpdate, 0);
    // Hummus is unchanged; Steak is new.
    assert.equal(diff.items.unchanged, 1);
    assert.equal(diff.items.toCreate, 1);
    // "Old Demo" category is DB-only; "Demo Item" is DB-only.
    assert.equal(diff.dbOnlyCategoryCount, 1);
    assert.equal(diff.dbOnlyCategories[0].name, "Old Demo");
    assert.equal(diff.dbOnlyItemCount, 1);
    assert.equal(diff.dbOnlyItems[0].name, "Demo Item");
    assert.equal(diff.replaceRecommended, true);
    assert.ok(diff.upsertOnlyWarning !== null);
    assert.ok(diff.upsertOnlyWarning!.includes("replace mode"));
  }

  // DB-only items detected (this is the Phase 43 key scenario: 42 source, 46 DB).
  {
    const sourceItems = Array.from({ length: 42 }, (_, i) => item(`Item ${i}`, "Mains"));
    const dbItems_ = [
      ...Array.from({ length: 42 }, (_, i) => dbItem(`item-${i}`, `Item ${i}`, "cat-mains")),
      dbItem("demo-1", "Old Seed Item 1", null),
      dbItem("demo-2", "Old Seed Item 2", null),
      dbItem("demo-3", "Old Seed Item 3", null),
      dbItem("demo-4", "Old Seed Item 4", null),
    ];
    const diff = computeMenuDiff("rest-1", "/input",
      [cat("Mains")],
      sourceItems,
      [dbCat("cat-mains", "Mains")],
      dbItems_
    );
    assert.equal(diff.sourceItemCount, 42);
    assert.equal(diff.dbItemCount, 46);
    assert.equal(diff.dbOnlyItemCount, 4);
    assert.equal(diff.replaceRecommended, true);
  }

  // Update detection: DB has category with different status.
  {
    const diff = computeMenuDiff("rest-1", "/input",
      [cat("Starters", "active")],
      [],
      [{ id: "cat-1", name: "Starters", description: null, sortOrder: 5, status: "inactive" }],
      []
    );
    // sortOrder and status differ → toUpdate.
    assert.equal(diff.categories.toUpdate, 1);
    assert.equal(diff.categories.unchanged, 0);
  }

  // Case-insensitive normalized matching: "STARTERS" source matches "starters" in DB.
  {
    const diff = computeMenuDiff("rest-1", "/input",
      [{ ...cat("STARTERS"), normalizedName: "starters" }],
      [],
      [dbCat("cat-1", "starters")],
      []
    );
    assert.equal(diff.categories.unchanged, 1);
    assert.equal(diff.dbOnlyCategoryCount, 0);
  }

  // Fields included in result.
  {
    const diff = computeMenuDiff("rest-1", "/input", [], [], [], []);
    assert.ok(typeof diff.generatedAt === "string");
    assert.equal(diff.restaurantId, "rest-1");
    assert.equal(diff.inputDir, "/input");
  }

  console.log("menu-import-db-diff-preview.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("menu-import-db-diff-preview.test.ts failed:", err);
  process.exitCode = 1;
});
