import { z } from "zod";

export const MENU_STATUSES = ["active", "inactive"] as const;
export type MenuStatus = (typeof MENU_STATUSES)[number];

const statusEnum = z.enum(MENU_STATUSES);

// Bounded array of short strings — used for allergens/dietary tags/aliases.
// Keeps the JSON columns from accepting arbitrarily large/nested payloads.
const stringListSchema = z.array(z.string().trim().min(1).max(60)).max(30);

// --- Categories ---------------------------------------------------------

export const listMenuCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: statusEnum.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListMenuCategoriesQuery = z.infer<typeof listMenuCategoriesQuerySchema>;

export const createMenuCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(2000).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
    status: statusEnum.optional(),
  })
  .strict();

export type CreateMenuCategoryInput = z.infer<typeof createMenuCategorySchema>;

export const updateMenuCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
    status: statusEnum.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export type UpdateMenuCategoryInput = z.infer<typeof updateMenuCategorySchema>;

// --- Items ---------------------------------------------------------------

export const listMenuItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().trim().min(1).max(100).optional(),
  status: statusEnum.optional(),
  isAvailable: z.coerce.boolean().optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListMenuItemsQuery = z.infer<typeof listMenuItemsQuerySchema>;

export const createMenuItemSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(2000).nullable().optional(),
    categoryId: z.string().trim().min(1).max(100).nullable().optional(),
    priceCents: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
    currency: z.string().trim().min(3).max(8).optional(),
    allergensJson: stringListSchema.optional(),
    dietaryTagsJson: stringListSchema.optional(),
    aliasesJson: stringListSchema.optional(),
    isAvailable: z.coerce.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
    status: statusEnum.optional(),
  })
  .strict();

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;

export const updateMenuItemSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    categoryId: z.string().trim().min(1).max(100).nullable().optional(),
    priceCents: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
    currency: z.string().trim().min(3).max(8).optional(),
    allergensJson: stringListSchema.optional(),
    dietaryTagsJson: stringListSchema.optional(),
    aliasesJson: stringListSchema.optional(),
    isAvailable: z.coerce.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
    status: statusEnum.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
