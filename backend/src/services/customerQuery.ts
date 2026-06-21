import type { Prisma } from "@prisma/client";
import type { ListCustomersQuery } from "../schemas/customers";

export function buildCustomerListWhere(
  restaurantId: string,
  filters: Pick<ListCustomersQuery, "search">
): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = { restaurantId };

  if (filters.search) {
    where.OR = [
      { fullName: { contains: filters.search, mode: "insensitive" } },
      { phoneNumber: { contains: filters.search } },
      { normalizedPhone: { contains: filters.search } },
      { email: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}
