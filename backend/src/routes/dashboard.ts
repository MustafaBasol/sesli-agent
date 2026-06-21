import express, { type Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";
import { dashboardRecentQuerySchema } from "../schemas/dashboard";
import { getDashboardCounts, getDashboardRecent, getDashboardSummary } from "../services/dashboardService";
import { asyncHandler } from "../utils/asyncHandler";

export const dashboardRouter = express.Router();

const READ_ROLES = ["OWNER", "MANAGER", "STAFF"];

dashboardRouter.use(
  "/:restaurantId/dashboard",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(READ_ROLES)
);

dashboardRouter.get(
  "/:restaurantId/dashboard/summary",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const summary = await getDashboardSummary(req.restaurantId!);
    res.json(summary);
  })
);

dashboardRouter.get(
  "/:restaurantId/dashboard/recent",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = dashboardRecentQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid query parameters", details: parsed.error.flatten() } });
      return;
    }

    const recent = await getDashboardRecent(req.restaurantId!, parsed.data.limit);
    res.json(recent);
  })
);

dashboardRouter.get(
  "/:restaurantId/dashboard/counts",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const counts = await getDashboardCounts(req.restaurantId!);
    res.json(counts);
  })
);
