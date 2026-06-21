import { prisma } from "../prisma/client";
import type { ListConversationsQuery } from "../schemas/conversations";
import { loadCustomerSummaries } from "./customerService";
import { buildConversationListWhere } from "./conversationQuery";
import { listMessagesForConversation } from "./messageService";

export async function listConversations(restaurantId: string, query: ListConversationsQuery) {
  const where = buildConversationListWhere(restaurantId, query);

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const conversationIds = rows.map((c) => c.id);
  const customerIds = [...new Set(rows.map((c) => c.customerId).filter((id): id is string => !!id))];

  const [customers, messageCounts, reservationCounts] = await Promise.all([
    loadCustomerSummaries(customerIds),
    conversationIds.length
      ? prisma.message.groupBy({
          by: ["conversationId"],
          where: { restaurantId, conversationId: { in: conversationIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    conversationIds.length
      ? prisma.reservationRequest.groupBy({
          by: ["conversationId"],
          where: { restaurantId, conversationId: { in: conversationIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const messageCountByConversation = new Map(messageCounts.map((m) => [m.conversationId, m._count._all]));
  const reservationCountByConversation = new Map(
    reservationCounts.filter((r) => r.conversationId).map((r) => [r.conversationId as string, r._count._all])
  );

  const data = rows.map((conversation) => ({
    id: conversation.id,
    channel: conversation.channel,
    provider: conversation.provider,
    externalThreadId: conversation.externalThreadId,
    customerName: conversation.customerName,
    customerPhone: conversation.customerPhone,
    customerHandle: conversation.customerHandle,
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt,
    lastMessagePreview: conversation.lastMessagePreview,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    customer: conversation.customerId ? customers.get(conversation.customerId) ?? null : null,
    messageCount: messageCountByConversation.get(conversation.id) ?? 0,
    reservationRequestCount: reservationCountByConversation.get(conversation.id) ?? 0,
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
 * Looks up a conversation scoped to restaurantId. Returns null for both
 * "does not exist" and "belongs to another restaurant" so callers can
 * respond 404 without distinguishing the two cases to a probing request.
 */
export async function findConversationForRestaurant(restaurantId: string, conversationId: string) {
  return prisma.conversation.findFirst({ where: { id: conversationId, restaurantId } });
}

export async function getConversationDetail(restaurantId: string, conversationId: string) {
  const conversation = await findConversationForRestaurant(restaurantId, conversationId);
  if (!conversation) return null;

  const [customer, messages] = await Promise.all([
    conversation.customerId
      ? prisma.customer.findFirst({ where: { id: conversation.customerId, restaurantId } })
      : Promise.resolve(null),
    // Raw provider payloads are never exposed on the conversation detail view —
    // use the dedicated messages endpoint with the explicit opt-in flag for that.
    listMessagesForConversation(
      restaurantId,
      conversationId,
      { page: 1, pageSize: 50, order: "asc" },
      { includeRawPayload: false }
    ),
  ]);

  return { ...conversation, customer, messages: messages.data, messagesPagination: messages.pagination };
}
