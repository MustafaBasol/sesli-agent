import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

// Constant-time comparison prevents timing-based secret enumeration even under rate limiting.
function secretsMatch(expected: string, provided: string): boolean {
  const e = Buffer.from(expected);
  const p = Buffer.from(provided);
  return e.length === p.length && timingSafeEqual(e, p);
}

export function createVapiWebhookAuth(secret: string | undefined) {
  return function vapiWebhookAuth(req: Request, res: Response, next: NextFunction): void {
    if (!secret) {
      next();
      return;
    }
    const provided = req.headers["x-vapi-secret"];
    if (typeof provided !== "string" || !secretsMatch(secret, provided)) {
      res.status(401).json({ error: { message: "Unauthorized" } });
      return;
    }
    next();
  };
}

export const vapiWebhookAuth = createVapiWebhookAuth(env.VAPI_WEBHOOK_SECRET);
