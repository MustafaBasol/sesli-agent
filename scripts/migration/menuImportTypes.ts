/**
 * menuImportTypes.ts — shared types for the Phase 39 menu import dry-run.
 * No I/O, no database access, no Supabase access.
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
  dryRun: true;
  writeEnabled: false;
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
  proposedCategoryMappings: MappedMenuCategory[];
  proposedItemMappings: MappedMenuItem[];
  duplicateCategoryNamesList: string[];
  duplicateItemKeysList: string[];
  warnings: string[];
  errors: string[];
  recommendedNextActions: string[];
};
