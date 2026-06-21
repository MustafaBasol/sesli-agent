import express, { type Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";
import { listConversationsQuerySchema } from "../schemas/conversations";
import { listMessagesQuerySchema } from "../schemas/messages";
import {
  findConversationForRestaurant,
  getConversationDetail,
  listConversations,
} from "../services/conversationService";
import { listMessagesForConversation } from "../services/messageService";
import { asyncHandler } from "../utils/asyncHandler";

export const conversationsRouter = express.Router();

const MANAGE_ROLES = ["OWNER", "MANAGER", "STAFF"];
const RAW_PAYLOAD_ROLES = ["OWNER", "MANAGER"];

conversationsRouter.use(
  "/:restaurantId/conversations",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(MANAGE_ROLES)
);

conversationsRouter.get(
  "/:restaurantId/conversations",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = listConversationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid query parameters", details: parsed.error.flatten() } });
      return;
    }

    const result = await listConversations(req.restaurantId!, parsed.data);
    res.json(result);
  })
);

conversationsRouter.get(
  "/:restaurantId/conversations/:conversationId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const detail = await getConversationDetail(req.restaurantId!, req.params.conversationId);
    if (!detail) {
      res.status(404).json({ error: { message: "Conversation not found" } });
      return;
    }

    res.json(detail);
  })
);

conversationsRouter.get(
  "/:restaurantId/conversations/:conversationId/messages",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = listMessagesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid query parameters", details: parsed.error.flatten() } });
      return;
    }

    const conversation = await findConversationForRestaurant(req.restaurantId!, req.params.conversationId);
    if (!conversation) {
      res.status(404).json({ error: { message: "Conversation not found" } });
      return;
    }

    const includeRawPayload =
      req.query.includeRawPayload === "true" && RAW_PAYLOAD_ROLES.includes(req.restaurantRole ?? "");

    const result = await listMessagesForConversation(req.restaurantId!, req.params.conversationId, parsed.data, {
      includeRawPayload,
    });
    res.json(result);
  })
);
