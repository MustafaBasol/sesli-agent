/**
 * Phase 34 — pure helpers for the cancel-reservation-request Vapi adapter.
 * Same pattern as handoffToStaffAdapter.ts: no Prisma, no Express —
 * extraction, missing-field, bounding, and response-shape logic only, so it
 * is unit-testable without a database.
 *
 * Storage/mutation policy decided in Phase 32
 * (docs/vapi-modify-cancel-handoff-decision-pack.md Section 3B) and refined
 * in Phase 34: only an unambiguous *pending* ReservationRequest may be
 * auto-cancelled, via the existing status-transition machinery. A confirmed
 * Reservation is never directly cancelled by voice — it is always logged as
 * an auditable cancellation intent for staff review. Hard-delete is never
 * performed.
 *
 * Source objects come straight from Vapi's dynamic JSON payloads, so `any`
 * is used deliberately for them rather than fought with type assertions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getVapiToolCallId } from "./toolResponse";
import {
  getValueFromAliases,
  normalizeDate,
  normalizePartySize,
  normalizePhone,
  normalizeTime,
  toDigitsOnlyPhone,
} from "./normalizers";

const RESERVATION_REQUEST_ID_ALIASES = ["reservationRequestId", "reservation_request_id", "requestId", "request_id"];
const RESERVATION_ID_ALIASES = ["reservationId", "reservation_id"];
const CALL_ID_ALIASES = ["call_id", "callId", "conversation_id", "conversationId", "vapiCallId", "id"];
const NAME_ALIASES = ["customerName", "name", "fullName", "customer_name", "full_name"];
const PHONE_ALIASES = ["phone", "phoneNumber", "callerNumber", "customerPhone"];
const EMAIL_ALIASES = ["email", "customerEmail"];
const DATE_ALIASES = ["date", "reservationDate", "reservation_date", "localDate"];
const TIME_ALIASES = ["time", "reservationTime", "reservation_time", "preferredTime"];
const PARTY_SIZE_ALIASES = ["partySize", "party_size", "numberOfGuests", "guests", "guestCount", "guest_count"];
const REASON_ALIASES = ["reason", "cancellationReason", "cancellation_reason"];
const LANGUAGE_ALIASES = ["language", "lang", "locale"];

/** Bounding policy — mirrors handoffToStaffAdapter's truncation approach. */
export const MAX_REASON_LENGTH = 2000;

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function extractCallId(sources: any[], rawBody: any): string | null {
  const parsedCallId = sources[0]?.call_id || null;
  return (
    parsedCallId ||
    getValueFromAliases(sources, CALL_ID_ALIASES) ||
    rawBody?.message?.call?.id ||
    rawBody?.call?.id ||
    getVapiToolCallId(rawBody) ||
    null
  );
}

function extractPhone(sources: any[], rawBody: any): string | null {
  const rawPhone =
    getValueFromAliases(sources, PHONE_ALIASES) ||
    rawBody?.customer?.number ||
    rawBody?.message?.customer?.number ||
    rawBody?.message?.call?.customer?.number ||
    rawBody?.call?.customer?.number ||
    null;
  return normalizePhone(rawPhone);
}

export interface VapiCancelReservationRequestArgs {
  reservationRequestId: string | null;
  reservationId: string | null;
  callId: string | null;
  customerName: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  email: string | null;
  date: string | null;
  time: string | null;
  partySize: number | null;
  reason: string | null;
  language: string | null;
  toolCallId: string | null;
}

export function extractCancelReservationRequestArgs(
  sources: any[],
  rawBody: any,
  currentYear: number
): VapiCancelReservationRequestArgs {
  const phone = extractPhone(sources, rawBody);
  const rawReason = getValueFromAliases(sources, REASON_ALIASES);

  return {
    reservationRequestId: getValueFromAliases(sources, RESERVATION_REQUEST_ID_ALIASES) || null,
    reservationId: getValueFromAliases(sources, RESERVATION_ID_ALIASES) || null,
    callId: extractCallId(sources, rawBody),
    customerName: getValueFromAliases(sources, NAME_ALIASES) || null,
    phone,
    normalizedPhone: phone ? toDigitsOnlyPhone(phone) : null,
    email: getValueFromAliases(sources, EMAIL_ALIASES) || null,
    date: normalizeDate(getValueFromAliases(sources, DATE_ALIASES), currentYear),
    time: normalizeTime(getValueFromAliases(sources, TIME_ALIASES)),
    partySize: normalizePartySize(getValueFromAliases(sources, PARTY_SIZE_ALIASES)),
    reason: rawReason ? String(rawReason) : null,
    language: getValueFromAliases(sources, LANGUAGE_ALIASES) || null,
    toolCallId: getVapiToolCallId(rawBody),
  };
}

/**
 * Required-field policy: no single field is mandatory, but at least one
 * useful identifier must be present — otherwise there is nothing to act on
 * or even log.
 */
export function computeCancelReservationRequestMissingFields(args: VapiCancelReservationRequestArgs): string[] {
  const hasSomething = Boolean(
    args.reservationRequestId ||
      args.reservationId ||
      args.phone ||
      args.customerName ||
      args.date ||
      args.time ||
      args.callId ||
      args.reason
  );
  return hasSomething
    ? []
    : ["reservationRequestId_or_reservationId_or_phone_or_customerName_or_date_or_time_or_callId_or_reason"];
}

export type CancelMatchStatus = "exact" | "unmatched" | "ambiguous" | "confirmed_reservation_review_required";
export type CancelActionTaken = "pending_request_cancelled" | "intent_logged" | "review_required";

export interface VapiCancelReservationRequestResponse {
  success: boolean;
  message: string;
  cancellation_requested?: boolean;
  cancellation_logged?: boolean;
  reservation_request_cancelled?: boolean;
  requires_review?: boolean;
  match_status?: string;
  event_id?: string;
  reservation_request_id?: string;
  missing_fields?: string[];
}

const MISSING_FIELDS_TEXT: Record<string, string> = {
  fr: "Je n'ai pas assez d'informations pour traiter votre demande d'annulation. Pouvez-vous préciser votre nom, votre numéro, ou la date de la réservation ?",
  tr: "İptal talebinizi işleme almak için yeterli bilgim yok. Adınızı, telefon numaranızı veya rezervasyon tarihini belirtebilir misiniz?",
  en: "I don't have enough information to process this cancellation yet. Could you give me your name, phone number, or the reservation date?",
};

const PENDING_CANCELLED_TEXT: Record<string, string> = {
  fr: "Votre demande de réservation en attente a été annulée.",
  tr: "Bekleyen rezervasyon talebiniz iptal edildi.",
  en: "Your pending reservation request has been cancelled.",
};

const REVIEW_REQUIRED_TEXT: Record<string, string> = {
  fr: "Votre demande d'annulation a été enregistrée pour que l'équipe du restaurant puisse l'examiner.",
  tr: "İptal talebiniz, restoran ekibinin incelemesi için kaydedildi.",
  en: "Your cancellation request has been recorded for the restaurant team to review.",
};

function resolveText(table: Record<string, string>, language: string | null): string {
  const lang = language && table[language] ? language : "en";
  return table[lang];
}

export function buildCancelMissingFieldsResponse(
  missingFields: string[],
  language: string | null
): VapiCancelReservationRequestResponse {
  return {
    success: false,
    message: resolveText(MISSING_FIELDS_TEXT, language),
    missing_fields: missingFields,
  };
}

export function buildPendingCancelledResponse(
  language: string | null,
  reservationRequestId: string
): VapiCancelReservationRequestResponse {
  return {
    success: true,
    message: resolveText(PENDING_CANCELLED_TEXT, language),
    cancellation_requested: true,
    reservation_request_cancelled: true,
    match_status: "exact",
    reservation_request_id: reservationRequestId,
  };
}

export function buildReviewRequiredResponse(
  language: string | null,
  eventId: string,
  matchStatus: CancelMatchStatus
): VapiCancelReservationRequestResponse {
  return {
    success: true,
    message: resolveText(REVIEW_REQUIRED_TEXT, language),
    cancellation_requested: true,
    cancellation_logged: true,
    requires_review: true,
    match_status: matchStatus,
    event_id: eventId,
  };
}

/** Safe, bounded metadata persisted on IntegrationEvent.payload — never the raw Vapi body. */
export interface SafeCancelReservationRequestPayload {
  callId: string | null;
  reservationRequestId?: string;
  reservationId?: string;
  customerName?: string;
  phone?: string;
  email?: string;
  date?: string;
  time?: string;
  partySize?: number;
  reason?: string;
  language?: string;
  matchStatus: CancelMatchStatus;
  actionTaken: CancelActionTaken;
  requestedAt: string;
  source: "vapi";
}

export function buildSafeCancelReservationRequestPayload(
  args: VapiCancelReservationRequestArgs,
  matchStatus: CancelMatchStatus,
  actionTaken: CancelActionTaken,
  now: Date = new Date()
): SafeCancelReservationRequestPayload {
  return {
    callId: args.callId,
    ...(args.reservationRequestId ? { reservationRequestId: args.reservationRequestId } : {}),
    ...(args.reservationId ? { reservationId: args.reservationId } : {}),
    ...(args.customerName ? { customerName: args.customerName } : {}),
    ...(args.phone ? { phone: args.phone } : {}),
    ...(args.email ? { email: args.email } : {}),
    ...(args.date ? { date: args.date } : {}),
    ...(args.time ? { time: args.time } : {}),
    ...(args.partySize ? { partySize: args.partySize } : {}),
    ...(args.reason ? { reason: truncateText(args.reason, MAX_REASON_LENGTH) } : {}),
    ...(args.language ? { language: args.language } : {}),
    matchStatus,
    actionTaken,
    requestedAt: now.toISOString(),
    source: "vapi",
  };
}
