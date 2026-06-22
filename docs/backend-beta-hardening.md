# Backend admin beta — hardening audit (Phase 19)

Audit of the dedicated backend (Phases 1–18) for production-readiness risks,
without adding major new product features. See `AGENTS.md` for the overall
migration plan and non-negotiable rules this audit had to respect.

## What was audited

1. Backend auth and tenant isolation (JWT, restaurant context, role guards).
2. Sensitive field sanitization across all beta API responses.
3. Error response consistency.
4. Logging and redaction.
5. CORS and security headers.
6. Rate limiting.
7. Environment validation and docs.
8. Seed/test data safety.
9. Deployment readiness.
10. Frontend beta route guards.
11. This risk register.

## What was already solid (no changes needed)

The Phases 1–18 implementation turned out to already follow the hardest
lessons from the team's prior projects (the comments in the source
explicitly reference the Dental CRM project's incidents):

- **JWT carries only `sub`** (`backend/src/utils/jwt.ts`). Role and
  restaurant access are recomputed from the database on every request
  (`backend/src/services/restaurantAccess.ts`) — a stale or forged claim
  can't grant access the database doesn't back.
- **Restaurant id is never trusted from the token**, only from the route
  param, and is re-validated against the database on every request
  (`backend/src/middleware/restaurantContext.ts`).
- **Cross-tenant access is consistently blocked**: every `findXForRestaurant`
  service function scopes by `restaurantId` and returns `null` for both
  "doesn't exist" and "belongs to another tenant," so 404 responses can't be
  used to enumerate other tenants' data.
- **Inactive accounts/memberships are rejected**: `authenticate` checks
  `user.status === "active"`; `restaurantAccess.ts` only counts `active`
  `RestaurantUser` rows.
- **Role escalation is blocked**: `teamService.ts` prevents MANAGER from
  assigning the OWNER role, managing non-STAFF members, or removing the last
  active OWNER of a restaurant.
- **Sanitization allowlists already exist** for every sensitive resource:
  `teamService.ts`'s `SAFE_USER_SELECT` never selects `passwordHash`;
  `integrationService.ts`'s `toSummary`/`toDetail` never include
  `credentialsEncrypted` or `webhookVerifyTokenHash`; raw provider payloads
  (`includeRawPayload`) are opt-in and gated to OWNER/MANAGER in both
  `reservationRequests.ts` and `conversations.ts`.
- **Error responses are already consistent**: every route uses
  `{ error: { message, details? } }`, and the central `errorHandler`
  collapses any 5xx to a generic "Internal server error" message in all
  environments (no stack traces ever reach the client).
- **Frontend beta route guards are consistent**: every `backend-admin/*`
  page checks `NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA` and calls `notFound()`
  when disabled; none touch the Supabase admin session.
- **Existing production surfaces are untouched**: `/admin/*` (Supabase
  admin) and `/api/vapi/*` (production Vapi tool routes) were not modified.
  The new `/api/webhooks/vapi/*` backend route is a separate, additive
  endpoint for the migration, not a change to the existing one.

## Fixes applied this phase

| Area | Risk | Fix |
|---|---|---|
| CORS | `app.ts` used bare `cors()`, which reflects/allows any origin in every environment, including production. | Added `CORS_ALLOWED_ORIGINS` env var (comma-separated allow-list). Required when `NODE_ENV=production` (boot fails if missing); unset in dev/test still allows any origin so local frontend dev needs no config. See `backend/src/app.ts`, `backend/src/config/env.ts`. |
| Rate limiting | No rate limiting existed anywhere; `/api/auth/login` (credential checking) and `/api/webhooks/vapi/*` (public, key-authenticated) were both unprotected against brute force / flooding. | Added `express-rate-limit`-based limiters (`backend/src/middleware/rateLimit.ts`), applied to `POST /api/auth/login` and all of `/api/webhooks/vapi/*`. Window/max configurable via env, defaults generous enough not to affect tests or normal admin use. |
| Seed safety | `prisma:seed` would run unconditionally against any database it's pointed at, including production, creating a demo organization/owner with a hardcoded default password if `SEED_OWNER_PASSWORD` was unset. | `backend/src/prisma/seed.ts` now refuses to run with `NODE_ENV=production` unless `ALLOW_PROD_SEED=true`, and additionally requires `SEED_OWNER_PASSWORD` to be set explicitly in that case. |
| Logging redaction | Redact list covered the known credential/token fields but missed `passwordHash`, `rawPayload`, `stateJson`, and generic `secret`/`clientSecret`/`refreshToken` shapes, plus the `x-api-key` header. | Expanded `backend/src/utils/logger.ts` redact paths. |
| Env validation | `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` format was only checked lazily at first use (a typo would surface as a 503 on first integration-with-credentials call, not at boot). | `backend/src/config/env.ts` now validates the key's format (if set) at boot, failing fast like `JWT_SECRET`. |
| Docs | No single source documented backend env vars or production cutover blockers. | Added `docs/backend-env.md` and this file. |

## Intentionally left as beta, not production-hardened

- **Token storage**: the beta frontend stores the backend JWT in
  `localStorage` (`src/lib/backend-auth.ts`). This is explicitly documented
  there as a beta-only choice, not final production auth hardening (no
  httpOnly cookie, no CSRF concerns mitigated, vulnerable to XSS-based token
  theft). Acceptable for an internal beta behind a feature flag; must be
  revisited (httpOnly cookie + refresh token rotation) before this becomes
  the only login path.
- **Rate limiting store**: `express-rate-limit`'s default in-memory store is
  per-process. Fine for the single-VPS, single-instance first deployment
  (AGENTS.md's stated first-delivery scope); revisit with a shared store
  (Redis) if the backend is ever scaled to multiple instances.
- **No CSRF protection**: not needed yet because the beta uses a bearer
  token in an `Authorization` header (not cookies), which is inherently not
  CSRF-vulnerable. Revisit if auth moves to cookies.
- **Webhook signature verification**: the Vapi webhook is authenticated by
  the unguessable `publicWebhookKey` path segment plus per-tenant rate
  limiting, not by verifying a provider signature header. Acceptable for the
  current Vapi integration design (mirrors the existing Next.js/Supabase
  Vapi routes); revisit if/when other providers (WhatsApp, Instagram, SMS)
  are added with signature-based webhook auth available.
- **Full error-response normalization**: response shapes are consistent
  across all reviewed routes; no further normalization was needed this
  phase.

## Production cutover blockers (not fixed in this phase, by design — see AGENTS.md "do not implement new major features")

- Auth token storage strategy (see above) should move off `localStorage`
  before this is the only admin login path.
- HTTPS-only deployment must be enforced at the reverse proxy (Traefik per
  AGENTS.md's target architecture); the app itself does not redirect HTTP→HTTPS.
- `CORS_ALLOWED_ORIGINS` must be set to the real production frontend
  origin(s) before deploy — boot now fails without it, which is intentional.
- DB backup/restore plan is not yet documented/automated.
- Monitoring and log retention for the pino/pino-http output is not yet wired
  to any aggregator.
- Migration rollback plan (`prisma migrate deploy` is forward-only by
  design) is not yet documented.
- Public Vapi webhook cutover plan (switching the live Vapi assistant from
  the Next.js/Supabase route to `/api/webhooks/vapi/*`) is a separate,
  later decision — not part of this phase.
- Supabase-to-backend data migration for existing production data is not
  started.

## Manual smoke test checklist

With backend + Postgres + frontend running and
`NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA=true`:

1. `GET /api/health` returns 200.
2. Backend login works with the seeded owner.
3. `/en/backend-admin` opens and shows the dashboard after login.
4. `/en/backend-admin/reservation-requests` opens.
5. `/en/backend-admin/reservations` opens.
6. `/en/backend-admin/tables` opens.
7. `/en/backend-admin/customers` opens.
8. `/en/backend-admin/conversations` opens.
9. `/en/backend-admin/integrations` opens.
10. `/en/backend-admin/team` opens.
11. `/en/backend-admin/settings` opens.
12. Existing `/en/admin/dashboard` (Supabase admin) still opens.
13. Existing `/api/vapi/*` routes still build/respond.
14. With `NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA=false`, every backend-admin
    page returns 404.
15. Inspect representative API responses (login, team, integrations,
    reservation-requests detail) and confirm none contain `passwordHash`,
    `credentialsEncrypted`, `webhookVerifyTokenHash`, raw provider payloads
    (unless explicitly requested by an OWNER/MANAGER), or stack traces.
16. Confirm `CORS_ALLOWED_ORIGINS` is set to the real frontend origin in the
    production `.env`, and that a request from a different origin is
    rejected by the browser.
17. Confirm 21 rapid requests to `/api/auth/login` return a 429 on the 21st
    (or the configured `AUTH_RATE_LIMIT_MAX` + 1).

## Known risks (accepted for this phase)

- Single-instance, single-VPS deployment has no redundancy — acceptable per
  AGENTS.md's explicit first-delivery scope ("one restaurant, one
  deployment, one VPS, one database").
- No automated dependency vulnerability scanning is wired into CI yet.
- `express-rate-limit`'s in-memory store resets on process restart — a
  restart briefly resets attempt counters.

## Tests / checks run

- `npm run typecheck` (backend) — pass
- `npm run build` (backend) — pass
- `npm run test` (backend, includes new `test:rate-limit`) — pass, all green
- `npm run test:vapi-webhook-integration` — skipped (no `DATABASE_URL`
  configured in this environment); other `*-integration.test.ts` files were
  not run for the same reason — no DB-touching code changed this phase
  besides the (DB-independent) rate limiter and seed guard, both covered by
  unit-style tests above
- `npx eslint` on all changed/new backend files — clean (one pre-existing,
  unrelated lint issue in `dashboard.integration.test.ts` was left as-is,
  not introduced by this phase)
- `npx tsc --noEmit` (frontend) — pass
- `npm run build` (frontend) — pass; confirmed `/admin/*`, `/api/vapi/*`,
  and all `/backend-admin/*` routes are present in the build output
