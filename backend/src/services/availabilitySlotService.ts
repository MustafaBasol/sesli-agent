/**
 * Phase 25 availability slot calculation service.
 *
 * Pure/testable logic lives in availabilitySlotHelpers.ts; this file only
 * orchestrates Prisma reads and assembles the result. Not wired into any
 * production Vapi route — see AGENTS.md Phase 25 constraints.
 *
 * Design notes (documented per AGENTS.md instructions):
 * - Reservation rows have no stored duration; every reservation is assumed
 *   to occupy `settings.defaultReservationDurationMinutes`, same as a slot.
 * - A reservation with a null `assignedTableId` cannot be matched to a
 *   specific table, so it is conservatively counted only toward
 *   `maxReservationsPerSlot` (if set) and never removes a specific table
 *   from `availableTableIds`. This avoids silently over- or under-counting
 *   table capacity for unassigned reservations.
 * - `capacity` on a slot is the largest single available table's capacity
 *   (one party occupies one table), not a sum across tables.
 */
import { prisma } from "../prisma/client";
import { getOrCreateAvailabilitySettings } from "./restaurantAvailabilityService";
import {
  generateTimeSlotsForDay,
  getNowPartsInTimezone,
  getWeekdayFromLocalDate,
  isValidOpeningHoursJson,
  localDateTimeToComparableMinutes,
  parseLocalDate,
  reservationBlocksSlot,
  tableCanFitParty,
  timeRangesOverlap,
  timeToMinutes,
} from "./availabilitySlotHelpers";
import type {
  AvailabilityBlackoutDate,
  AvailabilityReservation,
  AvailabilitySlotEntry,
  AvailabilitySlotQuery,
  AvailabilitySlotResult,
  AvailabilityTable,
  OpeningHoursWindow,
} from "./availabilitySlotTypes";
import { BLOCKING_RESERVATION_STATUSES } from "./availabilitySlotTypes";

function baseResult(
  query: AvailabilitySlotQuery,
  timezone: string,
  durationMinutes: number,
  slotIntervalMinutes: number
): AvailabilitySlotResult {
  return {
    restaurantId: query.restaurantId,
    localDate: query.localDate,
    partySize: query.partySize,
    timezone,
    durationMinutes,
    slotIntervalMinutes,
    availableSlots: [],
    warnings: [],
  };
}

export async function calculateAvailabilitySlots(query: AvailabilitySlotQuery): Promise<AvailabilitySlotResult> {
  const now = query.now ?? new Date();

  const restaurant = await prisma.restaurant.findUnique({ where: { id: query.restaurantId } });
  if (!restaurant) {
    return { ...baseResult(query, "UTC", 0, 0), blockedReason: "restaurant_not_found" };
  }

  const settings = await getOrCreateAvailabilitySettings(query.restaurantId);
  const manualApprovalThreshold = settings.manualApprovalThreshold ?? null;
  const needsManualApproval =
    manualApprovalThreshold !== null && query.partySize >= manualApprovalThreshold;
  const result = baseResult(query, restaurant.timezone, settings.defaultReservationDurationMinutes, settings.slotIntervalMinutes);
  // Attach approval metadata so callers and Vapi adapters can surface it.
  result.needsManualApproval = needsManualApproval;
  result.manualApprovalThreshold = manualApprovalThreshold;

  // A) restaurant status
  if (restaurant.status !== "active") {
    return { ...result, blockedReason: "restaurant_inactive" };
  }

  // B) reservations enabled
  if (!settings.reservationsEnabled) {
    return { ...result, blockedReason: "reservations_disabled" };
  }

  // C) party size
  if (query.partySize < settings.minPartySize || query.partySize > settings.maxPartySize) {
    return { ...result, blockedReason: "party_size_out_of_range" };
  }

  // Input sanity (the route's zod schema already enforces format, but the
  // service is callable directly/in tests, so validate again here).
  if (!parseLocalDate(query.localDate)) {
    return { ...result, blockedReason: "invalid_date" };
  }
  if (query.preferredTime !== undefined && !timeToMinutesSafe(query.preferredTime)) {
    return { ...result, blockedReason: "invalid_preferred_time" };
  }

  // D) booking window
  const { localDate: nowLocalDate, localTime: nowLocalTime } = getNowPartsInTimezone(now, restaurant.timezone);
  const nowComparable = localDateTimeToComparableMinutes(nowLocalDate, nowLocalTime);
  const dayDiff = Math.floor(
    (localDateTimeToComparableMinutes(query.localDate, "00:00") - localDateTimeToComparableMinutes(nowLocalDate, "00:00")) /
      1440
  );
  if (dayDiff < 0 || dayDiff > settings.bookingWindowDays) {
    return { ...result, blockedReason: "outside_booking_window" };
  }

  // F) opening hours
  const weekday = getWeekdayFromLocalDate(query.localDate);
  if (!weekday) {
    return { ...result, blockedReason: "invalid_date" };
  }

  if (!isValidOpeningHoursJson(settings.openingHoursJson)) {
    result.warnings.push("opening hours not configured");
    return { ...result, blockedReason: "opening_hours_not_configured" };
  }

  const windows: OpeningHoursWindow[] = settings.openingHoursJson[weekday] ?? [];
  if (windows.length === 0) {
    result.warnings.push(`restaurant is closed on ${weekday}`);
    return result;
  }

  const [blackoutDates, tables, reservations] = await Promise.all([
    prisma.blackoutDate.findMany({
      where: { restaurantId: query.restaurantId, localDate: query.localDate, status: "active" },
    }),
    prisma.restaurantTable.findMany({ where: { restaurantId: query.restaurantId, isActive: true } }),
    prisma.reservation.findMany({
      where: {
        restaurantId: query.restaurantId,
        reservationDate: {
          gte: new Date(`${query.localDate}T00:00:00.000Z`),
          lte: new Date(`${query.localDate}T23:59:59.999Z`),
        },
        status: { in: [...BLOCKING_RESERVATION_STATUSES] },
      },
    }),
  ]);

  // G) full-day blackout blocks the entire date
  if (blackoutDates.some((b) => b.isFullDay)) {
    return { ...result, blockedReason: "blackout_full_day" };
  }

  const candidateTimes = generateTimeSlotsForDay(windows, settings.slotIntervalMinutes, settings.defaultReservationDurationMinutes);

  result.availableSlots = candidateTimes.map((time) =>
    computeSlotEntry({
      time,
      localDate: query.localDate,
      partySize: query.partySize,
      durationMinutes: settings.defaultReservationDurationMinutes,
      maxReservationsPerSlot: settings.maxReservationsPerSlot,
      minAdvanceMinutes: settings.minAdvanceMinutes,
      nowComparable,
      tables,
      reservations,
      blackoutDates,
    })
  );

  // L) preferred time
  if (query.preferredTime) {
    const match = result.availableSlots.find((slot) => slot.time === query.preferredTime);
    result.preferredTime = { time: query.preferredTime, available: match?.available ?? false };
  }

  return result;
}

function timeToMinutesSafe(time: string): boolean {
  try {
    timeToMinutes(time);
    return true;
  } catch {
    return false;
  }
}

function computeSlotEntry(params: {
  time: string;
  localDate: string;
  partySize: number;
  durationMinutes: number;
  maxReservationsPerSlot: number | null;
  minAdvanceMinutes: number;
  nowComparable: number;
  tables: AvailabilityTable[];
  reservations: AvailabilityReservation[];
  blackoutDates: AvailabilityBlackoutDate[];
}): AvailabilitySlotEntry {
  const {
    time,
    localDate,
    partySize,
    durationMinutes,
    maxReservationsPerSlot,
    minAdvanceMinutes,
    nowComparable,
    tables,
    reservations,
    blackoutDates,
  } = params;

  const slotStartMinutes = timeToMinutes(time);
  const slotEndMinutes = slotStartMinutes + durationMinutes;

  // E) minimum advance
  const slotComparable = localDateTimeToComparableMinutes(localDate, time);
  if (slotComparable < nowComparable + minAdvanceMinutes) {
    return { time, available: false, availableTableIds: [], capacity: 0, reason: "min_advance" };
  }

  // G) partial blackout
  const blockedByBlackout = blackoutDates.some(
    (blackout) =>
      !blackout.isFullDay &&
      blackout.startsAtLocal &&
      blackout.endsAtLocal &&
      timeRangesOverlap(slotStartMinutes, slotEndMinutes, timeToMinutes(blackout.startsAtLocal), timeToMinutes(blackout.endsAtLocal))
  );
  if (blockedByBlackout) {
    return { time, available: false, availableTableIds: [], capacity: 0, reason: "blackout" };
  }

  // I) overlapping reservations
  const overlapping = reservations.filter((reservation) =>
    reservationBlocksSlot(reservation, slotStartMinutes, slotEndMinutes, durationMinutes)
  );

  // J) maxReservationsPerSlot
  if (maxReservationsPerSlot != null && overlapping.length >= maxReservationsPerSlot) {
    return { time, available: false, availableTableIds: [], capacity: 0, reason: "max_reservations_per_slot" };
  }

  // H) tables and capacity — unassigned overlapping reservations are
  // intentionally not matched to a table (see file-level note above).
  const occupiedTableIds = new Set(
    overlapping.map((reservation) => reservation.assignedTableId).filter((id): id is string => Boolean(id))
  );
  const fittingTables = tables.filter((table) => tableCanFitParty(table, partySize) && !occupiedTableIds.has(table.id));

  if (fittingTables.length === 0) {
    return { time, available: false, availableTableIds: [], capacity: 0, reason: "no_capacity" };
  }

  return {
    time,
    available: true,
    availableTableIds: fittingTables.map((table) => table.id),
    capacity: Math.max(...fittingTables.map((table) => table.capacity)),
  };
}
