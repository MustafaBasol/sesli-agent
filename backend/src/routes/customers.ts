import { Prisma } from "@prisma/client";
import express, { type Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";
import { listCustomersQuerySchema, updateCustomerSchema } from "../schemas/customers";
import { findCustomerForRestaurant, getCustomerDetail, listCustomers, updateCustomer } from "../services/customerService";
import { asyncHandler } from "../utils/asyncHandler";

export const customersRouter = express.Router();

const MANAGE_ROLES = ["OWNER", "MANAGER", "STAFF"];

customersRouter.use(
  "/:restaurantId/customers",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(MANAGE_ROLES)
);

customersRouter.get(
  "/:restaurantId/customers",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = listCustomersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid query parameters", details: parsed.error.flatten() } });
      return;
    }

    const result = await listCustomers(req.restaurantId!, parsed.data);
    res.json(result);
  })
);

customersRouter.get(
  "/:restaurantId/customers/:customerId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const detail = await getCustomerDetail(req.restaurantId!, req.params.customerId);
    if (!detail) {
      res.status(404).json({ error: { message: "Customer not found" } });
      return;
    }

    res.json(detail);
  })
);

customersRouter.patch(
  "/:restaurantId/customers/:customerId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const existing = await findCustomerForRestaurant(req.restaurantId!, req.params.customerId);
    if (!existing) {
      res.status(404).json({ error: { message: "Customer not found" } });
      return;
    }

    try {
      const updated = await updateCustomer(req.restaurantId!, req.params.customerId, parsed.data);
      res.json(updated);
    } catch (err) {
      // phoneNumber recompute collides with @@unique([restaurantId, normalizedPhone]) on another customer.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.status(409).json({ error: { message: "Another customer with this phone number already exists" } });
        return;
      }
      throw err;
    }
  })
);
