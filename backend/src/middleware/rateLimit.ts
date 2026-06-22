import rateLimit from "express-rate-limit";
import { env } from "../config/env";

// Login is the one unauthenticated, credential-checking route in this API —
// the natural target for brute-force/credential-stuffing attempts.
export const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many login attempts. Please try again later." } },
});

// The Vapi webhook is publicly reachable (authenticated only by the
// publicWebhookKey path segment), so it needs its own limiter independent
// of any user session.
export const webhookRateLimiter = rateLimit({
  windowMs: env.WEBHOOK_RATE_LIMIT_WINDOW_MS,
  limit: env.WEBHOOK_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests. Please try again later." } },
});
