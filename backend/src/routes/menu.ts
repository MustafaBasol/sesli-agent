import { Prisma } from "@prisma/client";
import express, { type Response } from "express";
import { authenticate } from "../middleware/auth";
import { requireRestaurantRole } from "../middleware/authorize";
import { requireRestaurantContext, type RestaurantScopedRequest } from "../middleware/restaurantContext";
import {
  createMenuCategorySchema,
  createMenuItemSchema,
  listMenuCategoriesQuerySchema,
  listMenuItemsQuerySchema,
  updateMenuCategorySchema,
  updateMenuItemSchema,
} from "../schemas/menu";
import {
  CategoryNotInRestaurantError,
  createMenuCategory,
  createMenuItem,
  findMenuCategoryForRestaurant,
  findMenuItemForRestaurant,
  getMenuCategoryDetail,
  getMenuItemDetail,
  listMenuCategories,
  listMenuItems,
  updateMenuCategory,
  updateMenuItem,
} from "../services/menuService";
import { asyncHandler } from "../utils/asyncHandler";

export const menuRouter = express.Router();

const READ_ROLES = ["OWNER", "MANAGER", "STAFF"];
const MANAGE_ROLES = ["OWNER", "MANAGER"];

menuRouter.use(
  "/:restaurantId/menu",
  authenticate,
  requireRestaurantContext(),
  requireRestaurantRole(READ_ROLES)
);

// --- Categories -----------------------------------------------------------

menuRouter.get(
  "/:restaurantId/menu/categories",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = listMenuCategoriesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid query parameters", details: parsed.error.flatten() } });
      return;
    }

    const result = await listMenuCategories(req.restaurantId!, parsed.data);
    res.json(result);
  })
);

menuRouter.get(
  "/:restaurantId/menu/categories/:categoryId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const detail = await getMenuCategoryDetail(req.restaurantId!, req.params.categoryId);
    if (!detail) {
      res.status(404).json({ error: { message: "Menu category not found" } });
      return;
    }

    res.json(detail);
  })
);

menuRouter.post(
  "/:restaurantId/menu/categories",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = createMenuCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    try {
      const created = await createMenuCategory(req.restaurantId!, parsed.data);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.status(409).json({ error: { message: "A category with this name already exists" } });
        return;
      }
      throw err;
    }
  })
);

menuRouter.patch(
  "/:restaurantId/menu/categories/:categoryId",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = updateMenuCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const existing = await findMenuCategoryForRestaurant(req.restaurantId!, req.params.categoryId);
    if (!existing) {
      res.status(404).json({ error: { message: "Menu category not found" } });
      return;
    }

    try {
      const updated = await updateMenuCategory(req.restaurantId!, req.params.categoryId, parsed.data);
      res.json(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        res.status(409).json({ error: { message: "A category with this name already exists" } });
        return;
      }
      throw err;
    }
  })
);

// --- Items ------------------------------------------------------------

menuRouter.get(
  "/:restaurantId/menu/items",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = listMenuItemsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid query parameters", details: parsed.error.flatten() } });
      return;
    }

    const result = await listMenuItems(req.restaurantId!, parsed.data);
    res.json(result);
  })
);

menuRouter.get(
  "/:restaurantId/menu/items/:itemId",
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const detail = await getMenuItemDetail(req.restaurantId!, req.params.itemId);
    if (!detail) {
      res.status(404).json({ error: { message: "Menu item not found" } });
      return;
    }

    res.json(detail);
  })
);

menuRouter.post(
  "/:restaurantId/menu/items",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = createMenuItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    try {
      const created = await createMenuItem(req.restaurantId!, parsed.data);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof CategoryNotInRestaurantError) {
        res.status(400).json({ error: { message: err.message } });
        return;
      }
      throw err;
    }
  })
);

menuRouter.patch(
  "/:restaurantId/menu/items/:itemId",
  requireRestaurantRole(MANAGE_ROLES),
  asyncHandler<RestaurantScopedRequest>(async (req, res: Response) => {
    const parsed = updateMenuItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Invalid request body", details: parsed.error.flatten() } });
      return;
    }

    const existing = await findMenuItemForRestaurant(req.restaurantId!, req.params.itemId);
    if (!existing) {
      res.status(404).json({ error: { message: "Menu item not found" } });
      return;
    }

    try {
      const updated = await updateMenuItem(req.restaurantId!, req.params.itemId, parsed.data);
      res.json(updated);
    } catch (err) {
      if (err instanceof CategoryNotInRestaurantError) {
        res.status(400).json({ error: { message: err.message } });
        return;
      }
      throw err;
    }
  })
);
