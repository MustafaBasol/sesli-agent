import pino from "pino";
import { env } from "../config/env";

// Redact anything that could carry credentials or tokens (docs/06: never log secrets).
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.apiKey",
      "*.accessToken",
      "*.access_token",
      "*.token",
      "*.password",
      "*.credentialsEncrypted",
      "*.webhookVerifyTokenHash",
    ],
    censor: "[redacted]",
  },
});
