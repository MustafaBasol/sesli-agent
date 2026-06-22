import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { CreateTableInput, ListTablesQuery, TableStatus, UpdateTableInput } from "../schemas/tables";
import { loadCustomerSummaries } from "./customerService";
import { buildTableListWhere } from "./tableQuery";

interface TableRow {
  id: string;
  restaurantId: string;
  tableNumber: string;
  capacity: number;
  location: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toStatus(isActive: boolean): TableStatus {
  return isActive ? "active" : "inactive";
}

function toSafeTable(row: TableRow, upcomingReservationCount?: number) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    tableNumber: row.tableNumber,
    capacity: row.capacity,
    location: row.location,
    status: toStatus(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(upcomingReservationCount !== undefined ? { upcomingReservationCount } : {}),
  };
}

/**
 * Looks up a table scoped to restaurantId. Returns null for both "does not
 * exist" and "belongs to another restaurant" — callers must not distinguish
 * the two in the response, so a probing request can't tell which is true.
 */
export async function findTableForRestaurant(restaurantId: string, tableId: string) {
  return prisma.restaurantTable.findFirst({ where: { id: tableId, restaurantId } });
}

export async function listTables(restaurantId: string, query: ListTablesQuery) {
  const where = buildTableListWhere(restaurantId, query);

  const [total, rows] = await Promise.all([
    prisma.restaurantTable.count({ where }),
    prisma.restaurantTable.findMany({
      where,
      orderBy: { tableNumber: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const tableIds = rows.map((r) => r.id);
  const now = new Date();

  const upcomingCounts = tableIds.length
    ? await prisma.reservation.groupBy({
        by: ["assignedTableId"],
        where: {
          restaurantId,
          assignedTableId: { in: tableIds },
          reservationDate: { gte: now },
          status: { in: ["pending", "confirmed"] },
        },
        _count: { _all: true },
      })
    : [];

  const countByTable = new Map(
    upcomingCounts.filter((c) => c.assignedTableId).map((c) => [c.assignedTableId as string, c._count._all])
  );

  const data = rows.map((row) => toSafeTable(row, countByTable.get(row.id) ?? 0));

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

async function loadUpcomingReservationSummaries(restaurantId: string, tableId: string) {
  const now = new Date();
  const rows = await prisma.reservation.findMany({
    where: {
      restaurantId,
      assignedTableId: tableId,
      reservationDate: { gte: now },
      status: { in: ["pending", "confirmed"] },
    },
    orderBy: { reservationDate: "asc" },
    take: 10,
    select: {
      id: true,
      customerId: true,
      reservationDate: true,
      reservationTime: true,
      partySize: true,
      status: true,
    },
  });

  const customerIds = [...new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id))];
  const customers = await loadCustomerSummaries(customerIds);

  return rows.map((row) => ({
    id: row.id,
    customerName: row.customerId ? customers.get(row.customerId)?.fullName ?? null : null,
    reservationDate: row.reservationDate,
    reservationTime: row.reservationTime,
    partySize: row.partySize,
    status: row.status,
  }));
}

export async function getTableDetail(restaurantId: string, tableId: string) {
  const table = await findTableForRestaurant(restaurantId, tableId);
  if (!table) return null;

  const upcomingReservations = await loadUpcomingReservationSummaries(restaurantId, tableId);

  return {
    ...toSafeTable(table),
    upcomingReservationCount: upcomingReservations.length,
    upcomingReservations,
  };
}

export async function createTable(restaurantId: string, input: CreateTableInput) {
  const created = await prisma.restaurantTable.create({
    data: {
      restaurantId,
      tableNumber: input.tableNumber,
      capacity: input.capacity,
      location: input.location ?? null,
      isActive: input.status ? input.status === "active" : true,
    },
  });

  return toSafeTable(created);
}

export async function updateTable(restaurantId: string, tableId: string, patch: UpdateTableInput) {
  const data: Prisma.RestaurantTableUpdateInput = {};

  if (patch.tableNumber !== undefined) data.tableNumber = patch.tableNumber;
  if (patch.capacity !== undefined) data.capacity = patch.capacity;
  if (patch.location !== undefined) data.location = patch.location;
  if (patch.status !== undefined) data.isActive = patch.status === "active";

  const updated = await prisma.restaurantTable.update({ where: { id: tableId, restaurantId }, data });
  return toSafeTable(updated);
}
