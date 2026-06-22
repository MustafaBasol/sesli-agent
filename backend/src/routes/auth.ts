import express, { type Response } from "express";
import { prisma } from "../prisma/client";
import { authRateLimiter } from "../middleware/rateLimit";
import { getAccessibleRestaurantIds } from "../services/restaurantAccess";
import { asyncHandler } from "../utils/asyncHandler";
import { signAuthToken } from "../utils/jwt";
import { verifyPassword } from "../utils/password";
import { authenticate, type AuthRequest } from "../middleware/auth";

export const authRouter = express.Router();

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: { message } });
}

authRouter.post("/login", authRateLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || !email.includes("@") || typeof password !== "string" || !password) {
    badRequest(res, "Valid email and password are required");
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-shape failure: invalid email and wrong password both 401 with
  // the same message, so the response can't be used to enumerate accounts.
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: { message: "Invalid email or password" } });
    return;
  }

  if (user.status !== "active") {
    res.status(403).json({ error: { message: "User account is inactive" } });
    return;
  }

  const token = signAuthToken({ sub: user.id });
  const accessibleRestaurantIds = await getAccessibleRestaurantIds({
    id: user.id,
    globalRole: user.globalRole,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      globalRole: user.globalRole,
    },
    accessibleRestaurantIds,
  });
}));

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: { message: "Authentication required" } });
      return;
    }

    const accessibleRestaurantIds = await getAccessibleRestaurantIds(req.user);
    res.json({ user: req.user, accessibleRestaurantIds });
  })
);
