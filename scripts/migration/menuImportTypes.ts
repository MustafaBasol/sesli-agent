/**
 * menuImportTypes.ts — shared types for the Phase 39 menu import dry-run and
 * the Phase 40 gated write mode. No I/O, no database access, no Supabase
 * access (the write-mode DB calls themselves live in
 * backend/src/scripts/menuImportWrite.ts, not here).
 *
 * Policy reference: docs/menu-data-migration-plan.md
 */

export type SourceMenuCategory = Record<string, unknown>;
export type SourceMenuItem = Record<string, unknown>;

export type MenuItemStatus = "active" | "inactive";

export type MappedMenuCategory = {
  sourceCategoryId: string | number | null;
  name: string;
  normalizedName: string;
  description: string | null;
  sortOrder: number;
  status: MenuItemStatus;
};

export type MappedMenuItem = {
  sourceItemId: string | number | null;
  name: string;
  normalizedName: string;
  sourceCategoryRef: string | number | null;
  categoryName: string | null;
  description: string | null;
  priceCents: number | null;
  currency: string;
  allergensJson: string[] | undefined;
  dietaryTagsJson: string[] | undefined;
  aliasesJson: string[] | undefined;
  isAvailable: boolean;
  status: MenuItemStatus;
  sortOrder: number;
  warnings: string[];
};

export type MenuImportReport = {
  runStartedAt: string;
  inputDir: string;
  targetRestaurantId: string;
  dryRun: boolean;
  writeEnabled: boolean;
  sourceFiles: { file: string; found: boolean; recordCount: number }[];
  counts: {
    categoriesRead: number;
    itemsRead: number;
    validCategories: number;
    validItems: number;
    skippedCategories: number;
    skippedItems: number;
    duplicateCategoryNames: number;
    duplicateItemNames: number;
    missingPrice: number;
    invalidPrice: number;
    missingCategory: number;
    orphanCategoryReferences: number;
    inactiveCategories: number;
    unavailableItems: number;
  };
  /** Write-mode outcome counters for categories. Zeroed out in dry-run mode. */
  categories: {
    read: number;
    valid: number;
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    duplicateSkipped: number;
  };
  /** Write-mode outcome counters for items. Zeroed out in dry-run mode. */
  items: {
    read: number;
    valid: number;
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    duplicateSkipped: number;
    importedWithNullCategory: number;
    autoCreatedCategoryFromItemLabel: number;
  };
  proposedCategoryMappings: MappedMenuCategory[];
  proposedItemMappings: MappedMenuItem[];
  duplicateCategoryNamesList: string[];
  duplicateItemKeysList: string[];
  warnings: string[];
  errors: string[];
  /** Phase 41 — non-blocking go/no-go threshold checks, evaluated after counts are final. */
  thresholdWarnings: string[];
  recommendedNextActions: string[];
  /** Records exactly which write-mode safety gates were evaluated and how. */
  writeModeSafety: {
    writeEnabled: boolean;
    confirmationMatched: boolean;
    productionAllowed: boolean;
    productionConfirmationProvided: boolean;
  };
  /** Phase 43 — replace mode outcome. All fields are false/0/[] in upsert-only mode. */
  replaceMode: {
    /** Whether replace mode ran (write gates + replace gates both passed). */
    enabled: boolean;
    /** Whether the exact replace confirmation phrase was provided. */
    confirmationProvided: boolean;
    /** Count of DB categories that had no matching source category. */
    dbOnlyCategoryCount: number;
    /** Count of DB items that had no matching source item. */
    dbOnlyItemCount: number;
    /** Names of DB-only categories that were soft-disabled (status→inactive). */
    disabledDbOnlyCategories: string[];
    /** Names of DB-only items that were soft-disabled (status→inactive, isAvailable→false). */
    disabledDbOnlyItems: string[];
    /** DB-only records that were already inactive/unavailable and skipped. */
    skippedReplaceActions: number;
  };
};
