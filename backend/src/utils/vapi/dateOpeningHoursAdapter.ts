/**
 * Phase 30 — pure helpers for the get-current-date / get-opening-hours Vapi
 * adapters. Same pattern as checkAvailabilityAdapter.ts / customerProfileAdapter.ts:
 * no Prisma, no Express — argument extraction, date validation, and
 * response-shape building only, so it is unit-testable without a database.
 * The route in routes/webhooks/vapi.ts owns tenant resolution, Prisma reads,
 * and ToolLog writes.
 *
 * Source objects come straight from Vapi's dynamic JSON payloads, so `any`
 * is used deliberately for them rather than fought with type assertions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getValueFromAliases, normalizeDate } from "./normalizers";
import { getVapiToolCallId } from "./toolResponse";
import { WEEKDAYS, type OpeningHoursJson, type OpeningHoursWindow, type Weekday } from "../../services/availabilitySlotTypes";

const CALL_ID_ALIASES = ["call_id", "callId", "conversation_id", "conversationId", "toolCallId"];
const LANGUAGE_ALIASES = ["language", "lang", "locale"];
const DATE_ALIASES = ["date", "localDate", "local_date", "requestedDate", "requested_date"];

export type SupportedLanguage = "en" | "tr" | "fr";
const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["en", "tr", "fr"];

export const DEFAULT_TIMEZONE_FALLBACK = "Europe/Paris";

/** Restaurant.timezone has a non-null DB default, but this is defensive for a blank/unset value. */
export function resolveRestaurantTimezone(restaurantTimezone: string | null | undefined): string {
  return restaurantTimezone && restaurantTimezone.trim() ? restaurantTimezone : DEFAULT_TIMEZONE_FALLBACK;
}

/** Caller-requested language takes priority, then the restaurant's defaultLanguage, then English. */
export function resolveLanguage(requested: string | null, restaurantDefaultLanguage: string | null): SupportedLanguage {
  const requestedLower = requested?.toLowerCase();
  if (requestedLower && (SUPPORTED_LANGUAGES as string[]).includes(requestedLower)) {
    return requestedLower as SupportedLanguage;
  }
  const fallbackLower = restaurantDefaultLanguage?.toLowerCase();
  if (fallbackLower && (SUPPORTED_LANGUAGES as string[]).includes(fallbackLower)) {
    return fallbackLower as SupportedLanguage;
  }
  return "en";
}

const WEEKDAY_LABELS: Record<Weekday, Record<SupportedLanguage, string>> = {
  sunday: { en: "Sunday", tr: "Pazar", fr: "dimanche" },
  monday: { en: "Monday", tr: "Pazartesi", fr: "lundi" },
  tuesday: { en: "Tuesday", tr: "Salı", fr: "mardi" },
  wednesday: { en: "Wednesday", tr: "Çarşamba", fr: "mercredi" },
  thursday: { en: "Thursday", tr: "Perşembe", fr: "jeudi" },
  friday: { en: "Friday", tr: "Cuma", fr: "vendredi" },
  saturday: { en: "Saturday", tr: "Cumartesi", fr: "samedi" },
};

export function getWeekdayLabel(weekday: Weekday, language: SupportedLanguage): string {
  return WEEKDAY_LABELS[weekday][language];
}

function extractCallId(sources: any[], rawBody: any): string | null {
  return getValueFromAliases(sources, CALL_ID_ALIASES) || getVapiToolCallId(rawBody);
}

function extractLanguageInput(sources: any[]): string | null {
  return getValueFromAliases(sources, LANGUAGE_ALIASES) || null;
}

export interface VapiGetCurrentDateArgs {
  language: string | null;
  callId: string | null;
}

export function extractGetCurrentDateArgs(sources: any[], rawBody: any): VapiGetCurrentDateArgs {
  return { language: extractLanguageInput(sources), callId: extractCallId(sources, rawBody) };
}

export interface VapiGetOpeningHoursArgs {
  rawDate: string | null;
  language: string | null;
  callId: string | null;
}

export function extractGetOpeningHoursArgs(sources: any[], rawBody: any): VapiGetOpeningHoursArgs {
  return {
    rawDate: getValueFromAliases(sources, DATE_ALIASES) || null,
    language: extractLanguageInput(sources),
    callId: extractCallId(sources, rawBody),
  };
}

/** Validates/normalizes a caller-supplied date string to YYYY-MM-DD, or null if unparseable. */
export function validateRequestedDate(rawDate: string | null, currentYear: number): string | null {
  if (!rawDate) return null;
  return normalizeDate(rawDate, currentYear);
}

export interface VapiCurrentDateResponse {
  success: true;
  message: string;
  timezone: string;
  current_date: string;
  current_time: string;
  day_of_week: string;
  iso_datetime: string;
}

export function buildCurrentDateResponse(params: {
  timezone: string;
  localDate: string;
  localTime: string;
  weekday: Weekday;
  language: SupportedLanguage;
  now: Date;
}): VapiCurrentDateResponse {
  const { timezone, localDate, localTime, weekday, language, now } = params;
  const dayLabel = getWeekdayLabel(weekday, language);

  const messages: Record<SupportedLanguage, string> = {
    en: `Today is ${dayLabel}, ${localDate}. The current local time is ${localTime} (${timezone}).`,
    tr: `Bugün ${dayLabel}, ${localDate}. Yerel saat ${localTime} (${timezone}).`,
    fr: `Nous sommes ${dayLabel} ${localDate}. L'heure locale actuelle est ${localTime} (${timezone}).`,
  };

  return {
    success: true,
    message: messages[language],
    timezone,
    current_date: localDate,
    current_time: localTime,
    day_of_week: dayLabel,
    iso_datetime: now.toISOString(),
  };
}

export interface OpeningPeriod {
  opens: string;
  closes: string;
}

export interface VapiOpeningHoursResponse {
  success: boolean;
  message: string;
  timezone?: string;
  configured?: boolean;
  date?: string;
  day_of_week?: string;
  is_open?: boolean;
  opening_periods?: OpeningPeriod[];
  weekly_hours?: Record<Weekday, OpeningPeriod[]>;
  closed_reason?: string;
  partial_blackout_note?: string;
}

export function buildInvalidDateResponse(): VapiOpeningHoursResponse {
  return {
    success: false,
    message: "Sorry, I couldn't understand that date. Please use the YYYY-MM-DD format.",
  };
}

/** Safer-for-voice contract than success:false — see docs/vapi-date-opening-hours-contract.md. */
export function buildNotConfiguredResponse(timezone: string): VapiOpeningHoursResponse {
  return {
    success: true,
    configured: false,
    timezone,
    message: "Opening hours have not been configured yet for this restaurant.",
  };
}

const CLOSED_REASON_MESSAGES = {
  restaurant_inactive: "Sorry, this restaurant isn't accepting reservations right now.",
  reservations_disabled: "Sorry, online reservations are currently disabled.",
} as const;

export function buildClosedReasonResponse(
  reason: keyof typeof CLOSED_REASON_MESSAGES,
  timezone: string
): VapiOpeningHoursResponse {
  return {
    success: true,
    is_open: false,
    timezone,
    closed_reason: reason,
    message: CLOSED_REASON_MESSAGES[reason],
  };
}

function toOpeningPeriods(windows: OpeningHoursWindow[]): OpeningPeriod[] {
  return windows.map((w) => ({ opens: w.start, closes: w.end }));
}

export function buildWeeklyHours(openingHoursJson: OpeningHoursJson): Record<Weekday, OpeningPeriod[]> {
  const result = {} as Record<Weekday, OpeningPeriod[]>;
  for (const day of WEEKDAYS) {
    result[day] = toOpeningPeriods(openingHoursJson[day] ?? []);
  }
  return result;
}

/** True only when at least one weekday has a non-empty window list — an all-empty/null config is "not configured". */
export function hasAnyConfiguredWindows(openingHoursJson: OpeningHoursJson): boolean {
  return WEEKDAYS.some((day) => (openingHoursJson[day]?.length ?? 0) > 0);
}

export function buildOpeningHoursResponse(params: {
  localDate: string;
  weekday: Weekday;
  language: SupportedLanguage;
  timezone: string;
  windows: OpeningHoursWindow[];
  includeWeeklyHours: boolean;
  openingHoursJson: OpeningHoursJson;
  isFullDayBlackout: boolean;
  blackoutReason: string | null;
  partialBlackout: { starts: string; ends: string; reason: string | null } | null;
}): VapiOpeningHoursResponse {
  const {
    localDate,
    weekday,
    language,
    timezone,
    windows,
    includeWeeklyHours,
    openingHoursJson,
    isFullDayBlackout,
    blackoutReason,
    partialBlackout,
  } = params;

  const dayLabel = getWeekdayLabel(weekday, language);
  const weeklyHoursField = includeWeeklyHours ? { weekly_hours: buildWeeklyHours(openingHoursJson) } : {};

  if (isFullDayBlackout) {
    return {
      success: true,
      timezone,
      date: localDate,
      day_of_week: dayLabel,
      is_open: false,
      closed_reason: "blackout_full_day",
      message: blackoutReason ? `We are closed on ${localDate} (${blackoutReason}).` : `We are closed on ${localDate}.`,
      ...weeklyHoursField,
    };
  }

  const openingPeriods = toOpeningPeriods(windows);
  const isOpen = openingPeriods.length > 0;
  const hoursText = openingPeriods.map((p) => `${p.opens}-${p.closes}`).join(", ");
  const partialNote = partialBlackout
    ? `Closed between ${partialBlackout.starts} and ${partialBlackout.ends}${partialBlackout.reason ? ` (${partialBlackout.reason})` : ""}.`
    : null;

  const message = isOpen
    ? `On ${dayLabel}, ${localDate}, we are open ${hoursText}.${partialNote ? ` ${partialNote}` : ""}`
    : `We are closed on ${dayLabel}, ${localDate}.${partialNote ? ` ${partialNote}` : ""}`;

  return {
    success: true,
    timezone,
    date: localDate,
    day_of_week: dayLabel,
    is_open: isOpen,
    opening_periods: openingPeriods,
    ...(partialNote ? { partial_blackout_note: partialNote } : {}),
    ...weeklyHoursField,
    message,
  };
}
