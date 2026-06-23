import express, { Request, Response } from "express";
import { webhookRateLimiter } from "../../middleware/rateLimit";
import { asyncHandler } from "../../utils/asyncHandler";
import { logger } from "../../utils/logger";
import { getVapiResponse } from "../../utils/vapi/messages";
import { parseVapiPayload } from "../../utils/vapi/parser";
import { sendVapiToolErrorResponse, sendVapiToolResponse } from "../../utils/vapi/toolResponse";
import {
  buildMissingArgsResponse,
  extractCheckAvailabilityArgs,
  mapAvailabilityResultToVapiResponse,
} from "../../utils/vapi/checkAvailabilityAdapter";
import {
  buildAvailabilityBlockedResponse,
  buildCreateMissingFieldsResponse,
  CREATE_BLOCKING_AVAILABILITY_REASONS,
  computeMissingFields,
  extractCreateReservationRequestArgs,
} from "../../utils/vapi/createReservationRequestAdapter";
import {
  buildCustomerProfileConflictResponse,
  buildCustomerProfileMissingFieldsResponse,
  computeCreateCustomerProfileMissingFields,
  computeGetCustomerProfileMissingFields,
  extractCreateCustomerProfileArgs,
  extractGetCustomerProfileArgs,
  toSafeCustomerPayload,
} from "../../utils/vapi/customerProfileAdapter";
import { prisma } from "../../prisma/client";
import {
  createVapiReservationRequest,
  findExistingReservationRequestByCallId,
  resolveVapiIntegrationConnection,
} from "../../services/vapiReservationService";
import { calculateAvailabilitySlots } from "../../services/availabilitySlotService";
import { lookupVapiCustomer, upsertVapiCustomer } from "../../services/vapiCustomerProfileService";

export const vapiWebhookRouter = express.Router();

// Public, key-authenticated surface — rate-limited independently of any
// user session (see docs/06_SECURITY_AND_TENANCY_RULES.md rate limiting).
vapiWebhookRouter.use(webhookRateLimiter);

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
    // An unknown/inactive key is a caller authentication problem, not a server
    // failure: it must never surface as a 500 (which pino-http logs as
    // "request errored" and which would page on-call for a non-incident).
    // If Vapi sent a toolCallId, buildVapiErrorPayload still wraps this as a
    // 200 tool-result-with-error, matching the existing Vapi-compatible shape.
    // Phase 28: a resolved-but-inactive/error connection is treated the same
    // as "not found" — closing the gap flagged in
    // docs/backend-vapi-webhook-parity-assessment.md Section 7.
    if (!connection || connection.status !== "active") {
      sendVapiToolErrorResponse(res, rawBody, "Unknown or inactive webhook key", 401);
      return;
    }
    const { restaurantId } = connection;

    const body = parseVapiPayload(rawBody);
    const allSources = [body, rawBody];
    const currentYear = new Date().getFullYear();

    const args = extractCreateReservationRequestArgs(allSources, rawBody, currentYear);
    const { customerName, phoneNumber, normalizedPhone, email, reservationDate, reservationTime, partySize, language, specialRequest, callId } = args;

    const missingFields = computeMissingFields(args);
    if (missingFields.length > 0) {
      sendVapiToolResponse(res, rawBody, buildCreateMissingFieldsResponse(missingFields));
      return;
    }

    // Phase 28 idempotency guard — see findExistingReservationRequestByCallId's
    // docstring for the documented race-window limitation (no unique
    // constraint on sourceExternalId; best-effort only).
    if (callId) {
      const existing = await findExistingReservationRequestByCallId(restaurantId, callId);
      if (existing) {
        await prisma.toolLog.create({
          data: {
            restaurantId,
            channel: "voice",
            provider: "vapi",
            toolName: "create_reservation_request",
            externalCallId: callId,
            requestPayload: rawBody,
            status: "success",
            responsePayload: { duplicateRetry: true, reservationRequestId: existing.reservationRequestId },
          },
        });
        sendVapiToolResponse(res, rawBody, {
          ...getVapiResponse("reservation_received", language),
          success: true,
          reservation_request_id: existing.reservationRequestId,
          customer_id: existing.customerId,
          next_step: "awaiting_restaurant_confirmation",
        });
        return;
      }
    }

    // Phase 28 availability hard-block check — conservative by design, see
    // CREATE_BLOCKING_AVAILABILITY_REASONS for exactly which reasons block
    // creation. Never throws the request into the generic error path: a
    // failure here is logged and creation proceeds rather than becoming
    // brittle on an additive safety check.
    try {
      const availability = await calculateAvailabilitySlots({
        restaurantId,
        localDate: reservationDate as string,
        partySize: partySize as number,
        preferredTime: reservationTime as string,
      });
      if (availability.blockedReason && CREATE_BLOCKING_AVAILABILITY_REASONS.has(availability.blockedReason)) {
        sendVapiToolResponse(res, rawBody, buildAvailabilityBlockedResponse(availability.blockedReason));
        return;
      }
    } catch (error) {
      logger.warn(
        { err: error, restaurantId, callId },
        "vapi create-reservation-request availability pre-check failed; proceeding without blocking"
      );
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
        normalizedPhone: normalizedPhone as string,
        email,
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
          responsePayload: {
            reservationRequestId: result.reservationRequestId,
            normalizedArgs: { partySize, reservationDate, reservationTime, language },
          },
        },
      });

      sendVapiToolResponse(res, rawBody, {
        ...getVapiResponse("reservation_received", language),
        success: true,
        reservation_request_id: result.reservationRequestId,
        customer_id: result.customerId,
        next_step: "awaiting_restaurant_confirmation",
      });
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

// POST /api/webhooks/vapi/:publicWebhookKey/check-availability
//
// Read-only adapter over the Phase 25 calculateAvailabilitySlots() service.
// Never creates a ReservationRequest/Reservation — see AGENTS.md Phase 27
// constraints. The old Next.js/Supabase check-availability route is
// untouched and keeps serving the production Vapi assistant.
vapiWebhookRouter.post(
  "/:publicWebhookKey/check-availability",
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody = req.body ?? {};
    const { publicWebhookKey } = req.params;

    const connection = await resolveVapiIntegrationConnection(publicWebhookKey);
    if (!connection) {
      sendVapiToolErrorResponse(res, rawBody, "Unknown or inactive webhook key", 401);
      return;
    }
    const { restaurantId } = connection;

    const body = parseVapiPayload(rawBody);
    const allSources = [body, rawBody];
    const currentYear = new Date().getFullYear();
    const callId: string | null = body.call_id || null;

    const { localDate, partySize, preferredTime } = extractCheckAvailabilityArgs(allSources, currentYear);

    const missingFields: string[] = [];
    if (!localDate) missingFields.push("date");
    if (!partySize) missingFields.push("party_size");

    if (missingFields.length > 0) {
      sendVapiToolResponse(res, rawBody, buildMissingArgsResponse(missingFields));
      return;
    }

    const toolLog = await prisma.toolLog.create({
      data: {
        restaurantId,
        channel: "voice",
        provider: "vapi",
        toolName: "check_availability",
        externalCallId: callId,
        requestPayload: rawBody,
        status: "processing",
      },
    });

    try {
      const result = await calculateAvailabilitySlots({
        restaurantId,
        localDate: localDate as string,
        partySize: partySize as number,
        preferredTime: preferredTime ?? undefined,
      });

      const response = mapAvailabilityResultToVapiResponse(result, preferredTime);

      await prisma.toolLog.update({
        where: { id: toolLog.id },
        data: {
          status: "success",
          responsePayload: { available: response.available, blockedReason: result.blockedReason ?? null },
        },
      });

      sendVapiToolResponse(res, rawBody, response);
    } catch (error) {
      logger.error({ err: error, restaurantId, callId }, "vapi check-availability failed");

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

      sendVapiToolErrorResponse(res, rawBody, "Internal error while checking availability");
    }
  })
);

// POST /api/webhooks/vapi/:publicWebhookKey/get-customer-profile
//
// Read-only adapter over the backend Customer model. Mirrors
// src/app/api/vapi/get-customer-profile/route.ts's intent (recognize a
// returning caller) but looks up by an exact normalizedPhone/email match
// scoped to restaurantId instead of a global last-9-digits suffix scan, and
// never performs the old route's legacy-dispatcher "silent registration"
// (it is strictly read-only — see AGENTS.md Phase 29 item 4). The old
// Next.js/Supabase route is untouched and keeps serving the production Vapi
// assistant during this migration phase.
vapiWebhookRouter.post(
  "/:publicWebhookKey/get-customer-profile",
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody = req.body ?? {};
    const { publicWebhookKey } = req.params;

    const connection = await resolveVapiIntegrationConnection(publicWebhookKey);
    if (!connection || connection.status !== "active") {
      sendVapiToolErrorResponse(res, rawBody, "Unknown or inactive webhook key", 401);
      return;
    }
    const { restaurantId } = connection;

    const body = parseVapiPayload(rawBody);
    const allSources = [body, rawBody];
    const args = extractGetCustomerProfileArgs(allSources, rawBody);

    const missingFields = computeGetCustomerProfileMissingFields(args);

    const toolLog = await prisma.toolLog.create({
      data: {
        restaurantId,
        channel: "voice",
        provider: "vapi",
        toolName: "get_customer_profile",
        externalCallId: args.callId,
        requestPayload: rawBody,
        status: "processing",
      },
    });

    if (missingFields.length > 0) {
      await prisma.toolLog.update({
        where: { id: toolLog.id },
        data: { status: "failure", errorMessage: `Missing required fields: ${missingFields.join(", ")}` },
      });
      sendVapiToolResponse(res, rawBody, buildCustomerProfileMissingFieldsResponse(missingFields));
      return;
    }

    try {
      const { customer, conflict } = await lookupVapiCustomer(restaurantId, args.normalizedPhone, args.email);

      if (conflict) {
        await prisma.toolLog.update({
          where: { id: toolLog.id },
          data: { status: "success", responsePayload: { conflict: true } },
        });
        sendVapiToolResponse(res, rawBody, buildCustomerProfileConflictResponse());
        return;
      }

      if (!customer) {
        await prisma.toolLog.update({
          where: { id: toolLog.id },
          data: { status: "success", responsePayload: { found: false } },
        });
        sendVapiToolResponse(res, rawBody, {
          success: true,
          found: false,
          message: "Customer not found.",
        });
        return;
      }

      await prisma.toolLog.update({
        where: { id: toolLog.id },
        data: { status: "success", responsePayload: { found: true, customerId: customer.id } },
      });
      sendVapiToolResponse(res, rawBody, {
        success: true,
        found: true,
        message: "Customer found.",
        customer_id: customer.id,
        customer: toSafeCustomerPayload(customer),
      });
    } catch (error) {
      logger.error({ err: error, restaurantId, callId: args.callId }, "vapi get-customer-profile failed");

      await prisma.toolLog
        .update({
          where: { id: toolLog.id },
          data: { status: "failure", errorMessage: error instanceof Error ? error.message : "Unknown error" },
        })
        .catch(() => {
          // Logging the failure must never mask the original error response below.
        });

      sendVapiToolErrorResponse(res, rawBody, "Internal error while looking up customer profile");
    }
  })
);

// POST /api/webhooks/vapi/:publicWebhookKey/create-customer-profile
//
// Upsert adapter over the backend Customer model — update-if-found,
// create-if-not, scoped to restaurantId. Never creates a ReservationRequest
// or Reservation (see AGENTS.md Phase 29 constraints). The old
// Next.js/Supabase route is untouched and keeps serving the production Vapi
// assistant during this migration phase.
vapiWebhookRouter.post(
  "/:publicWebhookKey/create-customer-profile",
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody = req.body ?? {};
    const { publicWebhookKey } = req.params;

    const connection = await resolveVapiIntegrationConnection(publicWebhookKey);
    if (!connection || connection.status !== "active") {
      sendVapiToolErrorResponse(res, rawBody, "Unknown or inactive webhook key", 401);
      return;
    }
    const { restaurantId } = connection;

    const body = parseVapiPayload(rawBody);
    const allSources = [body, rawBody];
    const args = extractCreateCustomerProfileArgs(allSources, rawBody);

    const missingFields = computeCreateCustomerProfileMissingFields(args);

    const toolLog = await prisma.toolLog.create({
      data: {
        restaurantId,
        channel: "voice",
        provider: "vapi",
        toolName: "create_customer_profile",
        externalCallId: args.callId,
        requestPayload: rawBody,
        status: "processing",
      },
    });

    if (missingFields.length > 0) {
      await prisma.toolLog.update({
        where: { id: toolLog.id },
        data: { status: "failure", errorMessage: `Missing required fields: ${missingFields.join(", ")}` },
      });
      sendVapiToolResponse(res, rawBody, buildCustomerProfileMissingFieldsResponse(missingFields));
      return;
    }

    try {
      const { customer: existing, conflict } = await lookupVapiCustomer(
        restaurantId,
        args.normalizedPhone,
        args.email
      );

      if (conflict) {
        await prisma.toolLog.update({
          where: { id: toolLog.id },
          data: { status: "success", responsePayload: { conflict: true } },
        });
        sendVapiToolResponse(res, rawBody, buildCustomerProfileConflictResponse());
        return;
      }

      const { action, customer } = await upsertVapiCustomer(
        {
          restaurantId,
          name: args.name,
          phone: args.phone,
          normalizedPhone: args.normalizedPhone,
          email: args.email,
          notes: args.notes,
        },
        existing
      );

      await prisma.toolLog.update({
        where: { id: toolLog.id },
        data: { status: "success", responsePayload: { action, customerId: customer.id } },
      });

      sendVapiToolResponse(res, rawBody, {
        success: true,
        action,
        message: action === "created" ? "Customer profile created." : "Customer profile updated.",
        customer_id: customer.id,
        customer: toSafeCustomerPayload(customer),
      });
    } catch (error) {
      logger.error({ err: error, restaurantId, callId: args.callId }, "vapi create-customer-profile failed");

      await prisma.toolLog
        .update({
          where: { id: toolLog.id },
          data: { status: "failure", errorMessage: error instanceof Error ? error.message : "Unknown error" },
        })
        .catch(() => {
          // Logging the failure must never mask the original error response below.
        });

      sendVapiToolErrorResponse(res, rawBody, "Internal error while creating customer profile");
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
