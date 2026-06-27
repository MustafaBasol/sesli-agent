/**
 * Types for the Phase 25 availability slot calculation service. Kept
 * separate from availabilitySlotService.ts so pure helpers (which import
 * only these types) never pull in the prisma client.
 */

export type AvailabilitySlotQuery = {
  restaurantId: string;
  localDate: string; // YYYY-MM-DD
  partySize: number;
  preferredTime?: string; // HH:mm
  now?: Date; // injectable for tests
};

export type AvailabilitySlotEntry = {
  time: string; // HH:mm
  available: boolean;
  availableTableIds: string[];
  capacity: number;
  reason?: string;
};

export type AvailabilitySlotResult = {
  restaurantId: string;
  localDate: string;
  partySize: number;
  timezone: string;
  durationMinutes: number;
  slotIntervalMinutes: number;
  availableSlots: AvailabilitySlotEntry[];
  warnings: string[];
  blockedReason?: string;
  preferredTime?: {
    time: string;
    available: boolean;
  };
  /** True when partySize >= restaurant's manualApprovalThreshold. */
  needsManualApproval?: boolean;
  manualApprovalThreshold?: number | null;
};

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type OpeningHoursWindow = { start: string; end: string };

export type OpeningHoursJson = Partial<Record<Weekday, OpeningHoursWindow[]>>;

// Mirrors RESERVATION_STATUSES in schemas/reservations.ts. Only these two
// statuses hold a slot — cancelled/no_show/completed reservations free it up.
export const BLOCKING_RESERVATION_STATUSES = ["pending", "confirmed"] as const;

export type AvailabilityReservation = {
  reservationTime: string; // HH:mm
  partySize: number;
  status: string;
  assignedTableId: string | null;
};

export type AvailabilityTable = {
  id: string;
  capacity: number;
  isActive: boolean;
};

export type AvailabilityBlackoutDate = {
  isFullDay: boolean;
  startsAtLocal: string | null;
  endsAtLocal: string | null;
};
