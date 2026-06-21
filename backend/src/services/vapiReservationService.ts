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
      lastVisitAt: new Date(),
      totalReservations: { increment: 1 },
    },
    create: {
      restaurantId,
      phoneNumber,
      normalizedPhone,
      fullName: customerName,
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
