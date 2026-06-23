import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";

export interface VapiIntegrationConnection {
  id: string;
  restaurantId: string;
  status: string;
}

/**
 * Resolves the tenant for an inbound Vapi webhook by its public webhook key.
 * The restaurantId never comes from the request itself — only from this
 * lookup — so a forged/guessed restaurantId in the URL can never be trusted
 * (see docs/06_SECURITY_AND_TENANCY_RULES.md).
 */
export async function resolveVapiIntegrationConnection(
  publicWebhookKey: string
): Promise<VapiIntegrationConnection | null> {
  return prisma.integrationConnection.findFirst({
    where: { publicWebhookKey, channel: "vapi" },
    select: { id: true, restaurantId: true, status: true },
  });
}

export interface CreateVapiReservationInput {
  restaurantId: string;
  customerName: string;
  phoneNumber: string;
  normalizedPhone: string;
  email: string | null;
  partySize: number;
  reservationDate: string; // YYYY-MM-DD
  reservationTime: string; // HH:MM
  language: string;
  specialRequest: string | null;
  callId: string | null;
  rawPayload: unknown;
}

export interface CreateVapiReservationResult {
  reservationRequestId: string;
  customerId: string;
  conversationId: string | null;
}

/**
 * Best-effort retry/duplicate guard for Vapi tool-call retries — looks up an
 * existing ReservationRequest created from the same call. There is no unique
 * constraint on (restaurantId, sourceExternalId) — callId is optional and
 * not guaranteed unique by Vapi — so this is a read-then-act check, not a
 * database-enforced guarantee; a genuinely concurrent retry could still race
 * past it. Schema changes to close that gap are out of scope for this phase
 * (see AGENTS.md Phase 28 item 7) — documented as a known limitation.
 */
export async function findExistingReservationRequestByCallId(
  restaurantId: string,
  callId: string
): Promise<CreateVapiReservationResult | null> {
  const existing = await prisma.reservationRequest.findFirst({
    where: {
      restaurantId,
      sourceExternalId: callId,
      channel: "voice",
      provider: "vapi",
      requestType: "create",
    },
    select: { id: true, customerId: true, conversationId: true },
  });
  if (!existing || !existing.customerId) return null;
  return {
    reservationRequestId: existing.id,
    customerId: existing.customerId,
    conversationId: existing.conversationId,
  };
}

function reservationSummary(partySize: number, reservationDate: string, reservationTime: string): string {
  return `Reservation request: ${partySize} guests on ${reservationDate} ${reservationTime}`;
}

/**
 * Mirrors the existing Next.js create-reservation-request flow (customer
 * upsert -> reservation request insert) but scoped to restaurantId and
 * additionally tracking Conversation/Message records, matching the Dental
 * CRM appointment-request pattern this project is reusing.
 */
export async function createVapiReservationRequest(
  input: CreateVapiReservationInput
): Promise<CreateVapiReservationResult> {
  const {
    restaurantId,
    customerName,
    phoneNumber,
    normalizedPhone,
    email,
    partySize,
    reservationDate,
    reservationTime,
    language,
    specialRequest,
    callId,
    rawPayload,
  } = input;

  const rawPayloadJson = rawPayload as Prisma.InputJsonValue;

  const customer = await prisma.customer.upsert({
    where: { restaurantId_normalizedPhone: { restaurantId, normalizedPhone } },
    update: {
      fullName: customerName,
      phoneNumber,
      ...(email ? { email } : {}),
      lastVisitAt: new Date(),
      totalReservations: { increment: 1 },
    },
    create: {
      restaurantId,
      phoneNumber,
      normalizedPhone,
      fullName: customerName,
      email,
      lastVisitAt: new Date(),
      totalReservations: 1,
    },
  });

  let conversationId: string | null = null;

  if (callId) {
    const lastMessagePreview = reservationSummary(partySize, reservationDate, reservationTime);

    const conversation = await prisma.conversation.upsert({
      where: {
        restaurantId_channel_provider_externalThreadId: {
          restaurantId,
          channel: "voice",
          provider: "vapi",
          externalThreadId: callId,
        },
      },
      update: {
        customerId: customer.id,
        customerName,
        customerPhone: phoneNumber,
        lastMessageAt: new Date(),
        lastMessagePreview,
      },
      create: {
        restaurantId,
        customerId: customer.id,
        channel: "voice",
        provider: "vapi",
        externalThreadId: callId,
        customerName,
        customerPhone: phoneNumber,
        status: "open",
        lastMessageAt: new Date(),
        lastMessagePreview,
      },
    });
    conversationId = conversation.id;

    await prisma.message.create({
      data: {
        restaurantId,
        conversationId: conversation.id,
        customerId: customer.id,
        direction: "inbound",
        channel: "voice",
        provider: "vapi",
        senderType: "customer",
        externalMessageId: callId,
        messageText: `${customerName}, party of ${partySize}, ${reservationDate} ${reservationTime}${
          specialRequest ? ` — ${specialRequest}` : ""
        }`,
        rawPayload: rawPayloadJson,
        status: "received",
      },
    });
  }

  const reservationRequest = await prisma.reservationRequest.create({
    data: {
      restaurantId,
      customerId: customer.id,
      conversationId,
      channel: "voice",
      provider: "vapi",
      sourceExternalId: callId,
      requestType: "create",
      customerName,
      phoneNumber,
      normalizedPhone,
      partySize,
      reservationDate: new Date(reservationDate),
      reservationTime,
      language,
      specialRequest,
      rawPayload: rawPayloadJson,
      status: "new",
    },
  });

  return {
    reservationRequestId: reservationRequest.id,
    customerId: customer.id,
    conversationId,
  };
}

/**
 * Looks up a ReservationRequest scoped to restaurantId for the
 * cancel-reservation-request adapter. Returns null for both "does not
 * exist" and "belongs to another restaurant" — same convention as
 * findReservationRequestForRestaurant in reservationRequestService.ts —
 * so a probing request can never distinguish the two.
 */
export async function findVapiReservationRequestById(restaurantId: string, requestId: string) {
  return prisma.reservationRequest.findFirst({ where: { id: requestId, restaurantId } });
}

/** Pending statuses eligible for caller-initiated auto-cancellation (Phase 34). */
const CANCELLABLE_PENDING_STATUSES = ["new", "pending_info"];

export type PendingMatchResult =
  | { status: "exact"; request: { id: string; status: string } }
  | { status: "unmatched" }
  | { status: "ambiguous" };

/**
 * Best-effort match against pending ReservationRequests by normalizedPhone +
 * reservationDate + reservationTime — exact match only, no fuzzy matching.
 * Only ever used to decide whether an *unambiguous* auto-cancel is safe;
 * zero or multiple candidates must never mutate anything (Phase 34 policy).
 */
export async function findUnambiguousPendingMatch(
  restaurantId: string,
  normalizedPhone: string,
  reservationDate: string,
  reservationTime: string
): Promise<PendingMatchResult> {
  const candidates = await prisma.reservationRequest.findMany({
    where: {
      restaurantId,
      normalizedPhone,
      reservationTime,
      reservationDate: new Date(reservationDate),
      status: { in: CANCELLABLE_PENDING_STATUSES },
    },
    select: { id: true, status: true },
  });

  if (candidates.length === 0) return { status: "unmatched" };
  if (candidates.length > 1) return { status: "ambiguous" };
  return { status: "exact", request: candidates[0] };
}

/**
 * Looks up a confirmed Reservation scoped to restaurantId, for the
 * confirmed-Reservation audit-only path (Phase 34 — never directly
 * cancelled by voice).
 */
export async function findVapiReservationById(restaurantId: string, reservationId: string) {
  return prisma.reservation.findFirst({ where: { id: reservationId, restaurantId } });
}

export function isCancellablePendingStatus(status: string): boolean {
  return CANCELLABLE_PENDING_STATUSES.includes(status);
}
