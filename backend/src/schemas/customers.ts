import { z } from "zod";

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

// restaurantId and normalizedPhone are intentionally absent — normalizedPhone
// is always recomputed from phoneNumber server-side, never accepted directly.
export const updateCustomerSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).nullable().optional(),
    phoneNumber: z.string().trim().min(1).max(50).nullable().optional(),
    email: z.string().trim().max(200).email().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
