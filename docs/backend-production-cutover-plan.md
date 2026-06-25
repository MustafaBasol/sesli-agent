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
    `/api/restaurants/:restaurantId/availability/blackouts*` (Phase 24),
    `/api/restaurants/:restaurantId/availability/slots` (Phase 25 — slot
    calculation service; none of these are wired into any Vapi route yet,
    see Section C)
  - `/api/webhooks/vapi/:publicWebhookKey/create-reservation-request`,
    `/api/webhooks/vapi/:publicWebhookKey/check-availability`,
    `/api/webhooks/vapi/:publicWebhookKey/get-customer-profile`,
    `/api/webhooks/vapi/:publicWebhookKey/create-customer-profile` (Phase 29),
    `/api/webhooks/vapi/:publicWebhookKey/get-current-date`,
    `/api/webhooks/vapi/:publicWebhookKey/get-opening-hours` (Phase 30),
    `/api/webhooks/vapi/:publicWebhookKey/log-call-summary` (Phase 31)
    (`modify-reservation-request`, `cancel-reservation-request`, and
    `handoff-to-staff` exist as routes but are still `notImplemented` — see
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
  `/api/webhooks/vapi/:publicWebhookKey/*`. `create-reservation-request`,
  (as of Phase 27) `check-availability`, (as of Phase 29)
  `get-customer-profile`/`create-customer-profile`, and (as of Phase 30)
  `get-current-date`/`get-opening-hours` are implemented today;
  `modify-reservation-request`, `cancel-reservation-request`, and
  `handoff-to-staff` exist as routes but return "not implemented"
  (`backend/src/routes/webhooks/vapi.ts`). The backend route set is **not
  feature-complete** relative to the Next.js routes and must not be treated
  as a drop-in replacement yet.
- As of Phase 28, `create-reservation-request` has been further **hardened**
  (camelCase/nested payload aliases, an availability hard-block pre-check, a
  best-effort idempotency guard, connection-status enforcement, and an
  additive-but-compatible response contract — see
  `docs/vapi-create-reservation-request-contract.md` and
  `docs/backend-vapi-webhook-parity-assessment.md` Section 11). This is
  still **hardening, not a cutover** — the live Vapi dashboard URL is
  unchanged and continues to serve `src/app/api/vapi/create-reservation-request/route.ts`.
- `check-availability` parity needs the `RestaurantSettings`/`BlackoutDate`
  models added in Phase 24 (`/api/restaurants/:restaurantId/availability/*`,
  `getRestaurantAvailabilityConfig` read helper in
  `backend/src/services/restaurantAvailabilityService.ts`) plus the slot
  calculation service added in Phase 25
  (`backend/src/services/availabilitySlotService.ts`,
  `GET /api/restaurants/:restaurantId/availability/slots`). Phase 27 added
  `POST /api/webhooks/vapi/:publicWebhookKey/check-availability`
  (`backend/src/utils/vapi/checkAvailabilityAdapter.ts` maps the slot
  service's result into a Vapi-compatible response) — the backend endpoint
  is ready for **controlled test calls only**. The live Vapi dashboard URL
  is **not** switched to it; see `docs/backend-vapi-webhook-parity-assessment.md`
  Section 10 for what was/wasn't carried over from the old route's response
  shape (notably: no `best_table_id`/`needs_approval` fields).
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

### Remaining blocker: modify / cancel / handoff (Phase 32 update)

- Phase 32 was documentation-only and resolved the **behavior decision** for
  `modify-reservation-request`, `cancel-reservation-request`, and
  `handoff-to-staff` — see `docs/vapi-modify-cancel-handoff-decision-pack.md`
  for the full decision pack and
  `docs/backend-vapi-webhook-parity-assessment.md` Section 15 for the status
  update. **No code was written.** The three backend routes still return
  `501 { error: "Not implemented yet" }` (`backend/src/routes/webhooks/vapi.ts`).
- Recommended implementation order (Phase 33+): `handoff-to-staff` first
  (`IntegrationEvent`, reusing the Phase 31 `log-call-summary` pattern, no
  staff-notification channel implied), then `cancel-reservation-request`
  (auto-cancel only unambiguous matches against *pending* requests via
  existing status-transition logic; everything else falls back to an
  audit-only row — never a hard delete), then
  `modify-reservation-request` (always an audit-only new request, never an
  auto-applied mutation, due to higher matching-ambiguity risk).
- **Explicitly restated: the Vapi dashboard cutover for these three tools
  remains not allowed.** This was already true before Phase 32 because the
  routes were unimplemented; it remains true after Phase 32 because the
  routes are still unimplemented — Phase 32 only removed the *decision*
  blocker, not the *implementation* blocker. Cutover additionally still
  requires the same real-payload parity comparison described earlier in
  this section for every other route.

### Remaining blocker: modify / cancel still unimplemented; handoff now built but no staff notification channel (Phase 33 update)

- A backend `handoff-to-staff` adapter now exists
  (`POST /api/webhooks/vapi/:publicWebhookKey/handoff-to-staff` in
  `backend/src/routes/webhooks/vapi.ts`), implementing the Phase 32 decision:
  it stores a bounded `IntegrationEvent` (`eventType: "handoff_to_staff"`)
  via the same `ToolLog` processing→success/failure pattern as every other
  Vapi adapter, and creates no `Customer`/`ReservationRequest`/`Reservation`
  row. See `docs/backend-vapi-webhook-parity-assessment.md` Section 16 and
  `docs/vapi-handoff-to-staff-contract.md` for the full contract.
- **No staff notification channel exists yet.** This route only logs an
  auditable handoff intent; it does not page, email, SMS, or otherwise alert
  any human. The response wording was deliberately written to avoid
  implying otherwise ("your request has been recorded for the restaurant
  team... they will follow up"), and this remains true after Phase 33 — a
  real notification channel is a separate, not-yet-scoped piece of work.
- `modify-reservation-request` and `cancel-reservation-request` are still
  `501 { error: "Not implemented yet" }` stubs — unchanged by Phase 33.
- **The Vapi dashboard cutover remains not allowed for any of the three
  tools.** `handoff-to-staff` now has backend code, but cutover additionally
  requires the same real-payload parity comparison described earlier in this
  section, plus a product decision on whether logging-only (no notification)
  is acceptable as the live behavior — that decision has not been made.
  `modify`/`cancel` remain blocked on implementation as before.

### Remaining blocker: modify still unimplemented; cancel now built but never auto-cancels a confirmed reservation (Phase 34 update)

- A backend `cancel-reservation-request` adapter now exists
  (`POST /api/webhooks/vapi/:publicWebhookKey/cancel-reservation-request` in
  `backend/src/routes/webhooks/vapi.ts`), implementing the Phase 32 decision
  (Section 3B) as refined this phase: it auto-cancels only an unambiguous
  **pending** `ReservationRequest` match (via the existing
  `setReservationRequestStatus`/`isValidStatusTransition` machinery) and
  logs everything else — a confirmed `Reservation`, a confirmed/terminal
  `ReservationRequest`, an ambiguous match, or no match — as a bounded
  `IntegrationEvent` (`eventType: "reservation_cancellation_requested"`)
  for staff review. See `docs/backend-vapi-webhook-parity-assessment.md`
  Section 17 and `docs/vapi-cancel-reservation-request-contract.md` for the
  full contract.
- **Confirmed reservations are never directly cancelled by voice in this
  phase.** The response wording for that case is "your cancellation request
  has been recorded for the restaurant team to review" — it never claims
  the reservation was actually cancelled.
- `modify-reservation-request` is still a `501 { error: "Not implemented
  yet" }` stub — unchanged by Phase 34, target Phase 35.
- **The Vapi dashboard cutover remains not allowed for any of the three
  tools.** `cancel-reservation-request` now has backend code, but cutover
  additionally requires the same real-payload parity comparison described
  earlier in this section. `modify` remains blocked on implementation.

### Remaining blocker: modify now built but never directly modifies a confirmed reservation (Phase 35 update)

- A backend `modify-reservation-request` adapter now exists
  (`POST /api/webhooks/vapi/:publicWebhookKey/modify-reservation-request` in
  `backend/src/routes/webhooks/vapi.ts`), implementing the Phase 32 decision
  (Section 3A): it never directly mutates a confirmed `Reservation` or an
  existing `ReservationRequest`'s date/time/party/status. Every outcome logs
  a bounded `IntegrationEvent`
  (`eventType: "reservation_modification_requested"`), and where an
  unambiguous pending target exists it additionally creates a second,
  separately-tracked `ReservationRequest` row with `requestType: "change"`
  for restaurant-team review. See
  `docs/backend-vapi-webhook-parity-assessment.md` Section 18 for the full
  contract.
- **Confirmed reservations are never directly modified by voice in this
  phase.** The response wording is always "your modification request has
  been recorded for the restaurant team to review" — it never claims the
  reservation was actually changed.
- This closes out the Phase 32 decision pack's modify/cancel/handoff trio —
  all three (`handoff-to-staff`, `cancel-reservation-request`,
  `modify-reservation-request`) now have backend implementations.
- **The Vapi dashboard cutover remains not performed for any of the three
  tools.** Each now has backend code, but cutover additionally requires the
  same real-payload parity comparison described earlier in this section.
  Remaining blockers for full Vapi backend parity beyond this trio: menu
  routes (still out of scope) and the legacy dispatcher cutover (a separate
  architectural decision, not bundled with this phase).

### Remaining blocker: menu routes deferred to a data-source decision, independent of every other tool (Phase 36 update)

- Phase 36 was documentation-only and resolved the **data-source decision**
  for `get-menu-info` and `get-item-details` — see
  `docs/vapi-menu-routes-decision-pack.md` for the full decision pack and
  `docs/backend-vapi-webhook-parity-assessment.md` Section 19 for the status
  update. **No code, schema, or migration was written.**
- Decision: defer real backend menu routes until dedicated
  `MenuCategory`/`MenuItem` Prisma models exist (recommended Phase 37:
  schema + admin/API foundation; Phase 38: Vapi menu adapters + Supabase
  data migration). Storing menu data in an existing `Json?` column was
  considered and explicitly rejected for this domain.
- **The Vapi dashboard cutover for `get-menu-info`/`get-item-details`
  remains not allowed** — both old per-tool routes
  (`src/app/api/vapi/get-menu-info`, `src/app/api/vapi/get-item-details`)
  were confirmed to be live, non-trivial, currently-serving tools (not dead
  code), so no backend equivalent exists yet to cut over to. This blocker
  is **independent of, and does not block,** cutover of every other
  already-implemented Vapi tool (`create-reservation-request`,
  `check-availability`, `get-customer-profile`/`create-customer-profile`,
  `get-current-date`/`get-opening-hours`, `log-call-summary`,
  `handoff-to-staff`, `cancel-reservation-request`,
  `modify-reservation-request`) — Vapi's per-tool dashboard configuration
  allows each tool's URL to be switched independently, so menu tools can
  keep pointing at the old Next.js routes indefinitely while every other
  tool proceeds through its own real-payload parity comparison and cutover
  on its own schedule.
- This is the last open item from `docs/backend-vapi-webhook-parity-assessment.md`
  Section 7's "Can defer" list (`get-menu-info`/`get-item-details`) — the
  legacy dispatcher cutover (assistant-request / end-of-call-report /
  tool-calls switch) remains the only other deferred item, and is explicitly
  a separate architectural decision not bundled with this phase or with the
  menu data-source decision above.

### Menu backend foundation exists, but Vapi menu cutover remains blocked (Phase 37 update)

- Phase 37 implemented the `MenuCategory`/`MenuItem` Prisma models,
  tenant-scoped CRUD routes/services, and a `/backend-admin/menu` beta UI —
  see `docs/backend-menu-foundation.md`. **A real backend menu data store
  now exists**, which did not before.
- **This does not lift the cutover blocker above.** No Vapi adapter
  (`get-menu-info`/`get-item-details`) was implemented against these models
  in Phase 37, and no Supabase `menu_items`/`menu_categories` data was
  migrated into them — the new tables start empty besides whatever an admin
  creates by hand through the new UI. Cutting Vapi traffic over to an empty
  or hand-entered backend menu before a real data migration would be a
  guest-facing regression, not a parity improvement.
- **The Vapi dashboard cutover for `get-menu-info`/`get-item-details`
  remains blocked** until the still-pending Phase 38 (Vapi menu adapters +
  Supabase → backend data migration) lands and passes the same
  real-payload parity comparison required of every other tool. As before,
  this is independent of, and does not block, cutover of any other
  already-implemented Vapi tool.

### Vapi menu adapters exist, but cutover still requires real data migration (Phase 38 update)

- Phase 38 implemented both backend Vapi menu adapters —
  `backend/src/utils/vapi/menuInfoAdapter.ts` /
  `backend/src/utils/vapi/itemDetailsAdapter.ts`, wired into
  `POST /api/webhooks/vapi/:publicWebhookKey/get-menu-info` and
  `.../get-item-details` in `backend/src/routes/webhooks/vapi.ts`. See
  `docs/backend-vapi-webhook-parity-assessment.md` Section 21 for the full
  behavior summary. **This is a real, tested adapter, not a placeholder** —
  covered by pure-adapter unit tests and a DB-backed integration test
  (`vapiMenu.integration.test.ts`).
- **This still does not lift the cutover blocker above.** No Supabase
  `menu_items`/`menu_categories` data was migrated as part of this phase —
  the backend menu tables only contain whatever a future migration or an
  admin enters by hand through `/backend-admin/menu`. Pointing the live Vapi
  assistant at this adapter today, before that migration, would mean guests
  hear an empty or incomplete menu instead of the real one — a regression,
  not a parity improvement.
- **The Vapi dashboard cutover for `get-menu-info`/`get-item-details`
  remains blocked** until a real Supabase → backend menu data migration
  (importing existing `menu_items`/`menu_categories` rows, assigning the
  single existing restaurant's `restaurantId`) has run and the adapter has
  passed the same real-payload parity comparison required of every other
  tool. No Vapi dashboard URL was changed by this phase. As before, this is
  independent of, and does not block, cutover of any other already-
  implemented Vapi tool.

### Menu data migration dry-run tool exists, but no data has actually been migrated (Phase 39 update)

- Phase 39 added a read-only menu data migration/import **dry-run** tool
  (`scripts/migration/menu-import-dry-run.ts`, see
  `docs/menu-data-migration-plan.md`). It reads local JSON exports of the
  old Supabase `menu_categories`/`menu_items` tables and reports proposed
  `MenuCategory`/`MenuItem` mappings, duplicates, invalid/missing prices,
  and orphan category references — it never connects to Supabase and
  **never writes to any database**. No Prisma schema/migration was added.
- **This does not lift the menu cutover blocker from the Phase 38 update
  above.** A dry-run report is a planning artifact, not migrated data — the
  backend menu tables remain exactly as populated by the Phase 37 admin UI
  (or empty) until a real write import actually runs. The Vapi dashboard
  cutover for `get-menu-info`/`get-item-details` remains blocked until a
  future Phase 40 write import (gated behind `MENU_IMPORT_WRITE_ENABLED` +
  a confirmed target restaurant id, neither implemented yet) populates the
  backend menu tables and the adapter passes the same real-payload parity
  comparison required of every other tool. No Vapi dashboard URL was
  changed by this phase.

### Menu data migration write mode exists (gated, test/staging only), but no real import has run yet (Phase 40 update)

- Phase 40 added a gated **write mode** to the Phase 39 dry-run tool — see
  `docs/menu-data-migration-plan.md` Section 9/11 for the full design. Write
  mode performs real Prisma writes to `MenuCategory`/`MenuItem` for the
  records the dry-run already reports, but only when four environment
  variables are all set together (`MENU_IMPORT_WRITE_ENABLED`,
  `MENU_IMPORT_RESTAURANT_ID`, a matching
  `MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID`, and `DATABASE_URL`); dry-run
  remains the default with none of them set.
- **This does not lift the menu cutover blocker from the Phase 38/39
  updates above.** Write mode is a tool capability, not a completed
  migration — no real Supabase export has been imported through it as of
  this update. The intended next step is to exercise write mode against a
  VPS/test database (target restaurant id and test database url to be
  supplied separately), not production.
- An additional production-only override pair
  (`MENU_IMPORT_ALLOW_PRODUCTION` + `MENU_IMPORT_PRODUCTION_CONFIRMATION`)
  exists in the gating logic as a **future safety mechanism only** — it is
  explicitly not exercised or recommended for this phase, and even with it
  set, write mode still never connects to Supabase, only to local export
  files and the backend's own database.
- No Prisma schema/migration was added — every field write mode needs
  already existed on `MenuCategory`/`MenuItem` from Phase 37. No Vapi
  dashboard URL was changed. No `src/app/api/vapi/*` file or old `/admin/*`
  page was touched.
- The Vapi dashboard cutover for `get-menu-info`/`get-item-details` remains
  blocked until a real write-mode import actually populates the target
  restaurant's backend menu tables (from a real reviewed export, with
  explicit production approval if ever targeting production) and the
  adapter passes the same real-payload parity comparison required of every
  other tool.

### Real menu export dry-run review workflow added (still no real import; Phase 41 update)

- Phase 41 prepared the Phase 39/40 dry-run tool for reviewing a **real** Supabase menu export —
  see `docs/menu-data-migration-plan.md` Section 2b/5b/5c for the full design. It adds a
  gitignored `scripts/migration/menu-input-real/` drop folder (only its `README.md` is
  committed), non-blocking data-quality warning thresholds, and an optional Markdown companion
  summary alongside the existing JSON report. No code change in this phase connects to Supabase,
  writes to any database, or enables write mode (`MENU_IMPORT_WRITE_ENABLED` remains unset by
  default, as before).
- **This does not lift the menu cutover blocker from the Phase 38/39/40 updates above.** Reviewing
  a real export's dry-run report — even a clean one with no errors or threshold warnings — is a
  precondition for considering a future write-mode run, not an approval to perform one or a
  substitute for it. No real data has been imported as of this update. No Vapi dashboard URL,
  Prisma schema/migration, `src/app/api/vapi/*` route, or old `/admin/*` page was touched by this
  phase.
- The Vapi dashboard cutover for `get-menu-info`/`get-item-details` remains blocked until a real
  write-mode import (Phase 40 mechanism, gated behind §11 of
  `docs/menu-data-migration-plan.md`) actually populates the target restaurant's backend menu
  tables and the adapter passes the same real-payload parity comparison required of every other
  tool.

### Test-database import and Vapi menu preview prepared, but not yet run (Phase 42 update)

- Phase 42 prepares (does not itself perform, since the authoring agent has no VPS/live-environment
  access) a real import of the Phase 41-reviewed real menu export into the **VPS/test database
  only** (`postgresql://.../sesliagent_test`), using the existing Phase 40 gated write-mode
  mechanism unchanged. No new write-path code was needed; the existing
  `MENU_IMPORT_WRITE_ENABLED` + `MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID` + `DATABASE_URL` gates
  (`docs/menu-data-migration-plan.md` §11) are sufficient.
- It adds one read-only helper, `scripts/migration/menu-test-db-preview.ts`
  (`npm run migration:menu:preview`), which prints `MenuCategory`/`MenuItem` counts and samples for
  `MENU_IMPORT_RESTAURANT_ID` from `DATABASE_URL` — never writes, updates, or deletes anything. See
  `docs/menu-data-migration-plan.md` Section 13 for the full design and the exact manual VPS
  command sequence.
- **No production DB, no live Supabase, and no Vapi dashboard URL were touched.** No code under
  `src/app/api/vapi/*` or `/admin/*` was modified. No Prisma schema/migration change was made.
- **Acceptance requires a human to actually run the prepared VPS commands** (dry-run, test-DB write
  import, idempotent re-run, the menu/Vapi-menu integration tests, `npm run test`/`typecheck`/
  `build`, and a webhook smoke check of `get-menu-info`/`get-item-details`) and report real PASS/FAIL
  output back — this update only documents what to run, not that it has been run.
- This does not lift the menu cutover blocker from the Phase 38–41 updates above. The Vapi dashboard
  cutover for `get-menu-info`/`get-item-details` remains blocked, and **Phase 43 must not start**
  until the Phase 42 verification report above is reviewed and accepted.

### Vapi dashboard cutover not performed (Phase 31)

- A backend `log-call-summary` adapter now exists (see
  `docs/backend-vapi-webhook-parity-assessment.md` Section 14 and
  `docs/vapi-call-summary-contract.md` for the full contract), but the live
  Vapi dashboard URL is **unchanged** and continues to serve
  `src/app/api/vapi/log-call-summary/route.ts`. The backend route stores a
  bounded `IntegrationEvent` row instead of a full Supabase `calls` upsert
  with a raw-payload dump — it intentionally never stores the raw payload or
  transcript, so it is **not** byte-compatible with the old route's storage
  behavior and must not be assumed drop-in-equivalent before a real Vapi
  payload/response comparison is done (same caveat as the other routes
  below).
- Rollback for this route, if ever cut over, is the same single-step
  dashboard URL revert described in Section F.

### Vapi dashboard cutover not performed (Phase 30)

- `get-current-date` and `get-opening-hours` backend adapters now exist (see
  `docs/backend-vapi-webhook-parity-assessment.md` Section 13 and
  `docs/vapi-date-opening-hours-contract.md` for the full contract), but the
  live Vapi dashboard URL is **unchanged** and continues to serve
  `src/app/api/vapi/get-current-date/route.ts` and
  `src/app/api/vapi/get-opening-hours/route.ts`. Both backend routes return a
  structured shape (`opening_periods`/`weekly_hours`, localized `day_of_week`)
  rather than the old routes' pre-formatted strings — these are *not*
  byte-compatible and must not be assumed drop-in-equivalent before a real
  Vapi payload/response comparison is done (same caveat as the other routes
  below).
- Rollback for these two routes, if ever cut over, is the same single-step
  dashboard URL revert described in Section F.

### Vapi dashboard cutover not performed (Phase 29)

- `get-customer-profile` and `create-customer-profile` backend adapters now
  exist (see `docs/backend-vapi-webhook-parity-assessment.md` Section 12 and
  `docs/vapi-customer-profile-contract.md` for the full contract), but the
  live Vapi dashboard URL is **unchanged** and continues to serve
  `src/app/api/vapi/get-customer-profile/route.ts` and
  `src/app/api/vapi/create-customer-profile/route.ts`. The backend routes
  are intentionally stricter (exact tenant-scoped phone/email match instead
  of a global fuzzy suffix scan, plus a new conflict response) — these are
  *not* byte-compatible with the old routes and must not be assumed
  drop-in-equivalent before a real Vapi payload/response comparison is done
  (same caveat as `check-availability`/`create-reservation-request` below).
- Rollback for these two routes, if ever cut over, is the same single-step
  dashboard URL revert described in Section F.

### Vapi dashboard cutover not performed (Phase 27)

- The existing Vapi dashboard URL remains pointed at the old Next.js
  `src/app/api/vapi/*` routes — this was not changed and is not in scope for
  Phase 27.
- The new `POST /api/webhooks/vapi/:publicWebhookKey/check-availability`
  backend endpoint is ready for controlled test calls only (manual `curl`/
  smoke-script calls, or a test Vapi assistant pointed at a non-production
  key) — it has not received live production Vapi traffic.
- Before switching the live Vapi dashboard's `check_availability` tool URL
  to this endpoint:
  1. Capture a real Vapi payload sample for `check_availability` from the
     live assistant config or call logs.
  2. Compare the old Next.js route's response for that payload against this
     backend route's response, field-by-field (see
     `docs/backend-vapi-webhook-parity-assessment.md` Section 4/10 for known
     intentional differences — no `best_table_id`/`needs_approval`).
  3. Run a controlled test assistant call against a staging Vapi assistant
     pointed at the new URL before touching the production assistant config.
  4. Decide and document the rollback URL (the old Next.js route) before
     flipping the dashboard setting, so a revert is a single config change.
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
