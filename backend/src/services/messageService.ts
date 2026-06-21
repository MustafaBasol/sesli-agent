import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { ListMessagesQuery } from "../schemas/messages";

export interface ListMessagesOptions {
  includeRawPayload: boolean;
}

/**
 * Paginated message history for a conversation. Caller is responsible for
 * verifying the conversation belongs to restaurantId before calling this —
 * the restaurantId filter here is defense in depth, not the access check.
 */
export async function listMessagesForConversation(
  restaurantId: string,
  conversationId: string,
  query: ListMessagesQuery,
  options: ListMessagesOptions = { includeRawPayload: false }
) {
  const where: Prisma.MessageWhereInput = { restaurantId, conversationId };

  const [total, rows] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      orderBy: { createdAt: query.order },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  // rawPayload can carry provider-internal data (e.g. raw webhook bodies); it
  // is only ever included when the caller explicitly opts in and the route
  // has already verified the caller's role permits it.
  const data = rows.map(({ rawPayload, ...rest }) => (options.includeRawPayload ? { ...rest, rawPayload } : rest));

  return {
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      order: query.order,
    },
  };
}
