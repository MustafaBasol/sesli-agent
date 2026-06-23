/**
 * Phase 35 — pure helpers for the modify-reservation-request Vapi adapter.
 * Same pattern as cancelReservationRequestAdapter.ts: no Prisma, no Express —
 * extraction, missing-field, bounding, and response-shape logic only, so it
 * is unit-testable without a database.
 *
 * Storage/mutation policy decided in Phase 32
 * (docs/vapi-modify-cancel-handoff-decision-pack.md Section 3A) and refined
 * in Phase 35: a voice-initiated modification never directly mutates a
 * ReservationRequest's or Reservation's date/time/party/status. Instead, the
 * intent is always logged as an auditable IntegrationEvent and, where the
 * schema can cleanly support it, recorded as a new pending
 * ReservationRequest with requestType "change" for restaurant-team review.
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
const CALL_ID_ALIASES = ["callId", "call_id", "conversationId", "vapiCallId", "id"];
const NAME_ALIASES = ["customerName", "name", "fullName"];
const PHONE_ALIASES = ["phone", "phoneNumber", "callerNumber", "customerPhone"];
const EMAIL_ALIASES = ["email", "customerEmail"];
const CURRENT_DATE_ALIASES = ["currentDate", "current_date", "originalDate", "original_date", "existingDate"];
const CURRENT_TIME_ALIASES = ["currentTime", "current_time", "originalTime", "original_time", "existingTime"];
const NEW_DATE_ALIASES = [
  "newDate",
  "new_date",
  "requestedDate",
  "requested_date",
  "reservationDate",
  "reservation_date",
  "date",
];
const NEW_TIME_ALIASES = [
  "newTime",
  "new_time",
  "requestedTime",
  "requested_time",
  "reservationTime",
  "reservation_time",
  "time",
];
const NEW_PARTY_SIZE_ALIASES = [
  "newPartySize",
  "new_party_size",
  "requestedPartySize",
  "requested_party_size",
  "partySize",
  "numberOfGuests",
  "guests",
  "guestCount",
];
const NEW_NOTES_ALIASES = ["newNotes", "new_notes", "specialRequests", "special_requests", "notes"];
const REASON_ALIASES = ["reason", "modificationReason", "modification_reason", "changeReason", "change_reason"];
const LANGUAGE_ALIASES = ["language", "lang", "locale"];

/** Bounding policy — mirrors cancelReservationRequestAdapter's truncation approach. */
export const MAX_REASON_LENGTH = 2000;
export const MAX_NEW_NOTES_LENGTH = 2000;

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

export interface VapiModifyReservationRequestArgs {
  reservationRequestId: string | null;
  reservationId: string | null;
  callId: string | null;
  customerName: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  email: string | null;
  currentDate: string | null;
  currentDateProvided: boolean;
  currentTime: string | null;
  currentTimeProvided: boolean;
  newDate: string | null;
  newDateProvided: boolean;
  newTime: string | null;
  newTimeProvided: boolean;
  newPartySize: number | null;
  newNotes: string | null;
  reason: string | null;
  language: string | null;
  toolCallId: string | null;
}

export function extractModifyReservationRequestArgs(
  sources: any[],
  rawBody: any,
  currentYear: number
): VapiModifyReservationRequestArgs {
  const phone = extractPhone(sources, rawBody);
  const rawReason = getValueFromAliases(sources, REASON_ALIASES);
  const rawNewNotes = getValueFromAliases(sources, NEW_NOTES_ALIASES);
  const currentDateRaw = getValueFromAliases(sources, CURRENT_DATE_ALIASES);
  const currentTimeRaw = getValueFromAliases(sources, CURRENT_TIME_ALIASES);
  const newDateRaw = getValueFromAliases(sources, NEW_DATE_ALIASES);
  const newTimeRaw = getValueFromAliases(sources, NEW_TIME_ALIASES);

  return {
    reservationRequestId: getValueFromAliases(sources, RESERVATION_REQUEST_ID_ALIASES) || null,
    reservationId: getValueFromAliases(sources, RESERVATION_ID_ALIASES) || null,
    callId: extractCallId(sources, rawBody),
    customerName: getValueFromAliases(sources, NAME_ALIASES) || null,
    phone,
    normalizedPhone: phone ? toDigitsOnlyPhone(phone) : null,
    email: getValueFromAliases(sources, EMAIL_ALIASES) || null,
    currentDate: normalizeDate(currentDateRaw, currentYear),
    currentDateProvided: Boolean(currentDateRaw),
    currentTime: normalizeTime(currentTimeRaw),
    currentTimeProvided: Boolean(currentTimeRaw),
    newDate: normalizeDate(newDateRaw, currentYear),
    newDateProvided: Boolean(newDateRaw),
    newTime: normalizeTime(newTimeRaw),
    newTimeProvided: Boolean(newTimeRaw),
    newPartySize: normalizePartySize(getValueFromAliases(sources, NEW_PARTY_SIZE_ALIASES)),
    newNotes: rawNewNotes ? String(rawNewNotes) : null,
    reason: rawReason ? String(rawReason) : null,
    language: getValueFromAliases(sources, LANGUAGE_ALIASES) || null,
    toolCallId: getVapiToolCallId(rawBody),
  };
}

/**
 * Required-field policy: a modification intent needs at least one
 * identifying field AND at least one requested-change field. Either
 * category alone is not enough to act on or even log meaningfully.
 */
export function computeModifyReservationRequestMissingFields(args: VapiModifyReservationRequestArgs): string[] {
  const hasIdentity = Boolean(
    args.reservationRequestId ||
      args.reservationId ||
      args.phone ||
      args.customerName ||
      args.currentDateProvided ||
      args.currentTimeProvided ||
      args.callId
  );
  const hasRequestedChange = Boolean(
    args.newDateProvided || args.newTimeProvided || args.newPartySize || args.newNotes || args.reason
  );

  const missing: string[] = [];
  if (!hasIdentity) {
    missing.push("reservationRequestId_or_reservationId_or_phone_or_customerName_or_currentDate_or_currentTime_or_callId");
  }
  if (!hasRequestedChange) {
    missing.push("newDate_or_newTime_or_newPartySize_or_newNotes_or_reason");
  }
  return missing;
}

/**
 * A provided-but-unparseable date/time must never be silently treated as
 * "not provided" — it must surface as a safe success:false response rather
 * than fall through and (mis)trigger downstream matching.
 */
export function hasInvalidDateTimeFormat(args: VapiModifyReservationRequestArgs): boolean {
  return (
    (args.currentDateProvided && !args.currentDate) ||
    (args.currentTimeProvided && !args.currentTime) ||
    (args.newDateProvided && !args.newDate) ||
    (args.newTimeProvided && !args.newTime)
  );
}

export type ModifyMatchStatus = "exact" | "unmatched" | "ambiguous" | "confirmed_reservation_review_required";
export type ModifyActionTaken = "change_request_created" | "intent_logged" | "review_required";

export interface VapiModifyReservationRequestResponse {
  success: boolean;
  message: string;
  modification_requested?: boolean;
  modification_logged?: boolean;
  change_request_created?: boolean;
  requires_review?: boolean;
  match_status?: string;
  event_id?: string;
  change_request_id?: string;
  reservation_request_id?: string;
  missing_fields?: string[];
}

const MISSING_FIELDS_TEXT: Record<string, string> = {
  fr: "Je n'ai pas assez d'informations pour traiter votre demande de modification. Pouvez-vous préciser la réservation concernée et le changement souhaité ?",
  tr: "Değişiklik talebinizi işleme almak için yeterli bilgim yok. Hangi rezervasyon olduğunu ve ne değiştirmek istediğinizi belirtebilir misiniz?",
  en: "I need the reservation details and the change you want to request.",
};

const INVALID_DATE_TIME_TEXT: Record<string, string> = {
  fr: "Je n'ai pas compris la date ou l'heure que vous avez mentionnée. Pouvez-vous la répéter ?",
  tr: "Belirttiğiniz tarihi veya saati anlayamadım. Tekrar söyleyebilir misiniz?",
  en: "I didn't understand the date or time you mentioned. Could you say it again?",
};

const RECORDED_TEXT: Record<string, string> = {
  fr: "Votre demande de modification a été enregistrée pour que l'équipe du restaurant puisse l'examiner.",
  tr: "Değişiklik talebiniz, restoran ekibinin incelemesi için kaydedildi.",
  en: "Your modification request has been recorded for the restaurant team to review.",
};

function resolveText(table: Record<string, string>, language: string | null): string {
  const lang = language && table[language] ? language : "en";
  return table[lang];
}

export function buildModifyMissingFieldsResponse(
  missingFields: string[],
  language: string | null
): VapiModifyReservationRequestResponse {
  return {
    success: false,
    message: resolveText(MISSING_FIELDS_TEXT, language),
    missing_fields: missingFields,
  };
}

export function buildInvalidDateTimeResponse(language: string | null): VapiModifyReservationRequestResponse {
  return {
    success: false,
    message: resolveText(INVALID_DATE_TIME_TEXT, language),
  };
}

export function buildModificationRecordedResponse(
  language: string | null,
  options: {
    eventId: string;
    matchStatus: ModifyMatchStatus;
    changeRequestId?: string;
    originalRequestId?: string;
  }
): VapiModifyReservationRequestResponse {
  const { eventId, matchStatus, changeRequestId, originalRequestId } = options;
  return {
    success: true,
    message: resolveText(RECORDED_TEXT, language),
    modification_requested: true,
    requires_review: true,
    match_status: matchStatus,
    event_id: eventId,
    ...(changeRequestId
      ? {
          change_request_created: true,
          change_request_id: changeRequestId,
          ...(originalRequestId ? { reservation_request_id: originalRequestId } : {}),
        }
      : { modification_logged: true }),
  };
}

/** Safe, bounded metadata persisted on IntegrationEvent.payload — never the raw Vapi body. */
export interface SafeModifyReservationRequestPayload {
  callId: string | null;
  reservationRequestId?: string;
  reservationId?: string;
  customerName?: string;
  phone?: string;
  email?: string;
  currentDate?: string;
  currentTime?: string;
  newDate?: string;
  newTime?: string;
  newPartySize?: number;
  newNotes?: string;
  reason?: string;
  language?: string;
  matchStatus: ModifyMatchStatus;
  actionTaken: ModifyActionTaken;
  requestedAt: string;
  source: "vapi";
}

export function buildSafeModifyReservationRequestPayload(
  args: VapiModifyReservationRequestArgs,
  matchStatus: ModifyMatchStatus,
  actionTaken: ModifyActionTaken,
  now: Date = new Date()
): SafeModifyReservationRequestPayload {
  return {
    callId: args.callId,
    ...(args.reservationRequestId ? { reservationRequestId: args.reservationRequestId } : {}),
    ...(args.reservationId ? { reservationId: args.reservationId } : {}),
    ...(args.customerName ? { customerName: args.customerName } : {}),
    ...(args.phone ? { phone: args.phone } : {}),
    ...(args.email ? { email: args.email } : {}),
    ...(args.currentDate ? { currentDate: args.currentDate } : {}),
    ...(args.currentTime ? { currentTime: args.currentTime } : {}),
    ...(args.newDate ? { newDate: args.newDate } : {}),
    ...(args.newTime ? { newTime: args.newTime } : {}),
    ...(args.newPartySize ? { newPartySize: args.newPartySize } : {}),
    ...(args.newNotes ? { newNotes: truncateText(args.newNotes, MAX_NEW_NOTES_LENGTH) } : {}),
    ...(args.reason ? { reason: truncateText(args.reason, MAX_REASON_LENGTH) } : {}),
    ...(args.language ? { language: args.language } : {}),
    matchStatus,
    actionTaken,
    requestedAt: now.toISOString(),
    source: "vapi",
  };
}
