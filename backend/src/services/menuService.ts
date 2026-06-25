import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  CreateMenuCategoryInput,
  CreateMenuItemInput,
  ListMenuCategoriesQuery,
  ListMenuItemsQuery,
  UpdateMenuCategoryInput,
  UpdateMenuItemInput,
} from "../schemas/menu";
import { buildMenuCategoryListWhere, buildMenuItemListWhere } from "./menuQuery";

interface MenuCategoryRow {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MenuItemRow {
  id: string;
  restaurantId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  allergensJson: Prisma.JsonValue;
  dietaryTagsJson: Prisma.JsonValue;
  aliasesJson: Prisma.JsonValue;
  isAvailable: boolean;
  sortOrder: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toSafeCategory(row: MenuCategoryRow, itemCount?: number) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(itemCount !== undefined ? { itemCount } : {}),
  };
}

function toSafeItem(row: MenuItemRow) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    currency: row.currency,
    allergens: Array.isArray(row.allergensJson) ? row.allergensJson : [],
    dietaryTags: Array.isArray(row.dietaryTagsJson) ? row.dietaryTagsJson : [],
    aliases: Array.isArray(row.aliasesJson) ? row.aliasesJson : [],
    isAvailable: row.isAvailable,
    sortOrder: row.sortOrder,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Looks up a category scoped to restaurantId. Returns null for both "does
 * not exist" and "belongs to another restaurant" — callers must not
 * distinguish the two in the response, so a probing request can't tell which.
 */
export async function findMenuCategoryForRestaurant(restaurantId: string, categoryId: string) {
  return prisma.menuCategory.findFirst({ where: { id: categoryId, restaurantId } });
}

export async function findMenuItemForRestaurant(restaurantId: string, itemId: string) {
  return prisma.menuItem.findFirst({ where: { id: itemId, restaurantId } });
}

export async function listMenuCategories(restaurantId: string, query: ListMenuCategoriesQuery) {
  const where = buildMenuCategoryListWhere(restaurantId, query);

  const [total, rows] = await Promise.all([
    prisma.menuCategory.count({ where }),
    prisma.menuCategory.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const categoryIds = rows.map((r) => r.id);
  const counts = categoryIds.length
    ? await prisma.menuItem.groupBy({
        by: ["categoryId"],
        where: { restaurantId, categoryId: { in: categoryIds } },
        _count: { _all: true },
      })
    : [];
  const countByCategory = new Map(
    counts.filter((c) => c.categoryId).map((c) => [c.categoryId as string, c._count._all])
  );

  const data = rows.map((row) => toSafeCategory(row, countByCategory.get(row.id) ?? 0));

  return {
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getMenuCategoryDetail(restaurantId: string, categoryId: string) {
  const category = await findMenuCategoryForRestaurant(restaurantId, categoryId);
  if (!category) return null;

  const itemCount = await prisma.menuItem.count({ where: { restaurantId, categoryId } });
  return toSafeCategory(category, itemCount);
}

export async function createMenuCategory(restaurantId: string, input: CreateMenuCategoryInput) {
  const created = await prisma.menuCategory.create({
    data: {
      restaurantId,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
      status: input.status ?? "active",
    },
  });

  return toSafeCategory(created, 0);
}

export async function updateMenuCategory(restaurantId: string, categoryId: string, patch: UpdateMenuCategoryInput) {
  const data: Prisma.MenuCategoryUpdateInput = {};

  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.status !== undefined) data.status = patch.status;

  const updated = await prisma.menuCategory.update({ where: { id: categoryId, restaurantId }, data });
  const itemCount = await prisma.menuItem.count({ where: { restaurantId, categoryId } });
  return toSafeCategory(updated, itemCount);
}

export async function listMenuItems(restaurantId: string, query: ListMenuItemsQuery) {
  const where = buildMenuItemListWhere(restaurantId, query);

  const [total, rows] = await Promise.all([
    prisma.menuItem.count({ where }),
    prisma.menuItem.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const data = rows.map((row) => toSafeItem(row));

  return {
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getMenuItemDetail(restaurantId: string, itemId: string) {
  const item = await findMenuItemForRestaurant(restaurantId, itemId);
  if (!item) return null;
  return toSafeItem(item);
}

export class CategoryNotInRestaurantError extends Error {
  constructor() {
    super("categoryId must belong to the same restaurant");
    this.name = "CategoryNotInRestaurantError";
  }
}

export async function createMenuItem(restaurantId: string, input: CreateMenuItemInput) {
  if (input.categoryId) {
    const category = await findMenuCategoryForRestaurant(restaurantId, input.categoryId);
    if (!category) throw new CategoryNotInRestaurantError();
  }

  const created = await prisma.menuItem.create({
    data: {
      restaurantId,
      categoryId: input.categoryId ?? null,
      name: input.name,
      description: input.description ?? null,
      priceCents: input.priceCents ?? null,
      currency: input.currency ?? "EUR",
      allergensJson: input.allergensJson ?? undefined,
      dietaryTagsJson: input.dietaryTagsJson ?? undefined,
      aliasesJson: input.aliasesJson ?? undefined,
      isAvailable: input.isAvailable ?? true,
      sortOrder: input.sortOrder ?? 0,
      status: input.status ?? "active",
    },
  });

  return toSafeItem(created);
}

export async function updateMenuItem(restaurantId: string, itemId: string, patch: UpdateMenuItemInput) {
  if (patch.categoryId) {
    const category = await findMenuCategoryForRestaurant(restaurantId, patch.categoryId);
    if (!category) throw new CategoryNotInRestaurantError();
  }

  const data: Prisma.MenuItemUpdateInput = {};

  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
  if (patch.priceCents !== undefined) data.priceCents = patch.priceCents;
  if (patch.currency !== undefined) data.currency = patch.currency;
  if (patch.allergensJson !== undefined) data.allergensJson = patch.allergensJson;
  if (patch.dietaryTagsJson !== undefined) data.dietaryTagsJson = patch.dietaryTagsJson;
  if (patch.aliasesJson !== undefined) data.aliasesJson = patch.aliasesJson;
  if (patch.isAvailable !== undefined) data.isAvailable = patch.isAvailable;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.status !== undefined) data.status = patch.status;

  const updated = await prisma.menuItem.update({ where: { id: itemId, restaurantId }, data });
  return toSafeItem(updated);
}
