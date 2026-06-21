import { z } from "zod";

// Mirrors the comment in prisma/schema.prisma on Conversation.status.
export const CONVERSATION_STATUSES = ["open", "pending", "closed", "archived"] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

const statusEnum = z.enum(CONVERSATION_STATUSES);

export const listConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  channel: z.string().trim().min(1).optional(),
  provider: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).optional(),
  status: statusEnum.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
