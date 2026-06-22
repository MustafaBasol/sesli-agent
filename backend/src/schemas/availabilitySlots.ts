import { z } from "zod";

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// restaurantId is intentionally absent — it always comes from the route's
// verified restaurant context, never the query string.
export const availabilitySlotsQuerySchema = z
  .object({
    date: z.string().regex(LOCAL_DATE_RE, "date must be in YYYY-MM-DD format"),
    partySize: z.coerce.number().int().min(1).max(100),
    preferredTime: z.string().regex(LOCAL_TIME_RE, "preferredTime must be in HH:mm format").optional(),
  })
  .strict();

export type AvailabilitySlotsQuery = z.infer<typeof availabilitySlotsQuerySchema>;
