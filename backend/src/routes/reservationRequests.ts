import express, { type Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";
import {
  listReservationRequestsQuerySchema,
  rejectReservationRequestSchema,
  updateReservationRequestSchema,
  type ReservationRequestStatus,
} from "../schemas/reservationRequests";
import { isValidStatusTransition } from "../services/reservationRequestQuery";
import {
  findReservationRequestForRestaurant,
  getReservationRequestDetail,
  listReservationRequests,
  setReservationRequestStatus,
  updateReservationRequest,
} from "../services/reservationRequestService";
import { asyncHandler } from "../utils/asyncHandler";

export const reservationRequestsRouter = express.Router();

const MANAGE_ROLES = ["OWNER", "MANAGER", "STAFF"];

reservationRequestsRouter.use(
  "/:restaurantId/reservation-requests",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(MANAGE_ROLES)
);

reservationRequestsRouter.get(
  "/:restaurantId/reservation-requests",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = listReservationRequestsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid query parameters", details: parsed.error.flatten() } });
      return;
    }

    const result = await listReservationRequests(req.restaurantId!, parsed.data);
    res.json(result);
  })
);

const RAW_PAYLOAD_ROLES = ["OWNER", "MANAGER"];

reservationRequestsRouter.get(
  "/:restaurantId/reservation-requests/:requestId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const includeRawPayload =
      req.query.includeRawPayload === "true" && RAW_PAYLOAD_ROLES.includes(req.restaurantRole ?? "");

    const detail = await getReservationRequestDetail(req.restaurantId!, req.params.requestId, {
      includeRawPayload,
    });
    if (!detail) {
      res.status(404).json({ error: { message: "Reservation request not found" } });
      return;
    }

    res.json(detail);
  })
);

reservationRequestsRouter.patch(
  "/:restaurantId/reservation-requests/:requestId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = updateReservationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const existing = await findReservationRequestForRestaurant(req.restaurantId!, req.params.requestId);
    if (!existing) {
      res.status(404).json({ error: { message: "Reservation request not found" } });
      return;
    }

    if (parsed.data.status && !isValidStatusTransition(existing.status as ReservationRequestStatus, parsed.data.status)) {
      res.status(400).json({
        error: { message: `Cannot transition reservation request from "${existing.status}" to "${parsed.data.status}"` },
      });
      return;
    }

    const updated = await updateReservationRequest(req.restaurantId!, req.params.requestId, parsed.data);
    res.json(updated);
  })
);

reservationRequestsRouter.post(
  "/:restaurantId/reservation-requests/:requestId/confirm",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const existing = await findReservationRequestForRestaurant(req.restaurantId!, req.params.requestId);
    if (!existing) {
      res.status(404).json({ error: { message: "Reservation request not found" } });
      return;
    }

    if (!isValidStatusTransition(existing.status as ReservationRequestStatus, "confirmed")) {
      res.status(400).json({
        error: { message: `Cannot confirm a reservation request with status "${existing.status}"` },
      });
      return;
    }

    const updated = await setReservationRequestStatus(req.params.requestId, "confirmed");
    res.json(updated);
  })
);

reservationRequestsRouter.post(
  "/:restaurantId/reservation-requests/:requestId/reject",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = rejectReservationRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const existing = await findReservationRequestForRestaurant(req.restaurantId!, req.params.requestId);
    if (!existing) {
      res.status(404).json({ error: { message: "Reservation request not found" } });
      return;
    }

    if (!isValidStatusTransition(existing.status as ReservationRequestStatus, "rejected")) {
      res.status(400).json({
        error: { message: `Cannot reject a reservation request with status "${existing.status}"` },
      });
      return;
    }

    const updated = await setReservationRequestStatus(req.params.requestId, "rejected", parsed.data.reason);
    res.json(updated);
  })
);
