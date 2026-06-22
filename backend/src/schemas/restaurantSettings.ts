import { z } from "zod";

// Only fields that exist on the Restaurant model (see prisma/schema.prisma)
// and are safe to let OWNER/ORG_ADMIN/MANAGER edit from the beta settings UI.
// Slug and status are deliberately excluded: slug is used for routing, status
// is not yet role-protected for this phase (see AGENTS.md Phase 18).
export const updateRestaurantSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    email: z.string().trim().max(200).email().nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    defaultLanguage: z.string().trim().min(2).max(10).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export type UpdateRestaurantSettingsInput = z.infer<typeof updateRestaurantSettingsSchema>;
