/**
 * helpers.ts — pure normalization/classification helpers for the Phase 23
 * dry-run import skeleton. No I/O, no database access, no Supabase access.
 *
 * Policy reference: docs/migration-policy.md
 */

export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (!digits || digits === "+") return null;
  return digits;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export type ParsedDate = {
  valid: boolean;
  raw: unknown;
  isoDate: string | null;
  reason?: "missing" | "invalid";
};

export function parseSourceDate(value: unknown): ParsedDate {
  if (value === null || value === undefined || value === "") {
    return { valid: false, raw: value, isoDate: null, reason: "missing" };
  }
  if (typeof value !== "string") {
    return { valid: false, raw: value, isoDate: null, reason: "invalid" };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return { valid: false, raw: value, isoDate: null, reason: "invalid" };
  }
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValidCalendarDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isValidCalendarDate) {
    return { valid: false, raw: value, isoDate: null, reason: "invalid" };
  }
  return { valid: true, raw: value, isoDate: `${yearStr}-${monthStr}-${dayStr}` };
}

export type ParsedTime = {
  valid: boolean;
  raw: unknown;
  normalized: string | null;
  reason?: "missing" | "invalid";
};

export function parseSourceTime(value: unknown): ParsedTime {
  if (value === null || value === undefined || value === "") {
    return { valid: false, raw: value, normalized: null, reason: "missing" };
  }
  if (typeof value !== "string") {
    return { valid: false, raw: value, normalized: null, reason: "invalid" };
  }
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) {
    return { valid: false, raw: value, normalized: null, reason: "invalid" };
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { valid: false, raw: value, normalized: null, reason: "invalid" };
  }
  return { valid: true, raw: value, normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

const SENSITIVE_FIELD_NAME_PATTERN = /(raw_?payload|request_?payload|response_?payload|payload|token|secret|password|credential|phone|email)/i;

export function detectSensitiveFieldNames(record: unknown): string[] {
  if (typeof record !== "object" || record === null) return [];
  return Object.keys(record).filter((key) => SENSITIVE_FIELD_NAME_PATTERN.test(key));
}

const RAW_PAYLOAD_FIELD_NAMES = ["raw_payload", "rawPayload", "request_payload", "requestPayload", "response_payload", "responsePayload"];

export function safeCountRawPayloadPresence(record: unknown): number {
  if (typeof record !== "object" || record === null) return 0;
  const obj = record as Record<string, unknown>;
  let count = 0;
  for (const field of RAW_PAYLOAD_FIELD_NAMES) {
    const value = obj[field];
    if (value !== null && value !== undefined && value !== "") {
      count += 1;
    }
  }
  return count;
}

export type ReservationStatusClassification = "new" | "pending_info" | "confirmed" | "rejected" | "cancelled" | "done" | "unsupported";

const KNOWN_STATUS_MAP: Record<string, ReservationStatusClassification> = {
  new: "new",
  pending_info: "pending_info",
  confirmed: "confirmed",
  rejected: "rejected",
  cancelled: "cancelled",
  canceled: "cancelled",
  done: "done",
};

export function classifyReservationStatus(oldStatus: unknown): ReservationStatusClassification {
  if (typeof oldStatus !== "string") return "unsupported";
  const normalized = oldStatus.trim().toLowerCase();
  return KNOWN_STATUS_MAP[normalized] ?? "unsupported";
}
