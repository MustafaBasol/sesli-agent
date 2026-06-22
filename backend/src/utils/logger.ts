import pino from "pino";
import { env } from "../config/env";

// Redact anything that could carry credentials or tokens (docs/06: never log secrets).
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
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
