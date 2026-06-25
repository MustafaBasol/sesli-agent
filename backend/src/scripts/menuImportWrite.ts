/**
 * menuImportWrite.ts — Phase 40 gated write path for the menu data import
 * tool. This is the ONLY file in the import tool that touches Prisma/the
 * database. It is dynamically imported from
 * scripts/migration/menu-import-dry-run.ts ONLY after every write-mode
 * safety gate in scripts/migration/menuImportWriteGates.ts has passed.
 *
 * Idempotency: categories are matched by restaurantId + normalized name;
 * items are matched by restaurantId + normalized name + resolved
 * categoryId (or null). Re-running the same input never creates
 * duplicates — it finds the same rows by name and reports them unchanged
 * (or updated, if a safe field actually differs).
 *
 * No old Supabase source id is ever persisted. Never writes raw source
 * objects, debug metadata, or rawPayload.
 *
 * Policy reference: docs/menu-data-migration-plan.md
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";

function normalizeMenuName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export type WriteMenuCategoryInput = {
  name: string;
  normalizedName: string;
  description: string | null;
  sortOrder: number;
  status: "active" | "inactive";
};

export type WriteMenuItemInput = {
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
  status: "active" | "inactive";
  sortOrder: number;
};

export type WriteMenuImportInput = {
  restaurantId: string;
  categories: WriteMenuCategoryInput[];
  items: WriteMenuItemInput[];
};

export type WriteMenuImportResult = {
  categories: { created: number; updated: number; unchanged: number };
  items: {
    created: number;
    updated: number;
    unchanged: number;
    importedWithNullCategory: number;
    autoCreatedCategoryFromItemLabel: number;
  };
  warnings: string[];
};

function jsonArrayOrNull(value: string[] | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value && value.length > 0 ? value : Prisma.JsonNull;
}

function jsonArraysEqual(a: Prisma.JsonValue, b: string[] | undefined): boolean {
  const left = Array.isArray(a) ? a : null;
  const right = b && b.length > 0 ? b : null;
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function writeMenuImport(input: WriteMenuImportInput): Promise<WriteMenuImportResult> {
  const { restaurantId, categories, items } = input;
  const warnings: string[] = [];
  const result: WriteMenuImportResult = {
    categories: { created: 0, updated: 0, unchanged: 0 },
    items: { created: 0, updated: 0, unchanged: 0, importedWithNullCategory: 0, autoCreatedCategoryFromItemLabel: 0 },
    warnings,
  };

  await prisma.$transaction(async (tx) => {
    const existingCategories = await tx.menuCategory.findMany({ where: { restaurantId } });
    const categoryIdByNormalizedName = new Map<string, string>();
    const categoryRowById = new Map<string, (typeof existingCategories)[number]>();
    for (const category of existingCategories) {
      categoryIdByNormalizedName.set(normalizeMenuName(category.name), category.id);
      categoryRowById.set(category.id, category);
    }

    for (const category of categories) {
      const existingId = categoryIdByNormalizedName.get(category.normalizedName);
      if (existingId) {
        const existing = categoryRowById.get(existingId)!;
        const data: Prisma.MenuCategoryUpdateInput = {};
        if (existing.description !== category.description) data.description = category.description;
        if (existing.sortOrder !== category.sortOrder) data.sortOrder = category.sortOrder;
        if (existing.status !== category.status) data.status = category.status;
        if (Object.keys(data).length > 0) {
          await tx.menuCategory.update({ where: { id: existingId }, data });
          result.categories.updated += 1;
        } else {
          result.categories.unchanged += 1;
        }
      } else {
        const created = await tx.menuCategory.create({
          data: {
            restaurantId,
            name: category.name,
            description: category.description,
            sortOrder: category.sortOrder,
            status: category.status,
          },
        });
        categoryIdByNormalizedName.set(category.normalizedName, created.id);
        categoryRowById.set(created.id, created);
        result.categories.created += 1;
      }
    }

    const existingItems = await tx.menuItem.findMany({ where: { restaurantId } });
    const itemKey = (normalizedName: string, categoryId: string | null) => `${normalizedName}::${categoryId ?? "null"}`;
    const itemRowByKey = new Map<string, (typeof existingItems)[number]>();
    for (const row of existingItems) {
      itemRowByKey.set(itemKey(normalizeMenuName(row.name), row.categoryId), row);
    }

    for (const item of items) {
      let categoryId: string | null = null;

      if (item.categoryName) {
        categoryId = categoryIdByNormalizedName.get(normalizeMenuName(item.categoryName)) ?? null;
      } else if (typeof item.sourceCategoryRef === "string" && item.sourceCategoryRef.trim()) {
        // Orphan reference with a usable text label — auto-create the category from it.
        const label = item.sourceCategoryRef.trim();
        const normalizedLabel = normalizeMenuName(label);
        let autoCategoryId = categoryIdByNormalizedName.get(normalizedLabel);
        if (!autoCategoryId) {
          const created = await tx.menuCategory.create({
            data: { restaurantId, name: label, description: null, sortOrder: 0, status: "active" },
          });
          autoCategoryId = created.id;
          categoryIdByNormalizedName.set(normalizedLabel, autoCategoryId);
          result.categories.created += 1;
          result.items.autoCreatedCategoryFromItemLabel += 1;
          warnings.push(`auto-created category "${label}" from item "${item.name}"'s unmatched category reference`);
        }
        categoryId = autoCategoryId;
      }

      if (categoryId === null) {
        result.items.importedWithNullCategory += 1;
      }

      const key = itemKey(item.normalizedName, categoryId);
      const existing = itemRowByKey.get(key);

      if (existing) {
        const data: Prisma.MenuItemUpdateInput = {};
        if (existing.categoryId !== categoryId) data.categoryId = categoryId;
        if (existing.description !== item.description) data.description = item.description;
        if (existing.priceCents !== item.priceCents) data.priceCents = item.priceCents;
        if (existing.currency !== item.currency) data.currency = item.currency;
        if (!jsonArraysEqual(existing.allergensJson, item.allergensJson)) data.allergensJson = jsonArrayOrNull(item.allergensJson);
        if (!jsonArraysEqual(existing.dietaryTagsJson, item.dietaryTagsJson)) data.dietaryTagsJson = jsonArrayOrNull(item.dietaryTagsJson);
        if (!jsonArraysEqual(existing.aliasesJson, item.aliasesJson)) data.aliasesJson = jsonArrayOrNull(item.aliasesJson);
        if (existing.isAvailable !== item.isAvailable) data.isAvailable = item.isAvailable;
        if (existing.sortOrder !== item.sortOrder) data.sortOrder = item.sortOrder;
        if (existing.status !== item.status) data.status = item.status;
        if (Object.keys(data).length > 0) {
          await tx.menuItem.update({ where: { id: existing.id }, data });
          result.items.updated += 1;
        } else {
          result.items.unchanged += 1;
        }
      } else {
        const created = await tx.menuItem.create({
          data: {
            restaurantId,
            categoryId,
            name: item.name,
            description: item.description,
            priceCents: item.priceCents,
            currency: item.currency,
            allergensJson: jsonArrayOrNull(item.allergensJson),
            dietaryTagsJson: jsonArrayOrNull(item.dietaryTagsJson),
            aliasesJson: jsonArrayOrNull(item.aliasesJson),
            isAvailable: item.isAvailable,
            sortOrder: item.sortOrder,
            status: item.status,
          },
        });
        itemRowByKey.set(key, created);
        result.items.created += 1;
      }
    }
  });

  return result;
}
