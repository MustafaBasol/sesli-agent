import type { IncomingHttpHeaders } from "node:http";
import pino from "pino";
import { env } from "../config/env";

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
]);

// Matches any header whose name contains a secret/credential/token/key word.
const SENSITIVE_HEADER_PATTERN = /secret|token|password|credential|api[-_]?key/i;

export function maskSensitiveHeaders(
  headers: IncomingHttpHeaders
): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    out[k] =
      SENSITIVE_HEADER_NAMES.has(lower) || SENSITIVE_HEADER_PATTERN.test(lower)
        ? "[redacted]"
        : v;
  }
  return out;
}

// Redact anything that could carry credentials or tokens (docs/06: never log secrets).
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "req.headers['x-vapi-secret']",
      "*.apiKey",
      "*.accessToken",
      "*.access_token",
      "*.refreshToken",
      "*.refresh_token",
      "*.token",
      "*.password",
      "*.passwordHash",
      "*.secret",
      "*.clientSecret",
      "*.credentials",
      "*.credentialsEncrypted",
      "*.webhookVerifyToken",
      "*.webhookVerifyTokenHash",
      "*.rawPayload",
      "*.stateJson",
    ],
    censor: "[redacted]",
  },
});
