import express, { type Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";
import { updateRestaurantSettingsSchema } from "../schemas/restaurantSettings";
import { getRestaurantSettings, updateRestaurantSettings } from "../services/restaurantSettingsService";
import { asyncHandler } from "../utils/asyncHandler";

export const restaurantSettingsRouter = express.Router();

// STAFF may view settings read-only; mutating restaurant profile/contact/
// localization fields is owner and manager territory, consistent with team.ts.
const READ_ROLES = ["OWNER", "MANAGER", "STAFF"];
const MANAGE_ROLES = ["OWNER", "MANAGER"];

restaurantSettingsRouter.use(
  "/:restaurantId/settings",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(READ_ROLES)
);

restaurantSettingsRouter.get(
  "/:restaurantId/settings",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const settings = await getRestaurantSettings(req.restaurantId!);
    if (!settings) {
      res.status(404).json({ error: { message: "Restaurant not found" } });
      return;
    }
    res.json(settings);
  })
);

restaurantSettingsRouter.patch(
  "/:restaurantId/settings",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = updateRestaurantSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const updated = await updateRestaurantSettings(req.restaurantId!, parsed.data);
    res.json(updated);
  })
);
