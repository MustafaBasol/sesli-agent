import { z } from "zod";

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const localDateSchema = z.string().regex(LOCAL_DATE_RE, "localDate must be in YYYY-MM-DD format");
const localTimeSchema = z.string().regex(LOCAL_TIME_RE, "time must be in HH:mm format");

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

// restaurantId is intentionally absent from every schema below — it always
// comes from the route's verified restaurant context, never the body.
export const updateAvailabilitySettingsSchema = z
  .object({
    reservationsEnabled: z.boolean().optional(),
    openingHoursJson: z.unknown().nullable().optional(),
    slotIntervalMinutes: z.coerce.number().int().min(5).max(240).optional(),
    defaultReservationDurationMinutes: z.coerce.number().int().min(15).max(480).optional(),
    minAdvanceMinutes: z.coerce.number().int().min(0).optional(),
    bookingWindowDays: z.coerce.number().int().min(1).max(365).optional(),
    minPartySize: z.coerce.number().int().min(1).optional(),
    maxPartySize: z.coerce.number().int().min(1).optional(),
    maxReservationsPerSlot: z.coerce.number().int().min(1).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" })
  .refine(
    (data) =>
      data.minPartySize === undefined || data.maxPartySize === undefined || data.maxPartySize >= data.minPartySize,
    { message: "maxPartySize must be greater than or equal to minPartySize", path: ["maxPartySize"] }
  );

export type UpdateAvailabilitySettingsInput = z.infer<typeof updateAvailabilitySettingsSchema>;

export const BLACKOUT_STATUSES = ["active", "inactive"] as const;
export type BlackoutStatus = (typeof BLACKOUT_STATUSES)[number];

export const listBlackoutDatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(BLACKOUT_STATUSES).optional(),
  fromDate: localDateSchema.optional(),
  toDate: localDateSchema.optional(),
});

export type ListBlackoutDatesQuery = z.infer<typeof listBlackoutDatesQuerySchema>;

const blackoutTimeWindowRefinement = (data: {
  isFullDay?: boolean;
  startsAtLocal?: string | null;
  endsAtLocal?: string | null;
}) => {
  if (data.isFullDay === false) {
    if (!data.startsAtLocal || !data.endsAtLocal) return false;
    return timeToMinutes(data.endsAtLocal) > timeToMinutes(data.startsAtLocal);
  }
  return true;
};

export const createBlackoutDateSchema = z
  .object({
    localDate: localDateSchema,
    isFullDay: z.boolean().default(true),
    startsAtLocal: localTimeSchema.nullable().optional(),
    endsAtLocal: localTimeSchema.nullable().optional(),
    reason: z.string().trim().max(500).nullable().optional(),
    status: z.enum(BLACKOUT_STATUSES).optional(),
  })
  .strict()
  .refine(blackoutTimeWindowRefinement, {
    message: "startsAtLocal and endsAtLocal are required and endsAtLocal must be after startsAtLocal when isFullDay is false",
    path: ["endsAtLocal"],
  });

export type CreateBlackoutDateInput = z.infer<typeof createBlackoutDateSchema>;

export const updateBlackoutDateSchema = z
  .object({
    localDate: localDateSchema.optional(),
    isFullDay: z.boolean().optional(),
    startsAtLocal: localTimeSchema.nullable().optional(),
    endsAtLocal: localTimeSchema.nullable().optional(),
    reason: z.string().trim().max(500).nullable().optional(),
    status: z.enum(BLACKOUT_STATUSES).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" })
  .refine(blackoutTimeWindowRefinement, {
    message: "startsAtLocal and endsAtLocal are required and endsAtLocal must be after startsAtLocal when isFullDay is false",
    path: ["endsAtLocal"],
  });

export type UpdateBlackoutDateInput = z.infer<typeof updateBlackoutDateSchema>;
