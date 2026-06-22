/**
 * Phase 28 — pure helpers for the create-reservation-request Vapi adapter.
 * Mirrors the alias/missing-field logic that already lives inline in
 * routes/webhooks/vapi.ts, pulled out so it can be unit-tested without
 * Express/Prisma, same pattern as checkAvailabilityAdapter.ts.
 *
 * Source objects come straight from Vapi's dynamic JSON payloads, so `any`
 * is used deliberately for them rather than fought with type assertions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BLOCKED_REASON_MESSAGES } from "./checkAvailabilityAdapter";
import { getVapiToolCallId } from "./toolResponse";
import {
  getValueFromAliases,
  normalizeDate,
  normalizePartySize,
  normalizePhone,
  normalizeTime,
  toDigitsOnlyPhone,
} from "./normalizers";

export interface VapiCreateReservationArgs {
  customerName: string;
  phoneNumber: string | null;
  normalizedPhone: string | null;
  email: string | null;
  reservationDate: string | null;
  reservationTime: string | null;
  partySize: number | null;
  language: string;
  specialRequest: string | null;
  callId: string | null;
}

/**
 * Extracts and normalizes create-reservation-request fields from the Vapi
 * payload. `rawBody` is passed separately from `sources` (the
 * parsed-payload + raw-body pair) because the caller-number fallback chain
 * and the toolCallId fallback for `callId` both reach into envelope shapes
 * (`message.call.customer.number`, etc.) that aren't flat key/value pairs
 * `getValueFromAliases` can search.
 */
export function extractCreateReservationRequestArgs(
  sources: any[],
  rawBody: any,
  currentYear: number
): VapiCreateReservationArgs {
  const customerName: string =
    getValueFromAliases(sources, ["customer_name", "full_name", "name", "customerName", "fullName"]) || "";

  const rawPhone =
    getValueFromAliases(sources, [
      "phone_number",
      "phone",
      "caller_phone",
      "customer_phone",
      "phoneNumber",
      "callerNumber",
      "customerPhone",
    ]) ||
    rawBody?.customer?.number ||
    rawBody?.message?.customer?.number ||
    rawBody?.message?.call?.customer?.number ||
    rawBody?.call?.customer?.number ||
    null;
  const phoneNumber = normalizePhone(rawPhone);

  const email: string | null = getValueFromAliases(sources, ["email", "customer_email", "customerEmail"]) || null;

  const reservationDate = normalizeDate(
    getValueFromAliases(sources, ["reservation_date", "date", "requested_date", "reservationDate", "localDate"]),
    currentYear
  );
  const reservationTime = normalizeTime(
    getValueFromAliases(sources, ["reservation_time", "time", "requested_time", "reservationTime", "preferredTime"])
  );
  const partySize = normalizePartySize(
    getValueFromAliases(sources, [
      "party_size",
      "partySize",
      "guests",
      "guest_count",
      "number_of_people",
      "people",
      "numberOfGuests",
    ])
  );
  const language: string = getValueFromAliases(sources, ["language", "lang"]) || "tr";
  const specialRequest: string | null =
    getValueFromAliases(sources, ["special_request", "notes", "request", "special_notes", "specialRequests"]) || null;

  const parsedCallId = sources[0]?.call_id || null;
  const callId: string | null =
    parsedCallId ||
    getValueFromAliases(sources, ["conversation_id", "conversationId"]) ||
    getVapiToolCallId(rawBody);

  return {
    customerName,
    phoneNumber,
    normalizedPhone: phoneNumber ? toDigitsOnlyPhone(phoneNumber) : null,
    email,
    reservationDate,
    reservationTime,
    partySize,
    language,
    specialRequest,
    callId,
  };
}

/** Required-field policy for this endpoint — see AGENTS.md Phase 28 item 4. */
export function computeMissingFields(args: VapiCreateReservationArgs): string[] {
  const missingFields: string[] = [];
  if (!args.customerName) missingFields.push("customer_name");
  if (!args.phoneNumber) missingFields.push("phone_number");
  if (!args.reservationDate) missingFields.push("reservation_date");
  if (!args.reservationTime) missingFields.push("reservation_time");
  if (!args.partySize) missingFields.push("party_size");
  return missingFields;
}

/**
 * Availability-policy reasons that are safe to hard-block reservation-request
 * creation on. Deliberately excludes `opening_hours_not_configured` (a
 * missing-config state, not a booking rule — see AGENTS.md Phase 28 item 6)
 * and `invalid_date`/`invalid_preferred_time`/`restaurant_not_found` (this
 * route already validates date/time itself and only calls the availability
 * service after that passes, so those reasons would indicate the
 * availability service's own validation disagrees with ours rather than a
 * real booking-policy block — conservatively, never block creation on those).
 */
export const CREATE_BLOCKING_AVAILABILITY_REASONS = new Set([
  "restaurant_inactive",
  "reservations_disabled",
  "blackout_full_day",
  "party_size_out_of_range",
  "outside_booking_window",
]);

export interface VapiCreateReservationResponse {
  success: boolean;
  message: string;
  reservation_request_id?: string;
  customer_id?: string;
  missing_fields?: string[];
  status?: string;
  next_step?: string;
  blocked_reason?: string;
  available?: boolean;
  reason?: string;
}

/** Same shape the old Next.js route's buildMissingFieldsResponse returns — kept byte-compatible. */
export function buildCreateMissingFieldsResponse(missingFields: string[]): VapiCreateReservationResponse {
  return {
    success: false,
    available: false,
    reason: "Missing Required Information",
    message: `I need the following information before continuing: ${missingFields.join(", ")}.`,
    missing_fields: missingFields,
  };
}

/** New in Phase 28 — see AGENTS.md item 6. Friendly, voice-safe rejection for a hard-blocked slot. */
export function buildAvailabilityBlockedResponse(blockedReason: string): VapiCreateReservationResponse {
  const message =
    BLOCKED_REASON_MESSAGES[blockedReason] ?? "Sorry, that date isn't available for a reservation request.";
  return {
    success: false,
    message,
    blocked_reason: blockedReason,
  };
}
