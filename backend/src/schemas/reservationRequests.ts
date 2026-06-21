import { z } from "zod";

// Mirrors the comment in prisma/schema.prisma on ReservationRequest.status.
export const RESERVATION_REQUEST_STATUSES = [
  "new",
  "pending_info",
  "confirmed",
  "rejected",
  "cancelled",
  "done",
] as const;

export type ReservationRequestStatus = (typeof RESERVATION_REQUEST_STATUSES)[number];

const statusEnum = z.enum(RESERVATION_REQUEST_STATUSES);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const timeOnly = z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM");

export const listReservationRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: statusEnum.optional(),
  channel: z.string().trim().min(1).optional(),
  provider: z.string().trim().min(1).optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListReservationRequestsQuery = z.infer<typeof listReservationRequestsQuerySchema>;

// restaurantId, customerId, provider, and sourceExternalId are intentionally
// absent — those identify the request's origin and tenant, and must never
// be changeable from this endpoint.
export const updateReservationRequestSchema = z
  .object({
    status: statusEnum.optional(),
    internalNote: z.string().max(2000).nullable().optional(),
    partySize: z.coerce.number().int().min(1).max(100).optional(),
    reservationDate: dateOnly.optional(),
    reservationTime: timeOnly.optional(),
    specialRequest: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export type UpdateReservationRequestInput = z.infer<typeof updateReservationRequestSchema>;

export const rejectReservationRequestSchema = z
  .object({
    reason: z.string().max(2000).optional(),
  })
  .strict();

export type RejectReservationRequestInput = z.infer<typeof rejectReservationRequestSchema>;
