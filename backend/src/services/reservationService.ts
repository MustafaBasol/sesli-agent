import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { ListReservationsQuery, UpdateReservationInput } from "../schemas/reservations";
import { loadCustomerSummaries } from "./customerService";
import { buildReservationListWhere } from "./reservationQuery";

// Reservation only stores customerId/assignedTableId/reservationRequestId as
// plain columns (no Prisma relation is declared between those models, same
// pattern as ReservationRequest), so summaries are assembled with batched
// follow-up queries instead of `include`.

interface TableSummary {
  id: string;
  tableNumber: string;
  capacity: number;
  location: string | null;
}

async function loadTableSummaries(tableIds: string[]): Promise<Map<string, TableSummary>> {
  if (tableIds.length === 0) return new Map();
  const tables = await prisma.restaurantTable.findMany({
    where: { id: { in: tableIds } },
    select: { id: true, tableNumber: true, capacity: true, location: true },
  });
  return new Map(tables.map((t) => [t.id, t]));
}

export async function listReservations(restaurantId: string, query: ListReservationsQuery) {
  let customerIdFilter: string[] | undefined;

  if (query.search) {
    const matches = await prisma.customer.findMany({
      where: {
        restaurantId,
        OR: [
          { fullName: { contains: query.search, mode: "insensitive" } },
          { phoneNumber: { contains: query.search } },
          { normalizedPhone: { contains: query.search } },
        ],
      },
      select: { id: true },
    });
    customerIdFilter = matches.map((c) => c.id);

    if (customerIdFilter.length === 0) {
      return {
        data: [],
        pagination: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 1 },
      };
    }
  }

  const where = buildReservationListWhere(restaurantId, query, customerIdFilter);

  const [total, rows] = await Promise.all([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      orderBy: { reservationDate: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const customerIds = [...new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id))];
  const tableIds = [...new Set(rows.map((r) => r.assignedTableId).filter((id): id is string => !!id))];

  const [customers, tables] = await Promise.all([loadCustomerSummaries(customerIds), loadTableSummaries(tableIds)]);

  const data = rows.map((row) => {
    const customer = row.customerId ? customers.get(row.customerId) ?? null : null;
    const table = row.assignedTableId ? tables.get(row.assignedTableId) ?? null : null;
    return {
      id: row.id,
      restaurantId: row.restaurantId,
      reservationRequestId: row.reservationRequestId,
      customerId: row.customerId,
      customerName: customer?.fullName ?? null,
      phoneNumber: customer?.phoneNumber ?? null,
      sourceChannel: row.sourceChannel,
      reservationDate: row.reservationDate,
      reservationTime: row.reservationTime,
      partySize: row.partySize,
      status: row.status,
      assignedTableId: row.assignedTableId,
      tableName: table?.tableNumber ?? null,
      internalNote: row.internalNote,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

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

/**
 * Looks up a reservation scoped to restaurantId. Returns null for both "does
 * not exist" and "belongs to another restaurant" — callers must not
 * distinguish the two in the response, so a probing request can't tell which
 * is true.
 */
export async function findReservationForRestaurant(restaurantId: string, reservationId: string) {
  return prisma.reservation.findFirst({ where: { id: reservationId, restaurantId } });
}

export async function getReservationDetail(restaurantId: string, reservationId: string) {
  const reservation = await findReservationForRestaurant(restaurantId, reservationId);
  if (!reservation) return null;

  const [customer, table, request] = await Promise.all([
    reservation.customerId
      ? prisma.customer.findFirst({
          where: { id: reservation.customerId, restaurantId },
          select: { id: true, fullName: true, phoneNumber: true, email: true, totalReservations: true },
        })
      : Promise.resolve(null),
    reservation.assignedTableId
      ? prisma.restaurantTable.findFirst({
          where: { id: reservation.assignedTableId, restaurantId },
          select: { id: true, tableNumber: true, capacity: true, location: true },
        })
      : Promise.resolve(null),
    reservation.reservationRequestId
      ? prisma.reservationRequest.findFirst({
          where: { id: reservation.reservationRequestId, restaurantId },
          select: {
            id: true,
            status: true,
            channel: true,
            provider: true,
            specialRequest: true,
            conversationId: true,
            createdAt: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const conversation = request?.conversationId
    ? await prisma.conversation.findFirst({
        where: { id: request.conversationId, restaurantId },
        select: {
          id: true,
          channel: true,
          provider: true,
          status: true,
          lastMessageAt: true,
          lastMessagePreview: true,
        },
      })
    : null;

  return {
    ...reservation,
    customer,
    table,
    reservationRequest: request
      ? {
          id: request.id,
          status: request.status,
          channel: request.channel,
          provider: request.provider,
          specialRequest: request.specialRequest,
          createdAt: request.createdAt,
        }
      : null,
    conversation,
  };
}

export async function updateReservation(
  restaurantId: string,
  reservationId: string,
  patch: UpdateReservationInput
) {
  const data: Prisma.ReservationUpdateInput = {};

  if (patch.status !== undefined) data.status = patch.status;
  if (patch.reservationDate !== undefined) data.reservationDate = new Date(`${patch.reservationDate}T00:00:00.000Z`);
  if (patch.reservationTime !== undefined) data.reservationTime = patch.reservationTime;
  if (patch.partySize !== undefined) data.partySize = patch.partySize;
  if (patch.assignedTableId !== undefined) data.assignedTableId = patch.assignedTableId;
  if (patch.internalNote !== undefined) data.internalNote = patch.internalNote;

  return prisma.reservation.update({ where: { id: reservationId, restaurantId }, data });
}
