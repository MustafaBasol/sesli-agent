import type { Prisma } from "@prisma/client";
import type { ListConversationsQuery } from "../schemas/conversations";

export function buildConversationListWhere(
  restaurantId: string,
  filters: Pick<ListConversationsQuery, "channel" | "provider" | "customerId" | "status" | "search">
): Prisma.ConversationWhereInput {
  const where: Prisma.ConversationWhereInput = { restaurantId };

  if (filters.channel) where.channel = filters.channel;
  if (filters.provider) where.provider = filters.provider;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.status) where.status = filters.status;

  if (filters.search) {
    where.OR = [
      { customerName: { contains: filters.search, mode: "insensitive" } },
      { customerPhone: { contains: filters.search } },
      { externalThreadId: { contains: filters.search } },
    ];
  }

  return where;
}
