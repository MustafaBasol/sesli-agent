/**
 * Vapi input normalizers — alias resolution, field normalization, missing-fields helpers.
 * Prevents incorrect "Closed / Unavailable" responses caused by Vapi sending field names
 * or formats that differ from what the backend expects.
 */

/**
 * Search multiple source objects for the first non-empty value matching any of the aliases.
 * Sources are tried in order; within each source, aliases are tried in order.
 */
export function getValueFromAliases(sources: any[], aliases: string[]): any {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const alias of aliases) {
      const val = source[alias];
      if (val !== undefined && val !== null && val !== '') return val;
    }
  }
  return null;
}

/**
 * Normalize a phone value.
 * Returns the trimmed original string (with country code etc.) suitable for DB storage.
 * Use `.replace(/\D/g, '').slice(-9)` on the result for fuzzy DB lookups.
 */
export function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const s = String(value).trim();
  return s || null;
}

/**
 * Normalize a time string to HH:MM format.
 * Supports: "21" → "21:00", "9" → "09:00", "21h" → "21:00",
 *           "21 h" → "21:00", "21.00" → "21:00", "9:30" → "09:30"
 * Returns null for unrecognisable input.
 */
export function normalizeTime(value?: string | null): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;

  // "21:00" or "9:30" — already HH:MM or H:MM
  const colonMatch = s.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  // "21.00" — dot separator
  const dotMatch = s.match(/^(\d{1,2})\.(\d{2})$/);
  if (dotMatch) {
    const h = parseInt(dotMatch[1], 10);
    const m = parseInt(dotMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  // "21h" or "21 h"
  const hMatch = s.match(/^(\d{1,2})\s*h$/i);
  if (hMatch) {
    const h = parseInt(hMatch[1], 10);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }

  // Plain hour "21" or "9"
  const hourMatch = s.match(/^(\d{1,2})$/);
  if (hourMatch) {
    const h = parseInt(hourMatch[1], 10);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }

  return null;
}

/**
 * Normalize a date string to YYYY-MM-DD.
 * - Keeps valid ISO dates; corrects past year to currentYear.
 * - Converts DD/MM/YYYY and DD-MM-YYYY to ISO.
 * - Returns null for unrecognisable input; never silently invents a date.
 */
export function normalizeDate(value?: string | null, currentYear?: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const year = currentYear ?? new Date().getFullYear();

  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const correctedY = y < year ? year : y;
      return `${correctedY}-${isoMatch[2]}-${isoMatch[3]}`;
    }
  }

  // DD/MM/YYYY (European)
  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmySlash) {
    const d = parseInt(dmySlash[1], 10);
    const m = parseInt(dmySlash[2], 10);
    const y = parseInt(dmySlash[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const correctedY = y < year ? year : y;
      return `${correctedY}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // DD-MM-YYYY
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) {
    const d = parseInt(dmyDash[1], 10);
    const m = parseInt(dmyDash[2], 10);
    const y = parseInt(dmyDash[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const correctedY = y < year ? year : y;
      return `${correctedY}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Normalize a party-size value (string or number) to a positive integer.
 * Handles "3 kişi", "3 persons", word numbers (one–ten, bir–on).
 * Returns null for unrecognisable input.
 */
export function normalizePartySize(value?: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  const s = String(value).trim().toLowerCase();
  if (!s) return null;

  // Word numbers (EN + TR)
  const wordMap: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    bir: 1, iki: 2, 'üç': 3, uc: 3, 'dört': 4, dort: 4,
    'beş': 5, bes: 5, 'altı': 6, alti: 6,
    yedi: 7, sekiz: 8, dokuz: 9, on: 10,
  };
  if (wordMap[s] !== undefined) return wordMap[s];

  // "3 kişi", "3 persons", "3 people", "3 guests" etc.
  const numPrefixMatch = s.match(/^(\d+)\s*(?:ki[şs]i|persons?|people|guests?|pax)?$/);
  if (numPrefixMatch) {
    const n = parseInt(numPrefixMatch[1], 10);
    return n > 0 ? n : null;
  }

  return null;
}

/**
 * Build a standard missing-fields response payload.
 */
export function buildMissingFieldsResponse(missingFields: string[], customMessage?: string) {
  return {
    success: false,
    available: false,
    reason: 'Missing Required Information',
    message:
      customMessage ??
      `I need the following information before continuing: ${missingFields.join(', ')}.`,
    missing_fields: missingFields,
  };
}
