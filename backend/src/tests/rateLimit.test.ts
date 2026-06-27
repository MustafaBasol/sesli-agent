/**
 * rateLimit.test.ts — confirms authRateLimiter and webhookRateLimiter
 * actually cap request volume (Phase 19 hardening). Pure in-process express
 * app, no database required, so this is wired into `npm test`.
 *
 * Run: npx tsx src/tests/rateLimit.test.ts
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { createApp } from "../app";
import { authRateLimiter, webhookRateLimiter } from "../middleware/rateLimit";
import { env } from "../config/env";

async function withServer(
  app: express.Express,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function main() {
  const authApp = express();
  authApp.get("/probe", authRateLimiter, (_req, res) => res.status(200).json({ ok: true }));

  await withServer(authApp, async (baseUrl) => {
    const statuses: number[] = [];
    for (let i = 0; i < env.AUTH_RATE_LIMIT_MAX + 1; i++) {
      const res = await fetch(`${baseUrl}/probe`);
      statuses.push(res.status);
    }
    const allowed = statuses.filter((s) => s === 200).length;
    const blocked = statuses.filter((s) => s === 429).length;
    assert.equal(allowed, env.AUTH_RATE_LIMIT_MAX, "exactly AUTH_RATE_LIMIT_MAX requests should be allowed");
    assert.equal(blocked, 1, "the request past the limit should be rejected with 429");
  });

  const webhookApp = express();
  webhookApp.get("/probe", webhookRateLimiter, (_req, res) => res.status(200).json({ ok: true }));

  await withServer(webhookApp, async (baseUrl) => {
    const statuses: number[] = [];
    for (let i = 0; i < env.WEBHOOK_RATE_LIMIT_MAX + 1; i++) {
      const res = await fetch(`${baseUrl}/probe`);
      statuses.push(res.status);
    }
    const allowed = statuses.filter((s) => s === 200).length;
    const blocked = statuses.filter((s) => s === 429).length;
    assert.equal(allowed, env.WEBHOOK_RATE_LIMIT_MAX, "exactly WEBHOOK_RATE_LIMIT_MAX requests should be allowed");
    assert.equal(blocked, 1, "the request past the limit should be rejected with 429");
  });

  // Verify createApp() sets trust proxy so X-Forwarded-For is honoured behind Traefik
  const prodApp = createApp();
  assert.equal(prodApp.get("trust proxy"), 1, "createApp() must set trust proxy to 1 for Traefik");

  console.log("rateLimit.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("rateLimit.test.ts failed:", err);
  process.exitCode = 1;
});
