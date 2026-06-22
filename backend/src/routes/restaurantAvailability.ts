import express, { type Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";
import {
  createBlackoutDateSchema,
  listBlackoutDatesQuerySchema,
  updateAvailabilitySettingsSchema,
  updateBlackoutDateSchema,
} from "../schemas/restaurantAvailability";
import {
  createBlackoutDate,
  deactivateBlackoutDate,
  findBlackoutDateForRestaurant,
  getAvailabilitySettings,
  getBlackoutDateDetail,
  listBlackoutDates,
  updateAvailabilitySettings,
  updateBlackoutDate,
} from "../services/restaurantAvailabilityService";
import { asyncHandler } from "../utils/asyncHandler";

export const restaurantAvailabilityRouter = express.Router();

const READ_ROLES = ["OWNER", "MANAGER", "STAFF"];
const MANAGE_ROLES = ["OWNER", "MANAGER"];

restaurantAvailabilityRouter.use(
  "/:restaurantId/availability",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(READ_ROLES)
);

restaurantAvailabilityRouter.get(
  "/:restaurantId/availability/settings",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const settings = await getAvailabilitySettings(req.restaurantId!);
    res.json(settings);
  })
);

restaurantAvailabilityRouter.patch(
  "/:restaurantId/availability/settings",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = updateAvailabilitySettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const updated = await updateAvailabilitySettings(req.restaurantId!, parsed.data);
    res.json(updated);
  })
);

restaurantAvailabilityRouter.get(
  "/:restaurantId/availability/blackouts",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = listBlackoutDatesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid query parameters", details: parsed.error.flatten() } });
      return;
    }

    const result = await listBlackoutDates(req.restaurantId!, parsed.data);
    res.json(result);
  })
);

restaurantAvailabilityRouter.get(
  "/:restaurantId/availability/blackouts/:blackoutId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const detail = await getBlackoutDateDetail(req.restaurantId!, req.params.blackoutId);
    if (!detail) {
      res.status(404).json({ error: { message: "Blackout date not found" } });
      return;
    }

    res.json(detail);
  })
);

restaurantAvailabilityRouter.post(
  "/:restaurantId/availability/blackouts",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = createBlackoutDateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const created = await createBlackoutDate(req.restaurantId!, parsed.data);
    res.status(201).json(created);
  })
);

restaurantAvailabilityRouter.patch(
  "/:restaurantId/availability/blackouts/:blackoutId",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = updateBlackoutDateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const existing = await findBlackoutDateForRestaurant(req.restaurantId!, req.params.blackoutId);
    if (!existing) {
      res.status(404).json({ error: { message: "Blackout date not found" } });
      return;
    }

    const updated = await updateBlackoutDate(req.restaurantId!, req.params.blackoutId, parsed.data);
    res.json(updated);
  })
);

// Soft deactivate only — see restaurantAvailabilityService.ts. Production
// safety/auditability over hard delete, consistent with status fields used
// elsewhere in this schema (Restaurant, RestaurantUser, Conversation, etc.).
restaurantAvailabilityRouter.delete(
  "/:restaurantId/availability/blackouts/:blackoutId",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const existing = await findBlackoutDateForRestaurant(req.restaurantId!, req.params.blackoutId);
    if (!existing) {
      res.status(404).json({ error: { message: "Blackout date not found" } });
      return;
    }

    const deactivated = await deactivateBlackoutDate(req.restaurantId!, req.params.blackoutId);
    res.json(deactivated);
  })
);
