/**
 * Phase 33 — pure helpers for the handoff-to-staff Vapi adapter. Same pattern
 * as callSummaryAdapter.ts: no Prisma, no Express — extraction, missing-field,
 * bounding, and response-shape logic only, so it is unit-testable without a
 * database.
 *
 * Storage/notification policy decided in Phase 32
 * (docs/vapi-modify-cancel-handoff-decision-pack.md): this route logs an
 * auditable handoff intent only — there is no staff notification channel yet,
 * so neither the stored payload nor the voice response may claim staff were
 * actively notified.
 *
 * Source objects come straight from Vapi's dynamic JSON payloads, so `any`
 * is used deliberately for them rather than fought with type assertions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getVapiToolCallId } from "./toolResponse";
import { getValueFromAliases, normalizePhone, toDigitsOnlyPhone } from "./normalizers";

const CALL_ID_ALIASES = ["call_id", "callId", "conversation_id", "conversationId", "vapiCallId", "id"];
const REASON_ALIASES = ["reason", "handoffReason", "handoff_reason"];
const MESSAGE_ALIASES = ["message", "customerMessage", "customer_message"];
const URGENCY_ALIASES = ["urgency", "priority"];
const NAME_ALIASES = ["customerName", "name", "fullName"];
const PHONE_ALIASES = ["phone", "phoneNumber", "callerNumber", "customerPhone"];
const EMAIL_ALIASES = ["email", "customerEmail"];
const LANGUAGE_ALIASES = ["language", "lang", "locale"];

/** Bounding policy — mirrors callSummaryAdapter's truncation approach. */
export const MAX_REASON_LENGTH = 2000;
export const MAX_MESSAGE_LENGTH = 2000;

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

export interface VapiHandoffToStaffArgs {
  callId: string | null;
  reason: string | null;
  message: string | null;
  urgency: string | null;
  customerName: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  email: string | null;
  language: string | null;
  toolCallId: string | null;
}

export function extractHandoffToStaffArgs(sources: any[], rawBody: any): VapiHandoffToStaffArgs {
  const phone = extractPhone(sources, rawBody);
  const rawReason = getValueFromAliases(sources, REASON_ALIASES);
  const rawMessage = getValueFromAliases(sources, MESSAGE_ALIASES);

  return {
    callId: extractCallId(sources, rawBody),
    reason: rawReason ? String(rawReason) : null,
    message: rawMessage ? String(rawMessage) : null,
    urgency: getValueFromAliases(sources, URGENCY_ALIASES) || null,
    customerName: getValueFromAliases(sources, NAME_ALIASES) || null,
    phone,
    normalizedPhone: phone ? toDigitsOnlyPhone(phone) : null,
    email: getValueFromAliases(sources, EMAIL_ALIASES) || null,
    language: getValueFromAliases(sources, LANGUAGE_ALIASES) || null,
    toolCallId: getVapiToolCallId(rawBody),
  };
}

/**
 * Required-field policy (Phase 33): no single field is mandatory, but at
 * least one of reason/message/callId/phone/customerName must be present —
 * otherwise there is nothing useful to hand off.
 */
export function computeHandoffToStaffMissingFields(args: VapiHandoffToStaffArgs): string[] {
  const hasSomething = Boolean(
    args.reason || args.message || args.callId || args.phone || args.customerName
  );
  return hasSomething ? [] : ["reason_or_message_or_callId_or_phone_or_customerName"];
}

export interface VapiHandoffToStaffResponse {
  success: boolean;
  message: string;
  handoff_logged?: boolean;
  event_id?: string;
  next_step?: string;
  missing_fields?: string[];
}

const MISSING_FIELDS_TEXT: Record<string, string> = {
  fr: "Je n'ai pas assez d'informations pour transmettre votre demande à l'équipe. Pouvez-vous préciser la raison de votre appel ?",
  tr: "Talebinizi ekibe iletmek için yeterli bilgim yok. Aramanızın nedenini biraz daha açabilir misiniz?",
  en: "I don't have enough information to pass this on to the team yet. Could you tell me a bit more about why you're calling?",
};

const SUCCESS_TEXT: Record<string, string> = {
  fr: "Merci, votre demande a été transmise à l'équipe du restaurant. Quelqu'un vous recontactera dès que possible.",
  tr: "Teşekkürler, talebiniz restoran ekibine iletildi. En kısa sürede sizinle ilgilenecekler.",
  en: "Thank you, your request has been recorded for the restaurant team. They will follow up with you as soon as possible.",
};

function resolveText(table: Record<string, string>, language: string | null): string {
  const lang = language && table[language] ? language : "en";
  return table[lang];
}

export function buildHandoffToStaffMissingFieldsResponse(
  missingFields: string[],
  language: string | null
): VapiHandoffToStaffResponse {
  return {
    success: false,
    message: resolveText(MISSING_FIELDS_TEXT, language),
    missing_fields: missingFields,
  };
}

export function buildHandoffToStaffSuccessResponse(
  eventId: string,
  language: string | null
): VapiHandoffToStaffResponse {
  return {
    success: true,
    message: resolveText(SUCCESS_TEXT, language),
    handoff_logged: true,
    event_id: eventId,
    next_step: "awaiting_restaurant_team_followup",
  };
}

/** Safe, bounded metadata persisted on IntegrationEvent.payload — never the raw Vapi body. */
export interface SafeHandoffToStaffPayload {
  callId: string | null;
  reason?: string;
  message?: string;
  urgency?: string;
  customerName?: string;
  phone?: string;
  email?: string;
  language?: string;
  requestedAt: string;
  source: "vapi";
}

export function buildSafeHandoffToStaffPayload(
  args: VapiHandoffToStaffArgs,
  now: Date = new Date()
): SafeHandoffToStaffPayload {
  return {
    callId: args.callId,
    ...(args.reason ? { reason: truncateText(args.reason, MAX_REASON_LENGTH) } : {}),
    ...(args.message ? { message: truncateText(args.message, MAX_MESSAGE_LENGTH) } : {}),
    ...(args.urgency ? { urgency: args.urgency } : {}),
    ...(args.customerName ? { customerName: args.customerName } : {}),
    ...(args.phone ? { phone: args.phone } : {}),
    ...(args.email ? { email: args.email } : {}),
    ...(args.language ? { language: args.language } : {}),
    requestedAt: now.toISOString(),
    source: "vapi",
  };
}
