import { z } from "zod";

// RestaurantTable only stores isActive as a boolean (see prisma/schema.prisma).
// The API surface exposes it as a status string for consistency with other
// list/detail endpoints (e.g. reservation/customer status fields).
export const TABLE_STATUSES = ["active", "inactive"] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

const statusEnum = z.enum(TABLE_STATUSES);

export const listTablesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: statusEnum.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListTablesQuery = z.infer<typeof listTablesQuerySchema>;

// restaurantId is intentionally absent — it is always taken from the route's
// verified restaurant context, never from the request body.
export const createTableSchema = z
  .object({
    tableNumber: z.string().trim().min(1).max(50),
    capacity: z.coerce.number().int().min(1).max(100),
    location: z.string().trim().max(100).nullable().optional(),
    status: statusEnum.optional(),
  })
  .strict();

export type CreateTableInput = z.infer<typeof createTableSchema>;

export const updateTableSchema = z
  .object({
    tableNumber: z.string().trim().min(1).max(50).optional(),
    capacity: z.coerce.number().int().min(1).max(100).optional(),
    location: z.string().trim().max(100).nullable().optional(),
    status: statusEnum.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export type UpdateTableInput = z.infer<typeof updateTableSchema>;
