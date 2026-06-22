import express, { type Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";
import { addTeamMemberSchema, listTeamQuerySchema, updateTeamMemberSchema } from "../schemas/team";
import {
  TeamActionError,
  addTeamMember,
  getTeamMemberDetail,
  listTeamMembers,
  removeTeamMember,
  updateTeamMember,
} from "../services/teamService";
import { asyncHandler } from "../utils/asyncHandler";

export const teamRouter = express.Router();

// STAFF may view the team (read-only); mutating membership/roles is owner
// and manager territory, with further restrictions enforced in teamService.
const READ_ROLES = ["OWNER", "MANAGER", "STAFF"];
const MANAGE_ROLES = ["OWNER", "MANAGER"];

teamRouter.use(
  "/:restaurantId/team",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(READ_ROLES)
);

teamRouter.get(
  "/:restaurantId/team",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = listTeamQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid query parameters", details: parsed.error.flatten() } });
      return;
    }

    const result = await listTeamMembers(req.restaurantId!, parsed.data);
    res.json(result);
  })
);

teamRouter.get(
  "/:restaurantId/team/:userId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const detail = await getTeamMemberDetail(req.restaurantId!, req.params.userId);
    if (!detail) {
      res.status(404).json({ error: { message: "Team member not found" } });
      return;
    }

    res.json(detail);
  })
);

teamRouter.post(
  "/:restaurantId/team",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = addTeamMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    try {
      const created = await addTeamMember(req.restaurantId!, req.restaurantRole!, parsed.data);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof TeamActionError) {
        res.status(err.status).json({ error: { message: err.message } });
        return;
      }
      throw err;
    }
  })
);

teamRouter.patch(
  "/:restaurantId/team/:userId",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = updateTeamMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    try {
      const updated = await updateTeamMember(req.restaurantId!, req.restaurantRole!, req.params.userId, parsed.data);
      res.json(updated);
    } catch (err) {
      if (err instanceof TeamActionError) {
        res.status(err.status).json({ error: { message: err.message } });
        return;
      }
      throw err;
    }
  })
);

teamRouter.delete(
  "/:restaurantId/team/:userId",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    try {
      const removed = await removeTeamMember(req.restaurantId!, req.restaurantRole!, req.params.userId);
      res.json(removed);
    } catch (err) {
      if (err instanceof TeamActionError) {
        res.status(err.status).json({ error: { message: err.message } });
        return;
      }
      throw err;
    }
  })
);
