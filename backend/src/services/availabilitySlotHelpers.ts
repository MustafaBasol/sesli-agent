/**
 * Pure helpers for availability slot calculation — no DB calls, no Date.now()
 * defaults, so every function here is unit-testable in isolation (see
 * src/tests/availabilitySlotHelpers.test.ts). DB orchestration lives in
 * availabilitySlotService.ts.
 */
import {
  BLOCKING_RESERVATION_STATUSES,
  WEEKDAYS,
  type AvailabilityReservation,
  type AvailabilityTable,
  type OpeningHoursJson,
  type OpeningHoursWindow,
  type Weekday,
} from "./availabilitySlotTypes";

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseLocalDate(localDate: string): { year: number; month: number; day: number } | null {
  const match = LOCAL_DATE_RE.exec(localDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function parseLocalTime(time: string): { hours: number; minutes: number } | null {
  const match = LOCAL_TIME_RE.exec(time);
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function timeToMinutes(time: string): number {
  const parsed = parseLocalTime(time);
  if (!parsed) throw new Error(`Invalid HH:mm time: ${time}`);
  return parsed.hours * 60 + parsed.minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function addMinutesToTime(time: string, minutesToAdd: number): string {
  return minutesToTime(timeToMinutes(time) + minutesToAdd);
}

export function timeRangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Day-of-week lookup only — localDate is a plain calendar date (no
 * timezone), so Date.UTC here is just arithmetic, never an instant.
 */
export function getWeekdayFromLocalDate(localDate: string): Weekday | null {
  const parsed = parseLocalDate(localDate);
  if (!parsed) return null;
  const dayIndex = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  return WEEKDAYS[dayIndex];
}

/**
 * Whole-calendar-day index (epoch days), usable for cross-date diffing of
 * plain YYYY-MM-DD strings without any timezone involved.
 */
export function localDateToDayIndex(localDate: string): number | null {
  const parsed = parseLocalDate(localDate);
  if (!parsed) return null;
  return Math.floor(Date.UTC(parsed.year, parsed.month - 1, parsed.day) / 86_400_000);
}

export function isValidOpeningHoursJson(value: unknown): value is OpeningHoursJson {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  for (const [key, windows] of Object.entries(value as Record<string, unknown>)) {
    if (!(WEEKDAYS as readonly string[]).includes(key)) return false;
    if (!Array.isArray(windows)) return false;

    for (const window of windows) {
      if (typeof window !== "object" || window === null) return false;
      const { start, end } = window as Record<string, unknown>;
      if (typeof start !== "string" || typeof end !== "string") return false;
      if (!parseLocalTime(start) || !parseLocalTime(end)) return false;
      if (timeToMinutes(end) <= timeToMinutes(start)) return false;
    }
  }

  return true;
}

export function generateTimeSlotsForDay(
  windows: OpeningHoursWindow[],
  slotIntervalMinutes: number,
  durationMinutes: number
): string[] {
  const slots: string[] = [];

  for (const window of windows) {
    const startMinutes = timeToMinutes(window.start);
    const endMinutes = timeToMinutes(window.end);

    for (let start = startMinutes; start + durationMinutes <= endMinutes; start += slotIntervalMinutes) {
      slots.push(minutesToTime(start));
    }
  }

  return slots;
}

export function reservationBlocksSlot(
  reservation: AvailabilityReservation,
  slotStartMinutes: number,
  slotEndMinutes: number,
  durationMinutes: number,
  blockingStatuses: readonly string[] = BLOCKING_RESERVATION_STATUSES
): boolean {
  if (!blockingStatuses.includes(reservation.status)) return false;

  const reservationStart = timeToMinutes(reservation.reservationTime);
  const reservationEnd = reservationStart + durationMinutes;
  return timeRangesOverlap(slotStartMinutes, slotEndMinutes, reservationStart, reservationEnd);
}

export function tableCanFitParty(table: AvailabilityTable, partySize: number): boolean {
  return table.isActive && table.capacity >= partySize;
}

/**
 * Resolves an instant to restaurant-local calendar date + time using the
 * restaurant's IANA timezone, via Intl (no extra date library needed). Pure
 * given (now, timezone) — no internal Date.now() call — so it's directly
 * unit-testable.
 */
export function getNowPartsInTimezone(now: Date, timezone: string): { localDate: string; localTime: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  // Some Intl implementations render midnight as hour "24" when hour12 is
  // false; normalize it back to "00" so it parses as a valid HH:mm.
  const hour = get("hour") === "24" ? "00" : get("hour");

  return {
    localDate: `${get("year")}-${get("month")}-${get("day")}`,
    localTime: `${hour}:${get("minute")}`,
  };
}

/**
 * Combines a plain calendar date + HH:mm time into a single comparable
 * integer (minutes since an arbitrary epoch), so two local date/time pairs
 * — regardless of calendar month/day boundaries — can be diffed with plain
 * arithmetic. Never treated as a real instant/timezone offset.
 */
export function localDateTimeToComparableMinutes(localDate: string, time: string): number {
  const dayIndex = localDateToDayIndex(localDate);
  if (dayIndex === null) throw new Error(`Invalid localDate: ${localDate}`);
  return dayIndex * 1440 + timeToMinutes(time);
}
