import { z } from "zod";

export const dashboardRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export type DashboardRecentQuery = z.infer<typeof dashboardRecentQuerySchema>;
