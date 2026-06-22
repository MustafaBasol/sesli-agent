import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { ListCustomersQuery, UpdateCustomerInput } from "../schemas/customers";
import { toDigitsOnlyPhone } from "../utils/vapi/normalizers";
import { buildCustomerListWhere } from "./customerQuery";

// Reused by conversationService for the "customer summary" shown alongside
// conversation/reservation rows — kept here since Customer is the owning model.
export interface CustomerSummary {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
  email: string | null;
}

export async function loadCustomerSummaries(customerIds: string[]): Promise<Map<string, CustomerSummary>> {
  if (customerIds.length === 0) return new Map();
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, fullName: true, phoneNumber: true, email: true },
  });
  return new Map(customers.map((c) => [c.id, c]));
}

/**
 * Looks up a customer scoped to restaurantId. Returns null for both "does
 * not exist" and "belongs to another restaurant" so callers can respond 404
 * without distinguishing the two cases to a probing request.
 */
export async function findCustomerForRestaurant(restaurantId: string, customerId: string) {
  return prisma.customer.findFirst({ where: { id: customerId, restaurantId } });
}

export async function listCustomers(restaurantId: string, query: ListCustomersQuery) {
  const where = buildCustomerListWhere(restaurantId, query);

  const [total, rows] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const customerIds = rows.map((c) => c.id);

  const [reservationCounts, conversationStats] = await Promise.all([
    customerIds.length
      ? prisma.reservationRequest.groupBy({
          by: ["customerId"],
          where: { restaurantId, customerId: { in: customerIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    customerIds.length
      ? prisma.conversation.groupBy({
          by: ["customerId"],
          where: { restaurantId, customerId: { in: customerIds } },
          _count: { _all: true },
          _max: { lastMessageAt: true },
        })
      : Promise.resolve([]),
  ]);

  const reservationCountByCustomer = new Map(
    reservationCounts.filter((r) => r.customerId).map((r) => [r.customerId as string, r._count._all])
  );
  const conversationCountByCustomer = new Map(
    conversationStats.filter((c) => c.customerId).map((c) => [c.customerId as string, c._count._all])
  );
  const lastContactByCustomer = new Map(
    conversationStats.filter((c) => c.customerId).map((c) => [c.customerId as string, c._max.lastMessageAt])
  );

  const data = rows.map((customer) => ({
    id: customer.id,
    fullName: customer.fullName,
    phoneNumber: customer.phoneNumber,
    normalizedPhone: customer.normalizedPhone,
    email: customer.email,
    totalReservations: customer.totalReservations,
    lastVisitAt: customer.lastVisitAt,
    createdAt: customer.createdAt,
    reservationRequestCount: reservationCountByCustomer.get(customer.id) ?? 0,
    conversationCount: conversationCountByCustomer.get(customer.id) ?? 0,
    lastContactAt: lastContactByCustomer.get(customer.id) ?? customer.lastVisitAt ?? null,
  }));

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

// Recent reservation-request/conversation rows embedded in customer detail
// are deliberately fetched with an explicit `select` instead of a bare
// findMany — rawPayload/stateJson (and any other internal/debug field added
// later) must never reach this response, so the allowlist is enforced at
// the query itself rather than relying on a later omit step.
async function loadRecentReservationRequests(restaurantId: string, customerId: string) {
  return prisma.reservationRequest.findMany({
    where: { restaurantId, customerId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      channel: true,
      provider: true,
      requestType: true,
      customerName: true,
      phoneNumber: true,
      partySize: true,
      reservationDate: true,
      reservationTime: true,
      language: true,
      specialRequest: true,
      internalNote: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function loadRecentConversations(restaurantId: string, customerId: string) {
  return prisma.conversation.findMany({
    where: { restaurantId, customerId },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      channel: true,
      provider: true,
      externalThreadId: true,
      customerName: true,
      customerPhone: true,
      customerHandle: true,
      status: true,
      assignedToUserId: true,
      lastMessageAt: true,
      lastMessagePreview: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getCustomerDetail(restaurantId: string, customerId: string) {
  const customer = await findCustomerForRestaurant(restaurantId, customerId);
  if (!customer) return null;

  const [reservationRequests, conversations] = await Promise.all([
    loadRecentReservationRequests(restaurantId, customerId),
    loadRecentConversations(restaurantId, customerId),
  ]);

  return { ...customer, reservationRequests, conversations };
}

export async function updateCustomer(restaurantId: string, customerId: string, patch: UpdateCustomerInput) {
  const data: Prisma.CustomerUpdateInput = {};

  if (patch.fullName !== undefined) data.fullName = patch.fullName;
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.phoneNumber !== undefined) {
    data.phoneNumber = patch.phoneNumber;
    data.normalizedPhone = patch.phoneNumber ? toDigitsOnlyPhone(patch.phoneNumber) : null;
  }

  return prisma.customer.update({ where: { id: customerId, restaurantId }, data });
}
