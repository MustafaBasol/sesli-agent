import express, { type Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";
import { prisma } from "../prisma/client";
import { listReservationsQuerySchema, updateReservationSchema } from "../schemas/reservations";
import {
  findReservationForRestaurant,
  getReservationDetail,
  listReservations,
  updateReservation,
} from "../services/reservationService";
import { asyncHandler } from "../utils/asyncHandler";

export const reservationsRouter = express.Router();

const READ_ROLES = ["OWNER", "MANAGER", "STAFF"];
const MANAGE_ROLES = ["OWNER", "MANAGER"];

reservationsRouter.use(
  "/:restaurantId/reservations",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(READ_ROLES)
);

reservationsRouter.get(
  "/:restaurantId/reservations",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = listReservationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid query parameters", details: parsed.error.flatten() } });
      return;
    }

    const result = await listReservations(req.restaurantId!, parsed.data);
    res.json(result);
  })
);

reservationsRouter.get(
  "/:restaurantId/reservations/:reservationId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const detail = await getReservationDetail(req.restaurantId!, req.params.reservationId);
    if (!detail) {
      res.status(404).json({ error: { message: "Reservation not found" } });
      return;
    }

    res.json(detail);
  })
);

reservationsRouter.patch(
  "/:restaurantId/reservations/:reservationId",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = updateReservationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const existing = await findReservationForRestaurant(req.restaurantId!, req.params.reservationId);
    if (!existing) {
      res.status(404).json({ error: { message: "Reservation not found" } });
      return;
    }

    if (parsed.data.assignedTableId) {
      const table = await prisma.restaurantTable.findFirst({
        where: { id: parsed.data.assignedTableId, restaurantId: req.restaurantId! },
      });
      if (!table) {
        res.status(400).json({ error: { message: "Table does not belong to this restaurant" } });
        return;
      }
    }

    const updated = await updateReservation(req.restaurantId!, req.params.reservationId, parsed.data);
    res.json(updated);
  })
);
