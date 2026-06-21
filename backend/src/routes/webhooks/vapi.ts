import express, { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { logger } from "../../utils/logger";
import { getVapiResponse } from "../../utils/vapi/messages";
import {
  buildMissingFieldsResponse,
  getValueFromAliases,
  normalizeDate,
  normalizePartySize,
  normalizePhone,
  normalizeTime,
  toDigitsOnlyPhone,
} from "../../utils/vapi/normalizers";
import { parseVapiPayload } from "../../utils/vapi/parser";
import { sendVapiToolErrorResponse, sendVapiToolResponse } from "../../utils/vapi/toolResponse";
import { prisma } from "../../prisma/client";
import { createVapiReservationRequest, resolveVapiIntegrationConnection } from "../../services/vapiReservationService";

export const vapiWebhookRouter = express.Router();

// POST /api/webhooks/vapi/:publicWebhookKey/create-reservation-request
//
// Mirrors src/app/api/vapi/create-reservation-request/route.ts (Next.js app)
// but resolves the tenant from IntegrationConnection.publicWebhookKey instead
// of a single hardcoded Supabase project, and writes to the multi-tenant
// Prisma schema. The old Next.js/Supabase endpoint is untouched and keeps
// serving the production Vapi assistant during this migration phase.
//
// req.body's shape is decided by Vapi, not by us, so it is left as the
// `any` Express infers rather than annotated/cast to `any` explicitly.
vapiWebhookRouter.post(
  "/:publicWebhookKey/create-reservation-request",
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody = req.body ?? {};
    const { publicWebhookKey } = req.params;

    const connection = await resolveVapiIntegrationConnection(publicWebhookKey);
    if (!connection) {
      sendVapiToolErrorResponse(res, rawBody, "Unknown or inactive webhook key");
      return;
    }
    const { restaurantId } = connection;

    const body = parseVapiPayload(rawBody);
    const allSources = [body, rawBody];
    const currentYear = new Date().getFullYear();

    const customerName: string =
      getValueFromAliases(allSources, ["customer_name", "full_name", "name", "customerName"]) || "";
    const rawPhone =
      getValueFromAliases(allSources, ["phone_number", "phone", "caller_phone", "customer_phone"]) ||
      rawBody?.customer?.number ||
      rawBody?.message?.customer?.number ||
      rawBody?.message?.call?.customer?.number ||
      rawBody?.call?.customer?.number ||
      null;
    const phoneNumber = normalizePhone(rawPhone);

    const reservationDate = normalizeDate(
      getValueFromAliases(allSources, ["reservation_date", "date", "requested_date"]),
      currentYear
    );
    const reservationTime = normalizeTime(
      getValueFromAliases(allSources, ["reservation_time", "time", "requested_time"])
    );
    const partySize = normalizePartySize(
      getValueFromAliases(allSources, [
        "party_size",
        "partySize",
        "guests",
        "guest_count",
        "number_of_people",
        "people",
      ])
    );
    const language: string = getValueFromAliases(allSources, ["language", "lang"]) || "tr";
    const specialRequest: string | null =
      getValueFromAliases(allSources, ["special_request", "notes", "request", "special_notes"]) || null;
    const callId: string | null = body.call_id || null;

    const missingFields: string[] = [];
    if (!customerName) missingFields.push("customer_name");
    if (!phoneNumber) missingFields.push("phone_number");
    if (!reservationDate) missingFields.push("reservation_date");
    if (!reservationTime) missingFields.push("reservation_time");
    if (!partySize) missingFields.push("party_size");

    if (missingFields.length > 0) {
      sendVapiToolResponse(res, rawBody, buildMissingFieldsResponse(missingFields));
      return;
    }

    const toolLog = await prisma.toolLog.create({
      data: {
        restaurantId,
        channel: "voice",
        provider: "vapi",
        toolName: "create_reservation_request",
        externalCallId: callId,
        requestPayload: rawBody,
        status: "processing",
      },
    });

    try {
      const result = await createVapiReservationRequest({
        restaurantId,
        customerName,
        phoneNumber: phoneNumber as string,
        normalizedPhone: toDigitsOnlyPhone(phoneNumber as string),
        partySize: partySize as number,
        reservationDate: reservationDate as string,
        reservationTime: reservationTime as string,
        language,
        specialRequest,
        callId,
        rawPayload: rawBody,
      });

      await prisma.toolLog.update({
        where: { id: toolLog.id },
        data: {
          status: "success",
          responsePayload: { reservationRequestId: result.reservationRequestId },
        },
      });

      sendVapiToolResponse(res, rawBody, getVapiResponse("reservation_received", language));
    } catch (error) {
      logger.error({ err: error, restaurantId, callId }, "vapi create-reservation-request failed");

      await prisma.toolLog
        .update({
          where: { id: toolLog.id },
          data: {
            status: "failure",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          },
        })
        .catch(() => {
          // Logging the failure must never mask the original error response below.
        });

      sendVapiToolErrorResponse(res, rawBody, "Internal error while creating reservation request");
    }
  })
);

// Scaffolded for a later phase — Phase 4 only implements create-reservation-request.
function notImplemented(req: Request, res: Response): void {
  res.status(501).json({ error: "Not implemented yet" });
}

vapiWebhookRouter.post("/:publicWebhookKey/modify-reservation-request", notImplemented);
vapiWebhookRouter.post("/:publicWebhookKey/cancel-reservation-request", notImplemented);
vapiWebhookRouter.post("/:publicWebhookKey/handoff-to-staff", notImplemented);

export default vapiWebhookRouter;
