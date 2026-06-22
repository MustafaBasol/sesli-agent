import { z } from "zod";

// Mirrors the comment in prisma/schema.prisma on Reservation.status.
export const RESERVATION_STATUSES = ["pending", "confirmed", "cancelled", "no_show", "completed"] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

const statusEnum = z.enum(RESERVATION_STATUSES);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const timeOnly = z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM");

export const listReservationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: statusEnum.optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  customerId: z.string().trim().min(1).optional(),
});

export type ListReservationsQuery = z.infer<typeof listReservationsQuerySchema>;

// restaurantId, reservationRequestId, customerId, and sourceChannel are
// intentionally absent — those identify the reservation's origin and tenant,
// and must never be changeable from this endpoint.
export const updateReservationSchema = z
  .object({
    status: statusEnum.optional(),
    reservationDate: dateOnly.optional(),
    reservationTime: timeOnly.optional(),
    partySize: z.coerce.number().int().min(1).max(100).optional(),
    assignedTableId: z.string().trim().min(1).nullable().optional(),
    internalNote: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;
