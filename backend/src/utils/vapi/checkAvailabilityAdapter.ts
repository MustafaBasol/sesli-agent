/**
 * Adapter between the Phase 25 calculateAvailabilitySlots() service and the
 * Vapi check-availability tool contract. Pure (no Prisma) so it is testable
 * without a database — the route in routes/webhooks/vapi.ts owns tenant
 * resolution, rate limiting, and ToolLog writes.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AvailabilitySlotResult } from "../../services/availabilitySlotTypes";
import { getValueFromAliases, normalizeDate, normalizePartySize, normalizeTime } from "./normalizers";

export interface VapiCheckAvailabilityArgs {
  localDate: string | null;
  partySize: number | null;
  preferredTime: string | null;
}

/** Extracts date/partySize/preferredTime from the main payload shapes Vapi sends for this tool. */
export function extractCheckAvailabilityArgs(sources: any[], currentYear: number): VapiCheckAvailabilityArgs {
  const localDate = normalizeDate(
    getValueFromAliases(sources, ["date", "localDate", "reservation_date", "requested_date"]),
    currentYear
  );
  const partySize = normalizePartySize(
    getValueFromAliases(sources, [
      "partySize",
      "party_size",
      "numberOfGuests",
      "number_of_guests",
      "guests",
      "guest_count",
      "people",
    ])
  );
  const preferredTime = normalizeTime(
    getValueFromAliases(sources, ["preferredTime", "time", "reservation_time", "requested_time"])
  );

  return { localDate, partySize, preferredTime };
}

export interface VapiCheckAvailabilityResponse {
  success: boolean;
  available: boolean;
  message: string;
  reason?: string;
  missing_fields?: string[];
  date?: string;
  time?: string;
  partySize?: number;
  available_slots?: string[];
  suggested_times?: string[];
  blocked_reason?: string;
}

export function buildMissingArgsResponse(missingFields: string[]): VapiCheckAvailabilityResponse {
  return {
    success: false,
    available: false,
    message: `I need the following information before checking availability: ${missingFields.join(", ")}.`,
    missing_fields: missingFields,
  };
}

const BLOCKED_REASON_MESSAGES: Record<string, string> = {
  restaurant_not_found: "Sorry, I couldn't find that restaurant.",
  restaurant_inactive: "Sorry, this restaurant isn't accepting reservations right now.",
  reservations_disabled: "Sorry, online reservations are currently disabled.",
  party_size_out_of_range: "Sorry, that party size isn't supported for online booking.",
  invalid_date: "Sorry, I couldn't understand that date.",
  invalid_preferred_time: "Sorry, I couldn't understand that time.",
  outside_booking_window: "Sorry, that date is outside our booking window.",
  opening_hours_not_configured: "Sorry, we don't have hours set up for that day yet.",
  blackout_full_day: "Sorry, we're closed on that date.",
};

const MAX_SUGGESTED_TIMES = 5;

/** Maps a Phase 25 AvailabilitySlotResult to the Vapi-compatible response shape. */
export function mapAvailabilityResultToVapiResponse(
  result: AvailabilitySlotResult,
  preferredTime: string | null
): VapiCheckAvailabilityResponse {
  const { localDate, partySize } = result;

  if (result.blockedReason) {
    const message = BLOCKED_REASON_MESSAGES[result.blockedReason] ?? "Sorry, that date isn't available for booking.";
    return {
      success: true,
      available: false,
      message,
      blocked_reason: result.blockedReason,
      date: localDate,
      ...(preferredTime ? { time: preferredTime } : {}),
      partySize,
    };
  }

  const availableSlotTimes = result.availableSlots.filter((slot) => slot.available).map((slot) => slot.time);
  const suggestedTimes = availableSlotTimes.slice(0, MAX_SUGGESTED_TIMES);

  if (preferredTime) {
    const isAvailable = result.preferredTime?.available ?? false;
    const message = isAvailable
      ? `Yes, ${preferredTime} on ${localDate} is available for ${partySize} guests.`
      : availableSlotTimes.length > 0
        ? `Sorry, ${preferredTime} is not available. Other available times: ${suggestedTimes.join(", ")}.`
        : `Sorry, ${preferredTime} is not available and there are no other open times on ${localDate}.`;

    return {
      success: true,
      available: isAvailable,
      message,
      date: localDate,
      time: preferredTime,
      partySize,
      available_slots: availableSlotTimes,
      ...(isAvailable ? {} : { suggested_times: suggestedTimes }),
    };
  }

  const hasAvailability = availableSlotTimes.length > 0;
  const message = hasAvailability
    ? `We have availability on ${localDate} for ${partySize} guests. Some available times: ${suggestedTimes.join(", ")}.`
    : `Sorry, there are no available times on ${localDate} for ${partySize} guests.`;

  return {
    success: true,
    available: hasAvailability,
    message,
    date: localDate,
    partySize,
    available_slots: availableSlotTimes,
    ...(hasAvailability ? { suggested_times: suggestedTimes } : {}),
  };
}
