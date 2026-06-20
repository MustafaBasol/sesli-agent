import type { NextFunction, Response } from "express";
import { PLATFORM_ADMIN } from "../services/restaurantAccess";
import type { RestaurantScopedRequest } from "./restaurantContext";

/**
 * Gates a route by the role resolved for the restaurant in scope. Must run
 * after requireRestaurantContext(). PLATFORM_ADMIN always passes.
 */
export function requireRestaurantRole(roles: string[]) {
  return (req: RestaurantScopedRequest, res: Response, next: NextFunction): void => {
    const role = req.restaurantRole;
    if (!role || (role !== PLATFORM_ADMIN && !roles.includes(role))) {
      res.status(403).json({ error: { message: "Insufficient permissions" } });
      return;
    }
    next();
  };
}

/**
 * Gates a route by the user's global role (e.g. platform-admin-only routes
 * that are not restaurant-scoped at all).
 */
export function requireGlobalRole(roles: string[]) {
  return (req: RestaurantScopedRequest, res: Response, next: NextFunction): void => {
    if (!req.user?.globalRole || !roles.includes(req.user.globalRole)) {
      res.status(403).json({ error: { message: "Insufficient permissions" } });
      return;
    }
    next();
  };
}
