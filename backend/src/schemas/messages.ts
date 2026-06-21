import { z } from "zod";

export const listMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  order: z.enum(["asc", "desc"]).default("asc"),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
