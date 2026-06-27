import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { createVapiWebhookAuth } from "../middleware/vapiWebhookAuth";

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes(): Response & { statusCode: number; body: unknown } {
  const res = { statusCode: 0, body: undefined } as unknown as Response & {
    statusCode: number;
    body: unknown;
  };
  (res as any).status = (code: number) => {
    (res as any).statusCode = code;
    return res;
  };
  (res as any).json = (body: unknown) => {
    (res as any).body = body;
    return res;
  };
  return res;
}

function makeNext(): { called: boolean; fn: NextFunction } {
  const state = { called: false, fn: (() => { state.called = true; }) as NextFunction };
  return state;
}

function main() {
  const SECRET = "test-vapi-webhook-secret-abc123";
  const auth = createVapiWebhookAuth(SECRET);

  // Missing x-vapi-secret → 401
  {
    const res = makeRes();
    const next = makeNext();
    auth(makeReq({}), res, next.fn);
    assert.equal((res as any).statusCode, 401, "missing header must return 401");
    assert.equal(next.called, false, "next must not be called when header is missing");
  }

  // Wrong value (same length) → 401
  {
    const wrong = SECRET.replace(/./g, "x");
    const res = makeRes();
    const next = makeNext();
    auth(makeReq({ "x-vapi-secret": wrong }), res, next.fn);
    assert.equal((res as any).statusCode, 401, "same-length wrong secret must return 401");
    assert.equal(next.called, false, "next must not be called on wrong secret");
  }

  // Wrong value (different length) → 401
  {
    const res = makeRes();
    const next = makeNext();
    auth(makeReq({ "x-vapi-secret": "short" }), res, next.fn);
    assert.equal((res as any).statusCode, 401, "different-length wrong secret must return 401");
    assert.equal(next.called, false, "next must not be called on length-mismatch secret");
  }

  // Correct value → next() called, no status set
  {
    const res = makeRes();
    const next = makeNext();
    auth(makeReq({ "x-vapi-secret": SECRET }), res, next.fn);
    assert.equal(next.called, true, "correct secret must call next()");
    assert.equal((res as any).statusCode, 0, "no response status must be set on success");
  }

  // No secret configured (dev mode) → next() called regardless of header
  {
    const authDev = createVapiWebhookAuth(undefined);
    const res = makeRes();
    const next = makeNext();
    authDev(makeReq({ "x-vapi-secret": "anything" }), res, next.fn);
    assert.equal(next.called, true, "unconfigured secret passes through in dev");
  }

  // No secret configured, no header → still passes through in dev
  {
    const authDev = createVapiWebhookAuth(undefined);
    const res = makeRes();
    const next = makeNext();
    authDev(makeReq({}), res, next.fn);
    assert.equal(next.called, true, "unconfigured secret with no header passes through in dev");
  }

  // Error response body must not echo the provided secret value
  {
    const leakCanary = "canary-secret-do-not-echo";
    const authCanary = createVapiWebhookAuth("expected-secret");
    const res = makeRes();
    const next = makeNext();
    authCanary(makeReq({ "x-vapi-secret": leakCanary }), res, next.fn);
    const bodyStr = JSON.stringify((res as any).body ?? "");
    assert.ok(
      !bodyStr.includes(leakCanary),
      "error response must not echo the provided secret value"
    );
  }

  console.log("vapiWebhookAuth.test.ts: all checks passed");
}

main();
