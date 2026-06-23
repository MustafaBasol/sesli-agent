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
import {
  buildClosedReasonResponse,
  buildCurrentDateResponse,
  buildInvalidDateResponse,
  buildNotConfiguredResponse,
  buildOpeningHoursResponse,
  extractGetCurrentDateArgs,
  extractGetOpeningHoursArgs,
  hasAnyConfiguredWindows,
  resolveLanguage,
  resolveRestaurantTimezone,
  validateRequestedDate,
} from "../../utils/vapi/dateOpeningHoursAdapter";
import {
  buildCallSummaryMissingFieldsResponse,
  buildCallSummarySuccessResponse,
  buildSafeCallSummaryPayload,
  computeCallSummaryMissingFields,
  extractCallSummaryArgs,
} from "../../utils/vapi/callSummaryAdapter";
import {
  buildHandoffToStaffMissingFieldsResponse,
  buildHandoffToStaffSuccessResponse,
  buildSafeHandoffToStaffPayload,
  computeHandoffToStaffMissingFields,
  extractHandoffToStaffArgs,
} from "../../utils/vapi/handoffToStaffAdapter";
import {
  buildCancelMissingFieldsResponse,
  buildPendingCancelledResponse,
  buildReviewRequiredResponse,
  buildSafeCancelReservationRequestPayload,
  computeCancelReservationRequestMissingFields,
  extractCancelReservationRequestArgs,
  type CancelActionTaken,
  type CancelMatchStatus,
} from "../../utils/vapi/cancelReservationRequestAdapter";
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";
import {
  createVapiReservationRequest,
  findExistingReservationRequestByCallId,
  findUnambiguousPendingMatch,
  findVapiReservationById,
  findVapiReservationRequestById,
  isCancellablePendingStatus,
  resolveVapiIntegrationConnection,
} from "../../services/vapiReservationService";
import { setReservationRequestStatus } from "../../services/reservationRequestService";
import { calculateAvailabilitySlots } from "../../services/availabilitySlotService";
import { lookupVapiCustomer, upsertVapiCustomer } from "../../services/vapiCustomerProfileService";
import { getOrCreateAvailabilitySettings } from "../../services/restaurantAvailabilityService";
import { getNowPartsInTimezone, getWeekdayFromLocalDate, isValidOpeningHoursJson } from "../../services/availabilitySlotHelpers";
import type { OpeningHoursJson } from "../../services/availabilitySlotTypes";

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

// POST /api/webhooks/vapi/:publicWebhookKey/get-current-date
//
// Read-only adapter over Restaurant.timezone/defaultLanguage. Mirrors
// src/app/api/vapi/get-current-date/route.ts's intent (give the assistant a
// trustworthy "now") but resolves the tenant from
// IntegrationConnection.publicWebhookKey and reports the *restaurant's*
// timezone instead of a single hardcoded "Europe/Paris" constant. The old
// Next.js route is untouched and keeps serving the production Vapi
// assistant during this migration phase.
vapiWebhookRouter.post(
  "/:publicWebhookKey/get-current-date",
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
    const args = extractGetCurrentDateArgs(allSources, rawBody);

    const toolLog = await prisma.toolLog.create({
      data: {
        restaurantId,
        channel: "voice",
        provider: "vapi",
        toolName: "get_current_date",
        externalCallId: args.callId,
        requestPayload: rawBody,
        status: "processing",
      },
    });

    try {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
      const timezone = resolveRestaurantTimezone(restaurant?.timezone);
      const language = resolveLanguage(args.language, restaurant?.defaultLanguage ?? null);
      const now = new Date();
      const { localDate, localTime } = getNowPartsInTimezone(now, timezone);
      const weekday = getWeekdayFromLocalDate(localDate);

      const response = buildCurrentDateResponse({
        timezone,
        localDate,
        localTime,
        // localDate is always a valid YYYY-MM-DD here (computed via Intl), so
        // getWeekdayFromLocalDate cannot return null.
        weekday: weekday!,
        language,
        now,
      });

      await prisma.toolLog.update({
        where: { id: toolLog.id },
        data: { status: "success", responsePayload: { timezone, localDate, localTime } },
      });

      sendVapiToolResponse(res, rawBody, response);
    } catch (error) {
      logger.error({ err: error, restaurantId, callId: args.callId }, "vapi get-current-date failed");

      await prisma.toolLog
        .update({
          where: { id: toolLog.id },
          data: { status: "failure", errorMessage: error instanceof Error ? error.message : "Unknown error" },
        })
        .catch(() => {
          // Logging the failure must never mask the original error response below.
        });

      sendVapiToolErrorResponse(res, rawBody, "Internal error while getting current date");
    }
  })
);

// POST /api/webhooks/vapi/:publicWebhookKey/get-opening-hours
//
// Read-only adapter over RestaurantSettings.openingHoursJson + active
// BlackoutDates. Mirrors src/app/api/vapi/get-opening-hours/route.ts's intent
// (tell the caller when the restaurant is open) but resolves the tenant from
// IntegrationConnection.publicWebhookKey, returns structured opening_periods
// instead of a pre-formatted multi-line string, and never calculates
// availability slots (that is check-availability's job — see AGENTS.md
// Phase 30 constraints). The old Next.js route is untouched and keeps
// serving the production Vapi assistant during this migration phase.
vapiWebhookRouter.post(
  "/:publicWebhookKey/get-opening-hours",
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
    const currentYear = new Date().getFullYear();
    const args = extractGetOpeningHoursArgs(allSources, rawBody);

    // Validated before the ToolLog write so an invalid date is logged as a
    // failure, same convention as a missing-fields create-customer-profile call.
    const requestedDate = validateRequestedDate(args.rawDate, currentYear);
    if (args.rawDate && !requestedDate) {
      await prisma.toolLog.create({
        data: {
          restaurantId,
          channel: "voice",
          provider: "vapi",
          toolName: "get_opening_hours",
          externalCallId: args.callId,
          requestPayload: rawBody,
          status: "failure",
          errorMessage: `Invalid date format: ${args.rawDate}`,
        },
      });
      sendVapiToolResponse(res, rawBody, buildInvalidDateResponse());
      return;
    }

    const toolLog = await prisma.toolLog.create({
      data: {
        restaurantId,
        channel: "voice",
        provider: "vapi",
        toolName: "get_opening_hours",
        externalCallId: args.callId,
        requestPayload: rawBody,
        status: "processing",
      },
    });

    try {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant) {
        await prisma.toolLog.update({
          where: { id: toolLog.id },
          data: { status: "failure", errorMessage: "Restaurant not found" },
        });
        sendVapiToolErrorResponse(res, rawBody, "Internal error while getting opening hours");
        return;
      }

      const timezone = resolveRestaurantTimezone(restaurant.timezone);
      const language = resolveLanguage(args.language, restaurant.defaultLanguage);

      if (restaurant.status !== "active") {
        const response = buildClosedReasonResponse("restaurant_inactive", timezone);
        await prisma.toolLog.update({
          where: { id: toolLog.id },
          data: { status: "success", responsePayload: { closedReason: "restaurant_inactive" } },
        });
        sendVapiToolResponse(res, rawBody, response);
        return;
      }

      const settings = await getOrCreateAvailabilitySettings(restaurantId);

      if (!settings.reservationsEnabled) {
        const response = buildClosedReasonResponse("reservations_disabled", timezone);
        await prisma.toolLog.update({
          where: { id: toolLog.id },
          data: { status: "success", responsePayload: { closedReason: "reservations_disabled" } },
        });
        sendVapiToolResponse(res, rawBody, response);
        return;
      }

      const openingHoursJson = settings.openingHoursJson;
      if (!isValidOpeningHoursJson(openingHoursJson) || !hasAnyConfiguredWindows(openingHoursJson)) {
        const response = buildNotConfiguredResponse(timezone);
        await prisma.toolLog.update({
          where: { id: toolLog.id },
          data: { status: "success", responsePayload: { configured: false } },
        });
        sendVapiToolResponse(res, rawBody, response);
        return;
      }

      const localDate = requestedDate ?? getNowPartsInTimezone(new Date(), timezone).localDate;
      // localDate is always a valid YYYY-MM-DD here (either passed through
      // validateRequestedDate or computed via Intl), so this cannot be null.
      const weekday = getWeekdayFromLocalDate(localDate)!;
      const windows = (openingHoursJson as OpeningHoursJson)[weekday] ?? [];

      const blackouts = await prisma.blackoutDate.findMany({
        where: { restaurantId, localDate, status: "active" },
      });
      const fullDayBlackout = blackouts.find((b) => b.isFullDay);
      const partialBlackout = !fullDayBlackout
        ? blackouts.find((b) => !b.isFullDay && b.startsAtLocal && b.endsAtLocal)
        : undefined;

      const response = buildOpeningHoursResponse({
        localDate,
        weekday,
        language,
        timezone,
        windows,
        // Weekly hours are only useful context when the caller didn't ask
        // about one specific date.
        includeWeeklyHours: !requestedDate,
        openingHoursJson: openingHoursJson as OpeningHoursJson,
        isFullDayBlackout: Boolean(fullDayBlackout),
        blackoutReason: fullDayBlackout?.reason ?? null,
        partialBlackout: partialBlackout
          ? { starts: partialBlackout.startsAtLocal!, ends: partialBlackout.endsAtLocal!, reason: partialBlackout.reason }
          : null,
      });

      await prisma.toolLog.update({
        where: { id: toolLog.id },
        data: { status: "success", responsePayload: { date: localDate, isOpen: response.is_open ?? null } },
      });

      sendVapiToolResponse(res, rawBody, response);
    } catch (error) {
      logger.error({ err: error, restaurantId, callId: args.callId }, "vapi get-opening-hours failed");

      await prisma.toolLog
        .update({
          where: { id: toolLog.id },
          data: { status: "failure", errorMessage: error instanceof Error ? error.message : "Unknown error" },
        })
        .catch(() => {
          // Logging the failure must never mask the original error response below.
        });

      sendVapiToolErrorResponse(res, rawBody, "Internal error while getting opening hours");
    }
  })
);

// POST /api/webhooks/vapi/:publicWebhookKey/log-call-summary
//
// Mirrors src/app/api/vapi/log-call-summary/route.ts's intent (best-effort
// end-of-call logging) but stores a safe, bounded IntegrationEvent instead of
// a full Supabase `calls` row, and never stores the raw payload or
// transcript — see AGENTS.md Phase 31 item 5 (privacy / data minimization).
// Never creates a Customer/ReservationRequest/Reservation (see AGENTS.md
// Phase 31 storage policy). The old Next.js/Supabase route is untouched and
// keeps serving the production Vapi assistant during this migration phase.
vapiWebhookRouter.post(
  "/:publicWebhookKey/log-call-summary",
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
    const args = extractCallSummaryArgs(allSources, rawBody);

    const missingFields = computeCallSummaryMissingFields(args);

    const toolLog = await prisma.toolLog.create({
      data: {
        restaurantId,
        channel: "voice",
        provider: "vapi",
        toolName: "log_call_summary",
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
      sendVapiToolResponse(res, rawBody, buildCallSummaryMissingFieldsResponse(missingFields));
      return;
    }

    try {
      const safePayload = buildSafeCallSummaryPayload(args);

      const event = await prisma.integrationEvent.create({
        data: {
          restaurantId,
          integrationId: connection.id,
          channel: "voice",
          provider: "vapi",
          eventType: "call_summary",
          status: "received",
          payload: safePayload as unknown as Prisma.InputJsonValue,
        },
      });

      await prisma.toolLog.update({
        where: { id: toolLog.id },
        data: { status: "success", responsePayload: { eventId: event.id, callId: args.callId } },
      });

      sendVapiToolResponse(res, rawBody, buildCallSummarySuccessResponse(args.callId, event.id));
    } catch (error) {
      logger.error({ err: error, restaurantId, callId: args.callId }, "vapi log-call-summary failed");

      await prisma.toolLog
        .update({
          where: { id: toolLog.id },
          data: { status: "failure", errorMessage: error instanceof Error ? error.message : "Unknown error" },
        })
        .catch(() => {
          // Logging the failure must never mask the original error response below.
        });

      sendVapiToolErrorResponse(res, rawBody, "Internal error while logging call summary");
    }
  })
);

// POST /api/webhooks/vapi/:publicWebhookKey/handoff-to-staff
//
// Phase 32 decision (docs/vapi-modify-cancel-handoff-decision-pack.md): stores
// the handoff intent as a safe, bounded IntegrationEvent — same storage
// pattern as Phase 31's log-call-summary — and never claims staff were
// actually notified, because no staff notification channel exists yet. Never
// creates/mutates a Customer, ReservationRequest, or Reservation. The old
// Next.js/Supabase route (insert-only into staff_handoffs, no notification
// either) and the legacy dispatcher's no-op handoff_to_staff case are both
// untouched and keep serving the production Vapi assistant during this
// migration phase.
vapiWebhookRouter.post(
  "/:publicWebhookKey/handoff-to-staff",
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
    const args = extractHandoffToStaffArgs(allSources, rawBody);

    const missingFields = computeHandoffToStaffMissingFields(args);

    const toolLog = await prisma.toolLog.create({
      data: {
        restaurantId,
        channel: "voice",
        provider: "vapi",
        toolName: "handoff_to_staff",
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
      sendVapiToolResponse(res, rawBody, buildHandoffToStaffMissingFieldsResponse(missingFields, args.language));
      return;
    }

    try {
      const safePayload = buildSafeHandoffToStaffPayload(args);

      const event = await prisma.integrationEvent.create({
        data: {
          restaurantId,
          integrationId: connection.id,
          channel: "voice",
          provider: "vapi",
          eventType: "handoff_to_staff",
          status: "received",
          payload: safePayload as unknown as Prisma.InputJsonValue,
        },
      });

      await prisma.toolLog.update({
        where: { id: toolLog.id },
        data: { status: "success", responsePayload: { eventId: event.id, callId: args.callId } },
      });

      sendVapiToolResponse(res, rawBody, buildHandoffToStaffSuccessResponse(event.id, args.language));
    } catch (error) {
      logger.error({ err: error, restaurantId, callId: args.callId }, "vapi handoff-to-staff failed");

      await prisma.toolLog
        .update({
          where: { id: toolLog.id },
          data: { status: "failure", errorMessage: error instanceof Error ? error.message : "Unknown error" },
        })
        .catch(() => {
          // Logging the failure must never mask the original error response below.
        });

      sendVapiToolErrorResponse(res, rawBody, "Internal error while logging handoff to staff");
    }
  })
);

// POST /api/webhooks/vapi/:publicWebhookKey/cancel-reservation-request
//
// Phase 34 decision (docs/vapi-modify-cancel-handoff-decision-pack.md Section
// 3B, refined per this phase's instructions): only an unambiguous *pending*
// ReservationRequest (status new/pending_info) is ever auto-cancelled, and
// only through the existing setReservationRequestStatus/isValidStatusTransition
// machinery — never a direct/bypassed status write. A confirmed Reservation
// is never directly cancelled by voice; it is always logged as an auditable
// cancellation intent for staff review. Ambiguous or no matches are also
// logged-only. Hard-delete is never performed. The old Next.js/Supabase
// route and the legacy dispatcher's hard-delete behavior are both untouched
// and keep serving the production Vapi assistant during this migration phase.
vapiWebhookRouter.post(
  "/:publicWebhookKey/cancel-reservation-request",
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
    const currentYear = new Date().getFullYear();
    const args = extractCancelReservationRequestArgs(allSources, rawBody, currentYear);

    const missingFields = computeCancelReservationRequestMissingFields(args);

    const toolLog = await prisma.toolLog.create({
      data: {
        restaurantId,
        channel: "voice",
        provider: "vapi",
        toolName: "cancel_reservation_request",
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
      sendVapiToolResponse(res, rawBody, buildCancelMissingFieldsResponse(missingFields, args.language));
      return;
    }

    try {
      let matchStatus: CancelMatchStatus;
      let actionTaken: CancelActionTaken;
      let cancelledRequestId: string | null = null;

      if (args.reservationRequestId) {
        // A. Explicit reservationRequestId — scoped lookup, never trust an id
        // from another tenant (findVapiReservationRequestById returns null
        // for both "not found" and "other tenant").
        const found = await findVapiReservationRequestById(restaurantId, args.reservationRequestId);
        if (!found) {
          matchStatus = "unmatched";
          actionTaken = "intent_logged";
        } else if (isCancellablePendingStatus(found.status)) {
          await setReservationRequestStatus(found.id, "cancelled");
          matchStatus = "exact";
          actionTaken = "pending_request_cancelled";
          cancelledRequestId = found.id;
        } else {
          // Already confirmed/rejected/cancelled/done — never force a status
          // change; log the intent for staff review instead.
          matchStatus = "confirmed_reservation_review_required";
          actionTaken = "review_required";
        }
      } else if (args.reservationId) {
        // C. Explicit reservationId — a confirmed Reservation is never
        // directly cancelled by voice in this phase, regardless of whether
        // it is found.
        const foundReservation = await findVapiReservationById(restaurantId, args.reservationId);
        matchStatus = foundReservation ? "confirmed_reservation_review_required" : "unmatched";
        actionTaken = foundReservation ? "review_required" : "intent_logged";
      } else if (args.normalizedPhone && args.date && args.time) {
        // B. No reservationRequestId — try an unambiguous phone+date+time
        // match against pending requests only. Zero or multiple candidates
        // must never mutate anything.
        const matchResult = await findUnambiguousPendingMatch(restaurantId, args.normalizedPhone, args.date, args.time);
        if (matchResult.status === "exact") {
          await setReservationRequestStatus(matchResult.request.id, "cancelled");
          matchStatus = "exact";
          actionTaken = "pending_request_cancelled";
          cancelledRequestId = matchResult.request.id;
        } else if (matchResult.status === "ambiguous") {
          matchStatus = "ambiguous";
          actionTaken = "intent_logged";
        } else {
          matchStatus = "unmatched";
          actionTaken = "intent_logged";
        }
      } else {
        // D. General fallback — not enough identifying detail to even
        // attempt a match (e.g. only a reason or callId was given).
        matchStatus = "unmatched";
        actionTaken = "intent_logged";
      }

      const safePayload = buildSafeCancelReservationRequestPayload(args, matchStatus, actionTaken);

      const event = await prisma.integrationEvent.create({
        data: {
          restaurantId,
          integrationId: connection.id,
          channel: "voice",
          provider: "vapi",
          eventType: "reservation_cancellation_requested",
          status: "received",
          payload: safePayload as unknown as Prisma.InputJsonValue,
        },
      });

      const response =
        actionTaken === "pending_request_cancelled" && cancelledRequestId
          ? buildPendingCancelledResponse(args.language, cancelledRequestId)
          : buildReviewRequiredResponse(args.language, event.id, matchStatus);

      await prisma.toolLog.update({
        where: { id: toolLog.id },
        data: {
          status: "success",
          responsePayload: {
            eventId: event.id,
            matchStatus,
            actionTaken,
            reservationRequestId: cancelledRequestId,
          },
        },
      });

      sendVapiToolResponse(res, rawBody, response);
    } catch (error) {
      logger.error({ err: error, restaurantId, callId: args.callId }, "vapi cancel-reservation-request failed");

      await prisma.toolLog
        .update({
          where: { id: toolLog.id },
          data: { status: "failure", errorMessage: error instanceof Error ? error.message : "Unknown error" },
        })
        .catch(() => {
          // Logging the failure must never mask the original error response below.
        });

      sendVapiToolErrorResponse(res, rawBody, "Internal error while cancelling reservation request");
    }
  })
);

// Scaffolded for a later phase — Phase 4 only implements create-reservation-request.
function notImplemented(req: Request, res: Response): void {
  res.status(501).json({ error: "Not implemented yet" });
}

vapiWebhookRouter.post("/:publicWebhookKey/modify-reservation-request", notImplemented);

export default vapiWebhookRouter;
