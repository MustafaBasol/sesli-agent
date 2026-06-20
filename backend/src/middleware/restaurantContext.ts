import type { NextFunction, Response } from "express";
import { validateRestaurantAccess } from "../services/restaurantAccess";
import { asyncHandler } from "../utils/asyncHandler";
import type { AuthRequest } from "./auth";

export interface RestaurantScopedRequest extends AuthRequest {
  restaurantId?: string;
  restaurantRole?: string;
}

/**
 * Resolves and verifies restaurant access for the current request.
 *
 * The restaurant id always comes from the route param, never from the JWT —
 * a default/last-used restaurant on the token must not be treated as
 * authorization (the lesson that broke this in the Dental CRM project).
 * Every request re-checks accessible restaurant ids against the database.
 */
export function requireRestaurantContext(paramName = "restaurantId") {
  return asyncHandler<RestaurantScopedRequest>(async (req, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: { message: "Authentication required" } });
      return;
    }

    const requestedId = req.params[paramName];
    const access = await validateRestaurantAccess(req.user, requestedId);
    if (!access) {
      res.status(403).json({ error: { message: "Access denied to requested restaurant" } });
      return;
    }

    req.restaurantId = access.restaurantId;
    req.restaurantRole = access.role;
    next();
  });
}
