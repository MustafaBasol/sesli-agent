/**
 * Phase 29 — pure helpers for the get-customer-profile / create-customer-profile
 * Vapi adapters. Same pattern as checkAvailabilityAdapter.ts /
 * createReservationRequestAdapter.ts: no Prisma, no Express — extraction,
 * missing-field, and response-shape logic only, so it is unit-testable
 * without a database.
 *
 * Source objects come straight from Vapi's dynamic JSON payloads, so `any`
 * is used deliberately for them rather than fought with type assertions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getVapiToolCallId } from "./toolResponse";
import { getValueFromAliases, normalizePhone, toDigitsOnlyPhone } from "./normalizers";

const PHONE_ALIASES = ["phone", "phone_number", "phoneNumber", "caller_phone", "callerNumber", "customer_phone", "customerPhone"];
const EMAIL_ALIASES = ["email", "customer_email", "customerEmail"];
const NAME_ALIASES = ["name", "full_name", "fullName", "customer_name", "customerName"];

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

function extractCallId(sources: any[], rawBody: any): string | null {
  const parsedCallId = sources[0]?.call_id || null;
  return (
    parsedCallId ||
    getValueFromAliases(sources, ["conversation_id", "conversationId", "call_id", "callId"]) ||
    getVapiToolCallId(rawBody)
  );
}

function normalizeEmail(value: any): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export interface VapiGetCustomerProfileArgs {
  phone: string | null;
  normalizedPhone: string | null;
  email: string | null;
  name: string | null;
  callId: string | null;
}

export function extractGetCustomerProfileArgs(sources: any[], rawBody: any): VapiGetCustomerProfileArgs {
  const phone = extractCallerPhone(sources, rawBody);
  return {
    phone,
    normalizedPhone: phone ? toDigitsOnlyPhone(phone) : null,
    email: normalizeEmail(getValueFromAliases(sources, EMAIL_ALIASES)),
    name: getValueFromAliases(sources, NAME_ALIASES) || null,
    callId: extractCallId(sources, rawBody),
  };
}

/** Required-field policy — see AGENTS.md Phase 29 item 3: at least phone or email. */
export function computeGetCustomerProfileMissingFields(args: VapiGetCustomerProfileArgs): string[] {
  return args.phone || args.email ? [] : ["phone_or_email"];
}

export interface VapiCreateCustomerProfileArgs {
  name: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  email: string | null;
  notes: string | null;
  language: string;
  callId: string | null;
}

export function extractCreateCustomerProfileArgs(sources: any[], rawBody: any): VapiCreateCustomerProfileArgs {
  const phone = extractCallerPhone(sources, rawBody);
  return {
    name: getValueFromAliases(sources, NAME_ALIASES) || null,
    phone,
    normalizedPhone: phone ? toDigitsOnlyPhone(phone) : null,
    email: normalizeEmail(getValueFromAliases(sources, EMAIL_ALIASES)),
    notes: getValueFromAliases(sources, ["notes", "customer_notes", "customerNotes"]) || null,
    language: getValueFromAliases(sources, ["language", "lang"]) || "tr",
    callId: extractCallId(sources, rawBody),
  };
}

/** Required-field policy — see AGENTS.md Phase 29 item 3: name, plus at least phone or email. */
export function computeCreateCustomerProfileMissingFields(args: VapiCreateCustomerProfileArgs): string[] {
  const missingFields: string[] = [];
  if (!args.name) missingFields.push("name");
  if (!args.phone && !args.email) missingFields.push("phone_or_email");
  return missingFields;
}

export interface VapiSafeCustomer {
  fullName: string | null;
  phoneNumber: string | null;
  email: string | null;
  notes: string | null;
}

/** Maps a Customer row to the safe, allowlisted shape returned to Vapi — never the full DB row. */
export function toSafeCustomerPayload(customer: VapiSafeCustomer): {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
} {
  return {
    ...(customer.fullName ? { name: customer.fullName } : {}),
    ...(customer.phoneNumber ? { phone: customer.phoneNumber } : {}),
    ...(customer.email ? { email: customer.email } : {}),
    ...(customer.notes ? { notes: customer.notes } : {}),
  };
}

export interface VapiCustomerProfileResponse {
  success: boolean;
  found?: boolean;
  action?: "created" | "updated" | "none";
  message: string;
  customer_id?: string;
  customer?: { name?: string; phone?: string; email?: string; notes?: string };
  missing_fields?: string[];
  conflict?: boolean;
}

export function buildCustomerProfileMissingFieldsResponse(missingFields: string[]): VapiCustomerProfileResponse {
  return {
    success: false,
    message: `I need the following information before continuing: ${missingFields.join(", ")}.`,
    missing_fields: missingFields,
  };
}

/**
 * Conservative-by-design — see AGENTS.md Phase 29 item 4: if a phone and an
 * email both resolve, but to two different Customer rows, never merge or
 * guess; surface the conflict instead.
 */
export function buildCustomerProfileConflictResponse(): VapiCustomerProfileResponse {
  return {
    success: false,
    conflict: true,
    message:
      "The phone number and email provided belong to different customer records. Please confirm which one to use.",
  };
}
