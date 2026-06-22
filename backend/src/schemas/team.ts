import { z } from "zod";

// Mirrors the RestaurantUser.role / .status string fields (see prisma/schema.prisma).
export const RESTAURANT_ROLES = ["OWNER", "MANAGER", "STAFF"] as const;
export type RestaurantRole = (typeof RESTAURANT_ROLES)[number];

export const MEMBERSHIP_STATUSES = ["active", "inactive"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

const restaurantRoleEnum = z.enum(RESTAURANT_ROLES);
const membershipStatusEnum = z.enum(MEMBERSHIP_STATUSES);

export const listTeamQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: restaurantRoleEnum.optional(),
  status: membershipStatusEnum.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListTeamQuery = z.infer<typeof listTeamQuerySchema>;

// Existing-user-only add (no Invitation model yet, no email sending in this
// phase). userId is never accepted directly — only email, looked up server-side.
export const addTeamMemberSchema = z
  .object({
    email: z.string().trim().min(1).max(200).email(),
    restaurantRole: restaurantRoleEnum,
  })
  .strict();

export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

export const updateTeamMemberSchema = z
  .object({
    restaurantRole: restaurantRoleEnum.optional(),
    membershipStatus: membershipStatusEnum.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
