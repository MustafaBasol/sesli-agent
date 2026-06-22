import type { Prisma } from "@prisma/client";
import type { ListReservationsQuery } from "../schemas/reservations";

export function buildReservationListWhere(
  restaurantId: string,
  filters: Pick<ListReservationsQuery, "status" | "dateFrom" | "dateTo" | "customerId">,
  customerIdFilter?: string[]
): Prisma.ReservationWhereInput {
  const where: Prisma.ReservationWhereInput = { restaurantId };

  if (filters.status) where.status = filters.status;

  // customerIdFilter (resolved from a name/phone search) takes precedence
  // over a direct customerId filter — both narrow to "this customer", so the
  // more specific search-derived list wins rather than being combined.
  if (customerIdFilter) {
    where.customerId = { in: customerIdFilter };
  } else if (filters.customerId) {
    where.customerId = filters.customerId;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.reservationDate = {
      ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  return where;
}
