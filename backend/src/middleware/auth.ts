import type { NextFunction, Request, Response } from "express";
import { prisma } from "../prisma/client";
import { verifyAuthToken } from "../utils/jwt";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    globalRole: string | null;
  };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({ error: { message: "Missing bearer token" } });
    return;
  }

  try {
    const { sub } = verifyAuthToken(token);

    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, email: true, globalRole: true, status: true },
    });

    if (!user || user.status !== "active") {
      res.status(401).json({ error: { message: "User not found or inactive" } });
      return;
    }

    req.user = { id: user.id, email: user.email, globalRole: user.globalRole };
    next();
  } catch {
    res.status(401).json({ error: { message: "Invalid or expired token" } });
  }
}
