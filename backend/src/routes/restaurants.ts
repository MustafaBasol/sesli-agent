import express from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";

export const restaurantsRouter = express.Router();

// Demonstrates the full tenant-scoping chain other restaurant-scoped routes
// must follow: authenticate -> requireRestaurantContext -> requireRestaurantRole.
restaurantsRouter.get(
  "/:restaurantId/ping",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(["OWNER", "MANAGER", "STAFF"]),
  (req: RestaurantScopedRequest, res) => {
    res.json({ restaurantId: req.restaurantId, role: req.restaurantRole });
  }
);
