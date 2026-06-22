import type { Prisma } from "@prisma/client";
import type { ListTablesQuery } from "../schemas/tables";

export function buildTableListWhere(
  restaurantId: string,
  filters: Pick<ListTablesQuery, "status" | "search">
): Prisma.RestaurantTableWhereInput {
  const where: Prisma.RestaurantTableWhereInput = { restaurantId };

  if (filters.status) {
    where.isActive = filters.status === "active";
  }

  if (filters.search) {
    where.OR = [
      { tableNumber: { contains: filters.search, mode: "insensitive" } },
      { location: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}
