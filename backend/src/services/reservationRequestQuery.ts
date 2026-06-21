import type { Prisma } from "@prisma/client";
import type { ListReservationRequestsQuery, ReservationRequestStatus } from "../schemas/reservationRequests";

/**
 * Allowed status transitions for ReservationRequest. Mirrors the Dental CRM
 * appointment-request "converted requests cannot be changed" terminal-state
 * guard, adapted into a full transition map so PATCH/confirm/reject can all
 * share one source of truth instead of duplicating ad-hoc checks.
 */
export const STATUS_TRANSITIONS: Record<ReservationRequestStatus, ReservationRequestStatus[]> = {
  new: ["pending_info", "confirmed", "rejected", "cancelled"],
  pending_info: ["new", "confirmed", "rejected", "cancelled"],
  confirmed: ["done", "cancelled"],
  rejected: [],
  cancelled: [],
  done: [],
};

/**
 * Terminal statuses have no outgoing transitions at all, including into
 * themselves: a second reject/confirm/etc. on an already-terminal request
 * must be a controlled 400, not a silent no-op success.
 */
function isTerminalStatus(status: ReservationRequestStatus): boolean {
  return STATUS_TRANSITIONS[status].length === 0;
}

export function isValidStatusTransition(
  current: ReservationRequestStatus,
  next: ReservationRequestStatus
): boolean {
  if (current === next) return !isTerminalStatus(current);
  return STATUS_TRANSITIONS[current].includes(next);
}

export function buildReservationRequestListWhere(
  restaurantId: string,
  filters: Pick<ListReservationRequestsQuery, "status" | "channel" | "provider" | "dateFrom" | "dateTo" | "search">
): Prisma.ReservationRequestWhereInput {
  const where: Prisma.ReservationRequestWhereInput = { restaurantId };

  if (filters.status) where.status = filters.status;
  if (filters.channel) where.channel = filters.channel;
  if (filters.provider) where.provider = filters.provider;

  if (filters.dateFrom || filters.dateTo) {
    where.reservationDate = {
      ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  if (filters.search) {
    where.OR = [
      { customerName: { contains: filters.search, mode: "insensitive" } },
      { phoneNumber: { contains: filters.search } },
      { normalizedPhone: { contains: filters.search } },
    ];
  }

  return where;
}
