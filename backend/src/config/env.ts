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

  return parsed.data;
}

export const env = loadEnv();
