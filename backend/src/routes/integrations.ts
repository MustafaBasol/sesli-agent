import express, { type Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";
import { createIntegrationSchema, updateIntegrationSchema } from "../schemas/integrations";
import {
  createIntegration,
  findIntegrationForRestaurant,
  getIntegrationDetail,
  listIntegrations,
  rotateWebhookKey,
  setIntegrationActive,
  testIntegrationStub,
  updateIntegration,
} from "../services/integrationService";
import { asyncHandler } from "../utils/asyncHandler";

export const integrationsRouter = express.Router();

// STAFF can read/manage reservations and customers, but credentials and
// webhook keys are owner/manager territory (docs/06_SECURITY_AND_TENANCY_RULES.md).
const MANAGE_ROLES = ["OWNER", "MANAGER"];

integrationsRouter.use(
  "/:restaurantId/integrations",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(MANAGE_ROLES)
);

integrationsRouter.get(
  "/:restaurantId/integrations",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const data = await listIntegrations(req.restaurantId!);
    res.json({ data });
  })
);

integrationsRouter.get(
  "/:restaurantId/integrations/:integrationId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const detail = await getIntegrationDetail(req.restaurantId!, req.params.integrationId);
    if (!detail) {
      res.status(404).json({ error: { message: "Integration not found" } });
      return;
    }
    res.json(detail);
  })
);

integrationsRouter.post(
  "/:restaurantId/integrations",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = createIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const created = await createIntegration(req.restaurantId!, parsed.data);
    res.status(201).json(created);
  })
);

integrationsRouter.patch(
  "/:restaurantId/integrations/:integrationId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = updateIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const existing = await findIntegrationForRestaurant(req.restaurantId!, req.params.integrationId);
    if (!existing) {
      res.status(404).json({ error: { message: "Integration not found" } });
      return;
    }

    const updated = await updateIntegration(req.restaurantId!, req.params.integrationId, parsed.data);
    res.json(updated);
  })
);

integrationsRouter.post(
  "/:restaurantId/integrations/:integrationId/rotate-webhook-key",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const existing = await findIntegrationForRestaurant(req.restaurantId!, req.params.integrationId);
    if (!existing) {
      res.status(404).json({ error: { message: "Integration not found" } });
      return;
    }

    const updated = await rotateWebhookKey(req.restaurantId!, req.params.integrationId);
    res.json(updated);
  })
);

integrationsRouter.post(
  "/:restaurantId/integrations/:integrationId/enable",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const existing = await findIntegrationForRestaurant(req.restaurantId!, req.params.integrationId);
    if (!existing) {
      res.status(404).json({ error: { message: "Integration not found" } });
      return;
    }

    const updated = await setIntegrationActive(req.restaurantId!, req.params.integrationId, true);
    res.json(updated);
  })
);

integrationsRouter.post(
  "/:restaurantId/integrations/:integrationId/disable",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const existing = await findIntegrationForRestaurant(req.restaurantId!, req.params.integrationId);
    if (!existing) {
      res.status(404).json({ error: { message: "Integration not found" } });
      return;
    }

    const updated = await setIntegrationActive(req.restaurantId!, req.params.integrationId, false);
    res.json(updated);
  })
);

integrationsRouter.post(
  "/:restaurantId/integrations/:integrationId/test",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const result = await testIntegrationStub(req.restaurantId!, req.params.integrationId);
    if (!result) {
      res.status(404).json({ error: { message: "Integration not found" } });
      return;
    }
    res.json(result);
  })
);
