# Backend production cutover plan (Phase 20)

This document plans the move from the current Supabase/Vapi production admin
flow toward the backend-powered beta platform built in Phases 9–19. It does
**not** perform the cutover. See `AGENTS.md` for the non-negotiable rules
this plan respects (most importantly: do not break the Vapi flow, do not
remove the Supabase admin, do not switch the Vapi webhook URL here).

## A) Current state summary

- Production admin is Supabase-based, under `/[lang]/admin/*`, protected by
  `requireAdminSession`. Unchanged by this or any prior backend phase.
- Production Vapi tool/webhook routes are the existing Next.js routes under
  `src/app/api/vapi/*` (e.g. `create-reservation-request`, `webhook`).
  Unchanged.
- The Vapi dashboard's assistant currently points at these Next.js routes.
  Nothing in this plan changes that URL.
- A new backend beta admin lives under `/[lang]/backend-admin/*` (dashboard,
  reservation-requests, reservations, tables, customers, conversations,
  integrations, team, settings, availability). Gated by
  `NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA`; returns 404 when the flag is off.
- A new backend API (Node/Express + Prisma + PostgreSQL, `backend/`) serves:
  - `/api/health`
  - `/api/auth/login`, `/api/auth/me`
  - `/api/restaurants/:restaurantId/dashboard/*`
  - `/api/restaurants/:restaurantId/reservation-requests*`
  - `/api/restaurants/:restaurantId/reservations*`
  - `/api/restaurants/:restaurantId/tables*`
  - `/api/restaurants/:restaurantId/customers*`
  - `/api/restaurants/:restaurantId/conversations*`
  - `/api/restaurants/:restaurantId/integrations*`
  - `/api/restaurants/:restaurantId/team*`
  - `/api/restaurants/:restaurantId/settings`
  - `/api/restaurants/:restaurantId/availability/settings`,
    `/api/restaurants/:restaurantId/availability/blackouts*` (Phase 24 — not
    wired into any Vapi route yet, see Section C)
  - `/api/webhooks/vapi/:publicWebhookKey/create-reservation-request`
    (other webhook actions exist as routes but are `notImplemented` — see
    `backend/src/routes/webhooks/vapi.ts`)
- The two systems are fully independent today: separate databases
  (Supabase Postgres vs the backend's own PostgreSQL via Prisma), separate
  auth (Supabase admin session vs backend JWT), no shared writes.

## B) Target state options

### Option 1 — Parallel beta, no cutover yet

- `/admin` (Supabase) stays production for all real restaurant operations.
- `/backend-admin` stays available only behind the beta flag, used by
  selected internal testers against beta/seeded data (or a copy of
  production data once a migration phase exists — see Section D).
- Vapi dashboard continues pointing at `src/app/api/vapi/*`.
- No live customer-facing behavior changes. Lowest risk, recommended
  starting point and the option this phase assumes is currently active.

### Option 2 — Gradual backend admin cutover

- `/admin` remains active as a fallback the whole time.
- Backend admin is introduced to managers/owners first, screen by screen,
  in this order (least to most operationally risky):
  1. settings (read-mostly, low blast radius)
  2. tables
  3. team
  4. customers
  5. conversations (read-only today)
  6. integrations
  7. reservation requests
  8. reservations
- Each screen only "cuts over" once its backend equivalent has been used
  in parallel with the Supabase admin for a trial period and the two are
  observed to agree on the same underlying data (requires the data
  migration phase in Section D to be done first for any screen with real
  production data).
- Public Vapi webhooks are **not** switched during this option — call
  ingestion keeps flowing through the existing Next.js routes regardless
  of which admin UI staff use to view/manage the results.

### Option 3 — Future full backend cutover

- Backend admin becomes the primary day-to-day tool.
- `/admin` either remains as a documented fallback or is redirected to
  `/backend-admin` at a later, separately-planned phase.
- Vapi dashboard/webhook eventually points at
  `/api/webhooks/vapi/:publicWebhookKey/*` instead of
  `src/app/api/vapi/*` — only after the comparison work in Section E.
- Supabase becomes legacy/read-only, or is migrated into the backend's
  PostgreSQL, depending on the data strategy decided in Section D.

**Recommendation for the next phase**: stay on Option 1 until a data
migration phase (Section D) and a Vapi handler comparison (Section E) both
exist as separate, reviewed work. Only then start Option 2 screen by screen.

## C) Cutover prerequisites

Before starting *any* screen-by-screen cutover (Option 2) or planning the
full cutover (Option 3):

- [ ] VPS backup completed (full filesystem or at minimum app + env config).
- [ ] PostgreSQL backup completed (`pg_dump` of the backend's database).
- [ ] Frontend build passes (`npm run build` at repo root).
- [ ] Backend build passes (`npm run build` in `backend/`).
- [ ] Backend typecheck passes (`npm run typecheck` in `backend/`).
- [ ] Backend test suite passes (`npm run test` in `backend/`).
- [ ] Prisma migrations deployed to the target database
      (`npm run prisma:migrate:deploy` in `backend/`).
- [ ] Backend env validated against `docs/backend-env.md` (boot fails fast
      on missing `JWT_SECRET` / `CORS_ALLOWED_ORIGINS` in production — see
      `backend/src/config/env.ts`).
- [ ] `CORS_ALLOWED_ORIGINS` set to the real frontend origin(s).
- [ ] Rate limit env vars reviewed for expected traffic
      (`AUTH_RATE_LIMIT_*`, `WEBHOOK_RATE_LIMIT_*`).
- [ ] Seed behavior confirmed: `prisma:seed` not run against production
      unless `ALLOW_PROD_SEED=true` and `SEED_OWNER_PASSWORD` is explicitly
      set (enforced in `backend/src/prisma/seed.ts`).
- [ ] `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` generated, validated at boot,
      and backed up in a secrets manager (not in any doc, script, or repo).
- [ ] `NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA` behavior verified both `true`
      and `false` (see `docs/backend-beta-smoke-tests.md` section K).
- [ ] Rollback commands prepared and reviewed (Section F below).
- [ ] Smoke tests from `docs/backend-beta-smoke-tests.md` completed against
      the target environment.
- [ ] Selected testers identified (names/roles, not just "managers").

## D) Data strategy

- Current production data lives in Supabase, used exclusively by `/admin`.
- The backend's PostgreSQL database (via Prisma) has its own schema and,
  today, only contains data created through the backend seed script or
  through manual beta testing — it does **not** contain real production
  reservations, customers, or calls.
- The existing backend seed (`backend/src/prisma/seed.ts`) creates a
  Golden Meat demo/beta organization and owner account; it is not a
  representation of real production data and must not be confused with it.
- No automated or manual production data migration from Supabase to the
  backend's PostgreSQL has been performed.

**Data migration is a separate future phase.** Before any cutover beyond
Option 1, a dedicated phase must define: which Supabase tables map to which
Prisma models, how `restaurantId`/tenant scoping is assigned to historical
rows, how customer/reservation identifiers are reconciled, and how the
migration is validated for correctness (row counts, spot checks, dual-write
or backfill strategy). That phase is out of scope here.

## E) Vapi webhook strategy

- The existing production Vapi assistant dashboard currently points at the
  Next.js routes under `src/app/api/vapi/*` (`create-reservation-request`,
  `modify-reservation-request`, `cancel-reservation-request`,
  `handoff-to-staff`, `check-availability`, `get-current-date`,
  `get-customer-profile`, `create-customer-profile`, `get-item-details`,
  `get-menu-info`, `get-opening-hours`, `log-call-summary`, `webhook`).
- The backend exposes parallel routes under
  `/api/webhooks/vapi/:publicWebhookKey/*`. Only
  `create-reservation-request` is implemented today; `modify-reservation-request`,
  `cancel-reservation-request`, and `handoff-to-staff` exist as routes but
  return "not implemented" (`backend/src/routes/webhooks/vapi.ts`). The
  backend route set is **not feature-complete** relative to the Next.js
  routes and must not be treated as a drop-in replacement yet.
- `check-availability` parity specifically also needs the `RestaurantSettings`/
  `BlackoutDate` models added in Phase 24 (`/api/restaurants/:restaurantId/availability/*`,
  `getRestaurantAvailabilityConfig` read helper in
  `backend/src/services/restaurantAvailabilityService.ts`). These models and the
  helper exist now but are **not wired into any Vapi route** — actual slot
  calculation and a backend `check-availability` handler are still future work.
- The backend webhook authenticates the tenant via an unguessable
  `publicWebhookKey` path segment (`IntegrationConnection.publicWebhookKey`)
  plus a dedicated rate limiter, not via Vapi payload signature
  verification — this is documented as an accepted beta-stage limitation in
  `docs/backend-beta-hardening.md`.
- Before any Vapi dashboard URL change: complete the missing backend
  webhook actions, then run both the old and new handlers against the same
  representative Vapi payloads (recorded from real calls or Vapi's test
  console) and diff the resulting Supabase vs backend database writes for
  parity. This comparison work is not part of this phase.
- The Vapi dashboard URL itself is never touched in this phase, and must
  only be changed as a separate, explicitly reversible step once parity is
  proven.

## F) Rollback plan

If a screen-by-screen cutover (Option 2) or a full cutover (Option 3) needs
to be reversed:

- [ ] Frontend: `git revert`/redeploy to the previous commit (or redeploy
      the previously built artifact) so `/backend-admin` routes go back to
      their prior state (or back to 404 by flipping
      `NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA=false` and rebuilding — this is
      the fastest rollback and does not require a code revert).
- [ ] Backend: redeploy the previous commit/build of `backend/`.
- [ ] `/admin` (Supabase admin) is never modified by this migration, so it
      remains the functional fallback at every step — no action needed to
      "restore" it.
- [ ] Restore previous env values (`.env` files, secrets) from the backup
      taken in Section C.
- [ ] Restart backend and frontend services (see
      `docs/backend-beta-smoke-tests.md` sections C and I for the exact
      commands).
- [ ] Only restore the PostgreSQL backup if a migration was applied or
      production data was written since the backup — `prisma migrate
      deploy` is forward-only, so reverting code without reverting the
      schema can leave the database ahead of the code.
- [ ] Do not rotate or regenerate any `publicWebhookKey` / production
      webhook URL as part of a rollback unless that specific cutover step
      is what's being rolled back.
- [ ] If a Vapi dashboard URL cutover already happened and needs reverting,
      point the Vapi assistant back at the original `src/app/api/vapi/*`
      webhook URL — this is a dashboard-side change, not a code deploy, and
      should be the single fastest action if real calls are affected.

## G) Cutover checklist

Use this for any cutover step (a single screen in Option 2, or a full
cutover in Option 3):

- [ ] Prerequisites in Section C are all checked.
- [ ] Smoke test pack (`docs/backend-beta-smoke-tests.md`) passes end to end
      in the target environment.
- [ ] Backup taken immediately before the change (DB + env).
- [ ] Change deployed (env flag flip, or code/infra deploy).
- [ ] Health check passes post-deploy.
- [ ] Login works post-deploy.
- [ ] The specific screen(s) being cut over load and behave correctly with
      real (or migrated) data.
- [ ] `/admin` still loads and functions, unaffected.
- [ ] `/api/vapi/*` still builds/responds, unaffected.
- [ ] No sensitive fields found in representative API responses (see smoke
      test pack section F).
- [ ] Selected testers notified and asked to confirm.
- [ ] Rollback plan re-confirmed as ready (not just "exists").

## H) Go/no-go criteria

**Go** only if all of the following hold:

- All automated checks pass (backend typecheck/build/test, frontend
  typecheck/build).
- `/api/health` and frontend health checks pass.
- Backend login works for at least one real tester account.
- All key beta pages for the screens being cut over load without error.
- No sensitive fields (passwordHash, tokens, credentials, raw payloads,
  etc. — see smoke test pack section F) appear in representative API
  responses.
- A STAFF-role account cannot mutate endpoints restricted to
  OWNER/MANAGER (spot-check at least one restricted PATCH/POST).
- CORS rejects an unexpected origin; rate limiting returns 429 once a
  limit is exceeded in a controlled test.
- `/admin` (Supabase) fallback is still reachable and functional.
- No unresolved critical blockers from Section C or `docs/backend-beta-hardening.md`'s
  "Production cutover blockers" list apply to the specific screens/scope
  being cut over.

**No-go** if any of the above fails, if the data migration for the
affected screen (Section D) has not been completed and verified, or if the
Vapi webhook parity comparison (Section E) is incomplete and the change in
question touches Vapi-sourced data.
