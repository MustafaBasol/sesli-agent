import { Prisma } from "@prisma/client";
import express, { type Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";
import { createTableSchema, listTablesQuerySchema, updateTableSchema } from "../schemas/tables";
import { createTable, findTableForRestaurant, getTableDetail, listTables, updateTable } from "../services/tableService";
import { asyncHandler } from "../utils/asyncHandler";

export const tablesRouter = express.Router();

const READ_ROLES = ["OWNER", "MANAGER", "STAFF"];
const MANAGE_ROLES = ["OWNER", "MANAGER"];

tablesRouter.use(
  "/:restaurantId/tables",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(READ_ROLES)
);

tablesRouter.get(
  "/:restaurantId/tables",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = listTablesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid query parameters", details: parsed.error.flatten() } });
      return;
    }

    const result = await listTables(req.restaurantId!, parsed.data);
    res.json(result);
  })
);

tablesRouter.get(
  "/:restaurantId/tables/:tableId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const detail = await getTableDetail(req.restaurantId!, req.params.tableId);
    if (!detail) {
      res.status(404).json({ error: { message: "Table not found" } });
      return;
    }

    res.json(detail);
  })
);

tablesRouter.post(
  "/:restaurantId/tables",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = createTableSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    try {
      const created = await createTable(req.restaurantId!, parsed.data);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.status(409).json({ error: { message: "A table with this number already exists" } });
        return;
      }
      throw err;
    }
  })
);

tablesRouter.patch(
  "/:restaurantId/tables/:tableId",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = updateTableSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const existing = await findTableForRestaurant(req.restaurantId!, req.params.tableId);
    if (!existing) {
      res.status(404).json({ error: { message: "Table not found" } });
      return;
    }

    try {
      const updated = await updateTable(req.restaurantId!, req.params.tableId, parsed.data);
      res.json(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.status(409).json({ error: { message: "A table with this number already exists" } });
        return;
      }
      throw err;
    }
  })
);
