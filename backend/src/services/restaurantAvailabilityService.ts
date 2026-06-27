import { Prisma } from "@prisma/client";
import type { BlackoutDate, Restaurant, RestaurantSettings } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  CreateBlackoutDateInput,
  ListBlackoutDatesQuery,
  UpdateAvailabilitySettingsInput,
  UpdateBlackoutDateInput,
} from "../schemas/restaurantAvailability";

const DEFAULT_SETTINGS = {
  reservationsEnabled: true,
  slotIntervalMinutes: 30,
  defaultReservationDurationMinutes: 90,
  minAdvanceMinutes: 60,
  bookingWindowDays: 30,
  minPartySize: 1,
  maxPartySize: 12,
} as const;

function toSafeSettings(row: RestaurantSettings) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    reservationsEnabled: row.reservationsEnabled,
    openingHoursJson: row.openingHoursJson,
    slotIntervalMinutes: row.slotIntervalMinutes,
    defaultReservationDurationMinutes: row.defaultReservationDurationMinutes,
    minAdvanceMinutes: row.minAdvanceMinutes,
    bookingWindowDays: row.bookingWindowDays,
    minPartySize: row.minPartySize,
    maxPartySize: row.maxPartySize,
    maxReservationsPerSlot: row.maxReservationsPerSlot,
    manualApprovalThreshold: row.manualApprovalThreshold,
    autoConfirm: row.autoConfirm,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSafeBlackoutDate(row: BlackoutDate) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    localDate: row.localDate,
    startsAtLocal: row.startsAtLocal,
    endsAtLocal: row.endsAtLocal,
    isFullDay: row.isFullDay,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Returns the restaurant's settings row, creating it on first read with
 * default values. Mirrors the "ensure default settings row exists" rule
 * from the seed: callers (API or seed) should never have to special-case a
 * missing row.
 */
export async function getOrCreateAvailabilitySettings(restaurantId: string) {
  const existing = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
  if (existing) return existing;

  return prisma.restaurantSettings.upsert({
    where: { restaurantId },
    update: {},
    create: { restaurantId, ...DEFAULT_SETTINGS },
  });
}

export async function getAvailabilitySettings(restaurantId: string) {
  const settings = await getOrCreateAvailabilitySettings(restaurantId);
  return toSafeSettings(settings);
}

export async function updateAvailabilitySettings(restaurantId: string, patch: UpdateAvailabilitySettingsInput) {
  await getOrCreateAvailabilitySettings(restaurantId);

  const data: Prisma.RestaurantSettingsUpdateInput = {};
  if (patch.reservationsEnabled !== undefined) data.reservationsEnabled = patch.reservationsEnabled;
  if (patch.openingHoursJson !== undefined)
    data.openingHoursJson =
      patch.openingHoursJson === null ? Prisma.JsonNull : (patch.openingHoursJson as Prisma.InputJsonValue);
  if (patch.slotIntervalMinutes !== undefined) data.slotIntervalMinutes = patch.slotIntervalMinutes;
  if (patch.defaultReservationDurationMinutes !== undefined)
    data.defaultReservationDurationMinutes = patch.defaultReservationDurationMinutes;
  if (patch.minAdvanceMinutes !== undefined) data.minAdvanceMinutes = patch.minAdvanceMinutes;
  if (patch.bookingWindowDays !== undefined) data.bookingWindowDays = patch.bookingWindowDays;
  if (patch.minPartySize !== undefined) data.minPartySize = patch.minPartySize;
  if (patch.maxPartySize !== undefined) data.maxPartySize = patch.maxPartySize;
  if (patch.maxReservationsPerSlot !== undefined) data.maxReservationsPerSlot = patch.maxReservationsPerSlot;
  if (patch.manualApprovalThreshold !== undefined) data.manualApprovalThreshold = patch.manualApprovalThreshold;
  if (patch.autoConfirm !== undefined) data.autoConfirm = patch.autoConfirm;
  if (patch.notes !== undefined) data.notes = patch.notes;

  const updated = await prisma.restaurantSettings.update({ where: { restaurantId }, data });
  return toSafeSettings(updated);
}

/**
 * Looks up a blackout date scoped to restaurantId. Returns null for both
 * "does not exist" and "belongs to another restaurant", same pattern as
 * findTableForRestaurant in tableService.ts.
 */
export async function findBlackoutDateForRestaurant(restaurantId: string, blackoutDateId: string) {
  return prisma.blackoutDate.findFirst({ where: { id: blackoutDateId, restaurantId } });
}

export async function listBlackoutDates(restaurantId: string, query: ListBlackoutDatesQuery) {
  const where: Prisma.BlackoutDateWhereInput = { restaurantId };
  if (query.status) where.status = query.status;
  if (query.fromDate || query.toDate) {
    where.localDate = {
      ...(query.fromDate ? { gte: query.fromDate } : {}),
      ...(query.toDate ? { lte: query.toDate } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.blackoutDate.count({ where }),
    prisma.blackoutDate.findMany({
      where,
      orderBy: { localDate: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    data: rows.map(toSafeBlackoutDate),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getBlackoutDateDetail(restaurantId: string, blackoutDateId: string) {
  const row = await findBlackoutDateForRestaurant(restaurantId, blackoutDateId);
  return row ? toSafeBlackoutDate(row) : null;
}

export async function createBlackoutDate(restaurantId: string, input: CreateBlackoutDateInput) {
  const created = await prisma.blackoutDate.create({
    data: {
      restaurantId,
      localDate: input.localDate,
      isFullDay: input.isFullDay,
      startsAtLocal: input.isFullDay ? null : input.startsAtLocal ?? null,
      endsAtLocal: input.isFullDay ? null : input.endsAtLocal ?? null,
      reason: input.reason ?? null,
      status: input.status ?? "active",
    },
  });

  return toSafeBlackoutDate(created);
}

export async function updateBlackoutDate(
  restaurantId: string,
  blackoutDateId: string,
  patch: UpdateBlackoutDateInput
) {
  const data: Prisma.BlackoutDateUpdateInput = {};
  if (patch.localDate !== undefined) data.localDate = patch.localDate;
  if (patch.isFullDay !== undefined) {
    data.isFullDay = patch.isFullDay;
    if (patch.isFullDay) {
      data.startsAtLocal = null;
      data.endsAtLocal = null;
    }
  }
  if (patch.startsAtLocal !== undefined && patch.isFullDay !== true) data.startsAtLocal = patch.startsAtLocal;
  if (patch.endsAtLocal !== undefined && patch.isFullDay !== true) data.endsAtLocal = patch.endsAtLocal;
  if (patch.reason !== undefined) data.reason = patch.reason;
  if (patch.status !== undefined) data.status = patch.status;

  const updated = await prisma.blackoutDate.update({ where: { id: blackoutDateId, restaurantId }, data });
  return toSafeBlackoutDate(updated);
}

export async function deactivateBlackoutDate(restaurantId: string, blackoutDateId: string) {
  const updated = await prisma.blackoutDate.update({
    where: { id: blackoutDateId, restaurantId },
    data: { status: "inactive" },
  });

  return toSafeBlackoutDate(updated);
}

/**
 * Pure read helper for future Vapi availability parity (not wired into any
 * production route in this phase — see AGENTS.md Phase 24 constraints).
 */
export async function getRestaurantAvailabilityConfig(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) return null;

  const [settings, blackoutDates] = await Promise.all([
    getOrCreateAvailabilitySettings(restaurantId),
    prisma.blackoutDate.findMany({ where: { restaurantId, status: "active" }, orderBy: { localDate: "asc" } }),
  ]);

  return {
    restaurant: toSafeRestaurantSummary(restaurant),
    settings: toSafeSettings(settings),
    activeBlackoutDates: blackoutDates.map(toSafeBlackoutDate),
  };
}

function toSafeRestaurantSummary(restaurant: Restaurant) {
  return {
    id: restaurant.id,
    timezone: restaurant.timezone,
    defaultLanguage: restaurant.defaultLanguage,
    status: restaurant.status,
  };
}
