import type { Prisma } from "@prisma/client";
import type { ListMenuCategoriesQuery, ListMenuItemsQuery } from "../schemas/menu";

export function buildMenuCategoryListWhere(
  restaurantId: string,
  filters: Pick<ListMenuCategoriesQuery, "status" | "search">
): Prisma.MenuCategoryWhereInput {
  const where: Prisma.MenuCategoryWhereInput = { restaurantId };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export function buildMenuItemListWhere(
  restaurantId: string,
  filters: Pick<ListMenuItemsQuery, "categoryId" | "status" | "isAvailable" | "search">
): Prisma.MenuItemWhereInput {
  const where: Prisma.MenuItemWhereInput = { restaurantId };

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.isAvailable !== undefined) {
    where.isAvailable = filters.isAvailable;
  }

  if (filters.search) {
    // aliasesJson is a plain string array — Postgres/Prisma JSON filters
    // only support exact-element containment (array_contains), not
    // substring matching inside array elements, so alias matching here is
    // exact-value only; name/description still get a normal substring search.
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { aliasesJson: { array_contains: [filters.search] } },
    ];
  }

  return where;
}
