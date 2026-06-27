/**
 * loggerMasking.test.ts — verifies maskSensitiveHeaders redacts Vapi secrets
 * and other credential headers while preserving safe debug fields.
 *
 * Run: npx tsx src/tests/loggerMasking.test.ts
 */
import assert from "node:assert/strict";
import type { IncomingHttpHeaders } from "node:http";
import { maskSensitiveHeaders } from "../utils/logger";

function main() {
  // --- sensitive headers must be redacted ---

  const sensitiveHeaders: IncomingHttpHeaders = {
    authorization: "Bearer eyJhbGc...",
    cookie: "session=abc123",
    "x-vapi-secret": "vapi-secret-value",
    "x-api-key": "sk-proj-abc",
    "x-auth-token": "some-auth-token",
    "x-access-token": "some-access-token",
    "x-secret": "my-secret",
    "client-secret": "client-secret-value",
    "proxy-authorization": "Basic abc==",
    "set-cookie": ["id=abc; Path=/"],
    "x-password": "hunter2",
    "x-credential": "cred-value",
    "api-key": "raw-api-key",
  };

  const redacted = maskSensitiveHeaders(sensitiveHeaders);

  for (const key of Object.keys(sensitiveHeaders)) {
    assert.equal(
      redacted[key],
      "[redacted]",
      `header '${key}' must be redacted`
    );
  }

  // --- safe debug headers must pass through unchanged ---

  const safeValue = "safe-value";
  const safeHeaders: IncomingHttpHeaders = {
    "user-agent": "Vapi/1.0 (+https://vapi.ai)",
    "x-call-id": "call-abc-123",
    "x-forwarded-for": "1.2.3.4, 10.0.0.1",
    "x-request-id": "req-uuid-456",
    host: "api.voice.autoviseo.com",
    "content-type": "application/json",
    accept: "application/json",
    "accept-encoding": "gzip, deflate, br",
    connection: "keep-alive",
    "content-length": "512",
  };

  const preserved = maskSensitiveHeaders(safeHeaders);

  for (const [key, value] of Object.entries(safeHeaders)) {
    assert.equal(
      preserved[key],
      value,
      `header '${key}' must be preserved`
    );
  }

  // --- empty headers map must return empty object ---
  const empty = maskSensitiveHeaders({});
  assert.deepEqual(empty, {}, "empty headers must return empty object");

  console.log("loggerMasking.test.ts: all checks passed");
}

main();
