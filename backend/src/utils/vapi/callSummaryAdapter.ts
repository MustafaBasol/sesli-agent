/**
 * Phase 31 — pure helpers for the log-call-summary Vapi adapter. Same
 * pattern as checkAvailabilityAdapter.ts / customerProfileAdapter.ts /
 * dateOpeningHoursAdapter.ts: no Prisma, no Express — extraction,
 * missing-field, bounding, and response-shape logic only, so it is
 * unit-testable without a database.
 *
 * Source objects come straight from Vapi's dynamic JSON payloads, so `any`
 * is used deliberately for them rather than fought with type assertions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getVapiToolCallId } from "./toolResponse";
import { getValueFromAliases, normalizePhone, toDigitsOnlyPhone } from "./normalizers";

const CALL_ID_ALIASES = ["call_id", "callId", "conversation_id", "conversationId", "vapiCallId", "id"];
const SUMMARY_ALIASES = ["summary", "callSummary", "call_summary"];
// Extracted only so the adapter's behavior is fully specified — never stored
// or returned. See AGENTS.md Phase 31 item 5 (privacy / data minimization).
const TRANSCRIPT_ALIASES = ["transcript", "transcriptText", "fullTranscript"];
const PHONE_ALIASES = ["phone", "phoneNumber", "callerNumber", "customerPhone"];
const NAME_ALIASES = ["customerName", "name", "fullName"];
const LANGUAGE_ALIASES = ["language", "lang", "locale"];
const DURATION_ALIASES = ["durationSeconds", "duration_seconds", "duration"];
const ENDED_REASON_ALIASES = ["endedReason", "ended_reason", "endReason"];
const OUTCOME_ALIASES = ["outcome", "status"];

/** Bounding policy — see AGENTS.md Phase 31 item 5: 2,000-4,000 characters. */
export const MAX_SUMMARY_LENGTH = 4000;

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

function extractCallerPhone(sources: any[], rawBody: any): string | null {
  const rawPhone =
    getValueFromAliases(sources, PHONE_ALIASES) ||
    rawBody?.customer?.number ||
    rawBody?.message?.customer?.number ||
    rawBody?.message?.call?.customer?.number ||
    rawBody?.call?.customer?.number ||
    null;
  return normalizePhone(rawPhone);
}

function toDurationSeconds(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** Truncates a summary to MAX_SUMMARY_LENGTH, never throwing on oversized input. */
export function truncateSummary(summary: string, maxLength: number = MAX_SUMMARY_LENGTH): string {
  if (summary.length <= maxLength) return summary;
  return summary.slice(0, maxLength);
}

export interface VapiCallSummaryArgs {
  callId: string | null;
  summary: string | null;
  // Extracted for completeness but intentionally never stored or returned —
  // see AGENTS.md Phase 31 item 5.
  transcript: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  customerName: string | null;
  language: string | null;
  durationSeconds: number | null;
  endedReason: string | null;
  outcome: string | null;
  toolCallId: string | null;
}

export function extractCallSummaryArgs(sources: any[], rawBody: any): VapiCallSummaryArgs {
  const phone = extractCallerPhone(sources, rawBody);
  const rawSummary = getValueFromAliases(sources, SUMMARY_ALIASES);
  const rawTranscript = getValueFromAliases(sources, TRANSCRIPT_ALIASES);

  return {
    callId: extractCallId(sources, rawBody),
    summary: rawSummary ? String(rawSummary) : null,
    transcript: rawTranscript ? String(rawTranscript) : null,
    phone,
    normalizedPhone: phone ? toDigitsOnlyPhone(phone) : null,
    customerName: getValueFromAliases(sources, NAME_ALIASES) || null,
    language: getValueFromAliases(sources, LANGUAGE_ALIASES) || null,
    durationSeconds: toDurationSeconds(getValueFromAliases(sources, DURATION_ALIASES)),
    endedReason: getValueFromAliases(sources, ENDED_REASON_ALIASES) || null,
    outcome: getValueFromAliases(sources, OUTCOME_ALIASES) || null,
    toolCallId: getVapiToolCallId(rawBody),
  };
}

/** Required-field policy — see AGENTS.md Phase 31 item 4: callId OR summary must be present. */
export function computeCallSummaryMissingFields(args: VapiCallSummaryArgs): string[] {
  return args.callId || args.summary ? [] : ["call_id_or_summary"];
}

export interface VapiCallSummaryResponse {
  success: boolean;
  message: string;
  logged?: boolean;
  call_id?: string;
  event_id?: string;
  missing_fields?: string[];
}

export function buildCallSummaryMissingFieldsResponse(missingFields: string[]): VapiCallSummaryResponse {
  return {
    success: false,
    message: "I need either a call id or a call summary before logging this call.",
    missing_fields: missingFields,
  };
}

export function buildCallSummarySuccessResponse(callId: string | null, eventId: string): VapiCallSummaryResponse {
  return {
    success: true,
    message: "Call summary logged successfully.",
    logged: true,
    ...(callId ? { call_id: callId } : {}),
    event_id: eventId,
  };
}

/** Safe, bounded metadata persisted on IntegrationEvent.payload — never the raw Vapi body. */
export interface SafeCallSummaryPayload {
  callId: string | null;
  summary?: string;
  language?: string;
  outcome?: string;
  durationSeconds?: number;
  endedReason?: string;
}

export function buildSafeCallSummaryPayload(args: VapiCallSummaryArgs): SafeCallSummaryPayload {
  return {
    callId: args.callId,
    ...(args.summary ? { summary: truncateSummary(args.summary) } : {}),
    ...(args.language ? { language: args.language } : {}),
    ...(args.outcome ? { outcome: args.outcome } : {}),
    ...(args.durationSeconds !== null ? { durationSeconds: args.durationSeconds } : {}),
    ...(args.endedReason ? { endedReason: args.endedReason } : {}),
  };
}
