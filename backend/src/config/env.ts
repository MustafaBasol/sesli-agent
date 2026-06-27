import "dotenv/config";
import { z } from "zod";

// Treat unset/empty env vars the same way, since `KEY=` in a .env file
// produces an empty string rather than undefined.
const optionalString = () =>
  z.preprocess((val) => (val === "" ? undefined : val), z.string().min(1).optional());

// The Express app itself only needs to boot and report health, so
// DATABASE_URL/REDIS_URL are validated when present (fail fast on
// misconfiguration) but stay optional here. Prisma commands (migrate, seed)
// and any future DB-backed route do require DATABASE_URL — see
// src/prisma/client.ts and docs/03.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_API_URL: z.preprocess((val) => (val === "" ? undefined : val), z.string().url().optional()),
  PUBLIC_APP_URL: z.preprocess((val) => (val === "" ? undefined : val), z.string().url().optional()),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: optionalString(),
  REDIS_URL: optionalString(),
  // Required in production; falls back to an insecure dev-only value so
  // `npm run dev` keeps working without a .env file. See docs/08.
  JWT_SECRET: optionalString(),
  JWT_EXPIRES_IN: z.string().min(1).default("8h"),
  // Used only by prisma:seed to set the seeded owner's password; never
  // read outside the seed script.
  SEED_OWNER_PASSWORD: optionalString(),
  // Required in production (see below); comma-separated list of allowed
  // origins for CORS. Unset in development means "allow any origin" so
  // local frontend dev keeps working without configuration.
  CORS_ALLOWED_ORIGINS: optionalString(),
  // Encrypts IntegrationConnection credentials at rest (src/utils/encryption.ts).
  // Optional here because the app boots fine without it; only storing
  // credentialed integrations requires it (and fails safely with a 503 if
  // missing). Format is still validated below when present, so a malformed
  // key is caught at boot instead of at first use.
  INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: optionalString(),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  WEBHOOK_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 1000),
  WEBHOOK_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  // Vapi sends this in every tool-call request as `x-vapi-secret`.
  // Required in production; optional in dev so `npm run dev` works without it.
  VAPI_WEBHOOK_SECRET: optionalString(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    // Intentionally avoid logging raw process.env: values may include secrets.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  if (parsed.data.NODE_ENV === "production" && !parsed.data.JWT_SECRET) {
    throw new Error("JWT_SECRET is required when NODE_ENV=production");
  }

  if (parsed.data.NODE_ENV === "production" && !parsed.data.CORS_ALLOWED_ORIGINS) {
    throw new Error(
      "CORS_ALLOWED_ORIGINS is required when NODE_ENV=production (comma-separated list of allowed origins)"
    );
  }

  if (parsed.data.NODE_ENV === "production" && !parsed.data.VAPI_WEBHOOK_SECRET) {
    throw new Error("VAPI_WEBHOOK_SECRET is required when NODE_ENV=production");
  }

  const encryptionKey = parsed.data.INTEGRATION_CREDENTIALS_ENCRYPTION_KEY;
  if (encryptionKey && !/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    throw new Error(
      "INTEGRATION_CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate one with: openssl rand -hex 32"
    );
  }

  return parsed.data;
}

export const env = loadEnv();

// Dev-only fallback so `npm run dev` works without a .env file. Production
// always supplies its own secret (enforced above) or loadEnv() throws.
export const jwtSecret = env.JWT_SECRET ?? "dev-only-insecure-jwt-secret-change-me";

// Parsed allow-list for cors(). Empty array in development means "reflect
// any origin" (see app.ts) so local frontend dev needs no configuration;
// production always has a non-empty list enforced above.
export const corsAllowedOrigins: string[] = (env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
