import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  ListReservationRequestsQuery,
  ReservationRequestStatus,
  UpdateReservationRequestInput,
} from "../schemas/reservationRequests";
import { buildReservationRequestListWhere } from "./reservationRequestQuery";

// ReservationRequest only stores customerId/conversationId as plain columns
// (no Prisma relation is declared between those models), so summaries are
// assembled with batched follow-up queries instead of `include`.

export interface CustomerSummary {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
  totalReservations: number;
}

export interface ConversationSummary {
  id: string;
  channel: string;
  provider: string | null;
  status: string;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
}

async function loadCustomerSummaries(customerIds: string[]): Promise<Map<string, CustomerSummary>> {
  if (customerIds.length === 0) return new Map();
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, fullName: true, phoneNumber: true, totalReservations: true },
  });
  return new Map(customers.map((c) => [c.id, c]));
}

async function loadConversationSummaries(conversationIds: string[]): Promise<Map<string, ConversationSummary>> {
  if (conversationIds.length === 0) return new Map();
  const conversations = await prisma.conversation.findMany({
    where: { id: { in: conversationIds } },
    select: { id: true, channel: true, provider: true, status: true, lastMessageAt: true, lastMessagePreview: true },
  });
  return new Map(conversations.map((c) => [c.id, c]));
}

// rawPayload can carry provider-internal call/webhook data (e.g. raw Vapi
// tool-call arguments). It must never be returned by default — only the
// detail endpoint exposes it, and only for OWNER/MANAGER with explicit opt-in.
function omitRawPayload<T extends { rawPayload: unknown }>(row: T): Omit<T, "rawPayload"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawPayload, ...rest } = row;
  return rest;
}

export async function listReservationRequests(restaurantId: string, query: ListReservationRequestsQuery) {
  const where = buildReservationRequestListWhere(restaurantId, query);

  const [total, rows] = await Promise.all([
    prisma.reservationRequest.count({ where }),
    prisma.reservationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const customerIds = [...new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id))];
  const conversationIds = [...new Set(rows.map((r) => r.conversationId).filter((id): id is string => !!id))];

  const [customers, conversations] = await Promise.all([
    loadCustomerSummaries(customerIds),
    loadConversationSummaries(conversationIds),
  ]);

  const data = rows.map((row) => ({
    ...omitRawPayload(row),
    customer: row.customerId ? customers.get(row.customerId) ?? null : null,
    conversation: row.conversationId ? conversations.get(row.conversationId) ?? null : null,
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

/**
 * Looks up a request scoped to restaurantId. Returns null for both "does not
 * exist" and "belongs to another restaurant" — callers must not distinguish
 * the two in the response, so a probing request can't tell which is true.
 */
export async function findReservationRequestForRestaurant(restaurantId: string, requestId: string) {
  return prisma.reservationRequest.findFirst({ where: { id: requestId, restaurantId } });
}

export async function getReservationRequestDetail(
  restaurantId: string,
  requestId: string,
  options: { includeRawPayload: boolean } = { includeRawPayload: false }
) {
  const request = await findReservationRequestForRestaurant(restaurantId, requestId);
  if (!request) return null;

  const [customer, conversation, messages] = await Promise.all([
    request.customerId
      ? prisma.customer.findFirst({ where: { id: request.customerId, restaurantId } })
      : Promise.resolve(null),
    request.conversationId
      ? prisma.conversation.findFirst({ where: { id: request.conversationId, restaurantId } })
      : Promise.resolve(null),
    request.conversationId
      ? prisma.message.findMany({
          where: { restaurantId, conversationId: request.conversationId },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // rawPayload can carry provider-internal call/webhook data (e.g. raw Vapi
  // tool-call arguments); it is only ever included when the caller is an
  // OWNER/MANAGER and explicitly opted in, never for STAFF or by default.
  const { rawPayload, ...rest } = request;
  return {
    ...rest,
    ...(options.includeRawPayload ? { rawPayload } : {}),
    customer,
    conversation,
    messages,
  };
}

export async function updateReservationRequest(
  restaurantId: string,
  requestId: string,
  patch: UpdateReservationRequestInput
) {
  const data: Prisma.ReservationRequestUpdateInput = {};

  if (patch.status !== undefined) data.status = patch.status;
  if (patch.internalNote !== undefined) data.internalNote = patch.internalNote;
  if (patch.partySize !== undefined) data.partySize = patch.partySize;
  if (patch.reservationDate !== undefined) data.reservationDate = new Date(`${patch.reservationDate}T00:00:00.000Z`);
  if (patch.reservationTime !== undefined) data.reservationTime = patch.reservationTime;
  if (patch.specialRequest !== undefined) data.specialRequest = patch.specialRequest;

  const updated = await prisma.reservationRequest.update({ where: { id: requestId }, data });
  return omitRawPayload(updated);
}

/**
 * Confirms a reservation request and creates the corresponding Reservation
 * row in the same transaction — confirming must never leave the request
 * marked "confirmed" without an actual Reservation record existing (or vice
 * versa). Caller must already have checked the status transition is valid
 * and that date/time/partySize are present (Reservation's columns are
 * non-nullable, unlike ReservationRequest's).
 */
export async function confirmReservationRequestWithReservation(
  restaurantId: string,
  request: {
    id: string;
    customerId: string | null;
    channel: string;
    reservationDate: Date;
    reservationTime: string;
    partySize: number;
  }
) {
  const [updated] = await prisma.$transaction([
    prisma.reservationRequest.update({ where: { id: request.id }, data: { status: "confirmed" } }),
    prisma.reservation.create({
      data: {
        restaurantId,
        reservationRequestId: request.id,
        customerId: request.customerId,
        sourceChannel: request.channel,
        reservationDate: request.reservationDate,
        reservationTime: request.reservationTime,
        partySize: request.partySize,
        status: "confirmed",
      },
    }),
  ]);

  return omitRawPayload(updated);
}

export async function setReservationRequestStatus(
  requestId: string,
  status: ReservationRequestStatus,
  internalNote?: string
) {
  const updated = await prisma.reservationRequest.update({
    where: { id: requestId },
    data: {
      status,
      ...(internalNote !== undefined ? { internalNote } : {}),
    },
  });
  return omitRawPayload(updated);
}
