/**
 * Pure date-range helpers for dashboard aggregation. Day/week boundaries are
 * computed in UTC (no restaurant-timezone awareness yet) — consistent with
 * the existing dateOnly UTC handling in reservationRequestQuery.ts.
 */

export interface DateRange {
  start: Date;
  end: Date;
}

export function getTodayRangeUTC(now: Date = new Date()): DateRange {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// Week starts on Monday (UTC), ends at the end of today.
export function getThisWeekRangeUTC(now: Date = new Date()): DateRange {
  const { start: todayStart, end: todayEnd } = getTodayRangeUTC(now);
  const dayOfWeek = todayStart.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const start = new Date(todayStart.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  return { start, end: todayEnd };
}

export function toCountMap<T extends Record<string, unknown>>(
  rows: Array<T & { _count: { _all: number } }>,
  field: keyof T
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[String(row[field])] = row._count._all;
  }
  return map;
}
