# Backend environment variables

`backend/.env.example` is the tracked source of truth for local setup; this
file documents what each variable does and which ones are required in
production. See `backend/src/config/env.ts` for the validation that enforces
this at boot (`loadEnv()` throws on misconfiguration before the app starts).

## Core

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | no (default `development`) | `production` turns on the stricter checks below. |
| `PORT` | no (default `4000`) | |
| `PUBLIC_API_URL` | no | Used to build integration webhook URLs in API responses. |
| `PUBLIC_APP_URL` | no | |
| `LOG_LEVEL` | no (default `info`) | pino level. |
| `DATABASE_URL` | yes for any DB-backed route or Prisma command | App still boots and serves `/health` without it. |
| `REDIS_URL` | no | Reserved for the BullMQ worker phase, unused today. |

## Auth

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | **yes in production** | Falls back to an insecure dev-only value otherwise. Boot fails if unset and `NODE_ENV=production`. |
| `JWT_EXPIRES_IN` | no (default `8h`) | |
| `SEED_OWNER_PASSWORD` | **yes if seeding production** | See "Seeding" below. |
| `ALLOW_PROD_SEED` | **yes if seeding production** | `prisma:seed` refuses to run with `NODE_ENV=production` unless this is `true`. |

## Integration credential encryption

| Variable | Required | Notes |
|---|---|---|
| `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` | conditionally | 64 hex chars (32 bytes), generate with `openssl rand -hex 32`. Not required to boot, but if set it must be well-formed (boot fails otherwise). Without it, creating/updating an integration with credentials fails safely with a 503 — nothing is ever stored in plain text. |

## CORS

| Variable | Required | Notes |
|---|---|---|
| `CORS_ALLOWED_ORIGINS` | **yes in production** | Comma-separated list of allowed frontend origins, e.g. `https://app.example.com`. Boot fails if unset and `NODE_ENV=production`. Unset in development/test means "allow any origin" so local frontend dev needs no configuration. |

## Rate limiting

| Variable | Required | Notes |
|---|---|---|
| `AUTH_RATE_LIMIT_WINDOW_MS` | no (default `900000` / 15 min) | Applies to `POST /api/auth/login`. |
| `AUTH_RATE_LIMIT_MAX` | no (default `20`) | Requests per window per IP. |
| `WEBHOOK_RATE_LIMIT_WINDOW_MS` | no (default `60000` / 1 min) | Applies to all of `/api/webhooks/vapi/*`. |
| `WEBHOOK_RATE_LIMIT_MAX` | no (default `30`) | Requests per window per IP. |

These defaults are generous enough to not interfere with local development or
the integration test suite (the heaviest existing test makes 5 webhook
calls). Tune down for production once real traffic patterns are known.

## Frontend (documented in `docs/frontend-env.md`)

- `NEXT_PUBLIC_BACKEND_API_URL`
- `NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA`
- `NEXT_PUBLIC_ENABLE_BACKEND_TEST_PAGE`

## Never expose to the frontend

`JWT_SECRET`, `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY`, `DATABASE_URL`,
`SEED_OWNER_PASSWORD` — none of these may be prefixed `NEXT_PUBLIC_` or
referenced from any frontend code.
