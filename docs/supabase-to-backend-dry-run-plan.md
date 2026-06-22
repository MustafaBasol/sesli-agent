# Supabase → Backend Migration Dry-Run Plan (Phase 21)

This document defines how a future migration attempt should be *tested* before it ever touches
production data. It does not perform any migration itself. See
`docs/supabase-to-backend-migration-mapping.md` for the field-level mapping this plan validates.

Phase 23 added `docs/migration-policy.md` (the governing safety/timezone/raw-payload/reporting
policy) and a read-only local-file dry-run skeleton (`scripts/migration/`) that implements §10's
report format against local JSON fixtures only. That skeleton does not replace the staging/live
dry-run process described below, which still requires a real (non-production) Postgres/Supabase
staging environment.

No step in this document requires or assumes real Supabase credentials. Every command below is
illustrative and must be run against a staging copy, never against the production Supabase
project or production backend database.

## 1. Exporting Supabase data safely

- Use a **read replica or point-in-time export**, never a live connection that could be mistaken
  for a write path.
- Preferred method: `pg_dump` (schema + data) against a Supabase read-only/service-role connection
  string supplied via an environment variable, e.g. `SUPABASE_EXPORT_DATABASE_URL` — never hardcode
  the connection string in a script or doc.
- Store the dump outside the repository (e.g. `~/migration-exports/`), or in a path already covered
  by `.gitignore` if temporarily kept locally. Never commit a dump.
- Strip or hash phone numbers in any export that will be shared outside the immediate migration
  operator (e.g. for review or count-checking by a second person).
- Confirm export row counts per table immediately after export and record them (see §3).

## 2. Running migration against a staging/test backend DB

- Provision a separate Postgres database (e.g. `sesli_agent_migration_staging`), never the
  production backend database.
- Point `backend` at it via a staging `DATABASE_URL`, run `prisma migrate deploy` to get the target
  schema, then run `prisma db seed` (`backend/src/prisma/seed.ts`) to create the baseline
  Organization/Restaurant/owner/tables — this matches what already exists in production and lets
  the dry run validate against the *same* seeded baseline.
- Run the (future, not-yet-built) import script in dry-run mode only — see §7 — against this
  staging database.
- Never point a migration script at the production backend `DATABASE_URL` during a dry run.

## 3. Counting source vs target records

For each table/model pair in the mapping document, record:

| Old table | Old row count (export) | New model | New row count (staging, post-import) | Delta explained? |
|---|---|---|---|---|
| `customers` | — | `Customer` | — | should match 1:1 minus confirmed merges |
| `tables` | — | `RestaurantTable` | — | old count + 6 pre-seeded rows unless reconciled (§3.D of mapping doc) |
| `reservation_requests` | — | `ReservationRequest` | — | should match 1:1 |
| `reservation_requests` (status=confirmed) | — | `Reservation` | — | only if Reservation rows are derived per migration-order step 8 |
| `calls` | — | `Conversation` | — | only if calls are migrated (manual decision) |
| `tool_logs` | — | `ToolLog` | — | should match 1:1 |
| `reservation_changes` | — | `ReservationRequest` (requestType=change) or `IntegrationEvent` | — | depends on manual decision |
| `reservation_cancellations` | — | `ReservationRequest` (requestType=cancel) or `IntegrationEvent` | — | depends on manual decision |
| `staff_handoffs` | — | `IntegrationEvent` (or future `StaffHandoff`) | — | depends on manual decision |

Any delta that isn't explained by a documented transform (merge, dedup, skip-by-decision) must
block sign-off on the dry run.

## 4. Detecting duplicates

- **Customers**: group migrated `Customer` rows by `normalizedPhone` within a `restaurantId` —
  the unique constraint will already reject true duplicates at insert time, so the real risk is
  *silent data loss* from an upsert overwriting an earlier record. Before import, pre-group source
  rows by normalized phone and flag any group with >1 distinct `full_name` for manual review.
- **Tables**: compare migrated `tableNumber` values against the pre-seeded `1`–`6` set; flag any
  collision before deciding whether to merge by capacity/location or renumber.
- **Reservation requests**: no natural unique key exists in either schema; duplicate detection here
  means checking for accidental double-import (re-running the script) — key candidate:
  `(phoneNumber, reservationDate, reservationTime)` combination appearing more than once where the
  source table has only one matching row.

## 5. Verifying foreign key integrity

- Every migrated `Customer`/`RestaurantTable`/`ReservationRequest`/`Conversation`/`Message` row must
  resolve `restaurantId` to the single seeded Golden Meat restaurant — assert this with a query like
  `SELECT count(*) FROM customers WHERE restaurant_id != '<seeded-id>'` (expect 0).
- Every `ReservationRequest.customerId` (when set) must resolve to a `Customer.id` that exists in
  the same staging database — assert via a `LEFT JOIN` returning 0 orphans.
- Every `Message.conversationId` must resolve to an existing `Conversation.id`.
- Every `ToolLog.restaurantId` (if backfilled) must match the seeded restaurant id, not be left
  pointing at nothing or a stale id.

## 6. Verifying tenant scoping

- Confirm zero rows exist anywhere with a null/empty `restaurantId` except where the schema
  explicitly allows it (`ToolLog.restaurantId`, `IntegrationEvent.restaurantId` are nullable by
  design — every other migrated model requires it).
- Confirm no migrated row references a `restaurantId` other than the one seeded restaurant — this
  is a single-tenant migration; any other value indicates a bug in the import script, not a second
  legitimate tenant.
- Spot-check that backend API reads (e.g. `GET /restaurants/:id/customers`) scoped to the seeded
  restaurant id return the migrated rows, and that the same endpoint scoped to a different/fake
  restaurant id returns none.

## 7. Verifying no sensitive fields leaked

- Run the same sensitive-field leak check already used in the Phase 20 VPS smoke test pack
  (`docs/backend-beta-smoke-tests.md`) against staging API responses for migrated data — confirm no
  endpoint returns `credentialsEncrypted`, `webhookVerifyTokenHash`, or `passwordHash`.
- Confirm migrated `IntegrationConnection` rows (if any are created at all during migration, which
  per §3.I of the mapping doc should be none — credentials are re-entered manually, not migrated)
  never carry a plaintext credential in `configJson`.
- Grep the staging database logs and the migration script's own stdout/log output for phone numbers
  or raw payload content accidentally printed during the dry run; redact the script's logging if any
  is found before it is used again.

## 8. Comparing reservation/customer counts

- Compare total `Customer` count: staging post-import vs source export, accounting for any
  documented merges (§4).
- Compare total `ReservationRequest` count: staging post-import vs source export, accounting for
  any rows intentionally excluded (e.g. malformed dates that fail parsing — these must be logged,
  not silently dropped).
- Cross-check a small random sample (e.g. 10 customers, 10 reservations) by hand: same phone number,
  same name, same date/time, same status, before and after.

## 9. Rolling back staging

- Staging is disposable: rollback means dropping and recreating the staging database
  (`prisma migrate reset` or `DROP DATABASE` + re-create + `prisma migrate deploy` + reseed), not a
  reversible transaction log.
- Because this is a separate database from production, "rollback" here only protects the dry-run
  environment — it has no effect on and provides no rollback mechanism for a real future migration
  against production. A real migration's rollback strategy (e.g. keeping Supabase as a fallback,
  feature-flagged dual writes) is out of scope for this phase per the task instructions and is
  already partially covered in `docs/05_MIGRATION_FROM_SUPABASE.md` §"Rollback plan".

## 10. Producing a migration report

After a dry run, produce a short report (not committed to the repo if it contains any real
customer-derived numbers beyond aggregate counts) covering:

- source vs target row counts per table/model (§3);
- duplicates found and how they were resolved (§4);
- FK integrity check results (§5);
- tenant scoping check results (§6);
- sensitive-field leak check results (§7);
- sample record comparison results (§8);
- list of manual decisions from `docs/supabase-to-backend-migration-mapping.md` §4.D that were
  actually applied during this dry run, and how;
- a go/no-go recommendation for attempting the same process against production.

## Explicit non-goals of this phase

- No real Supabase export was performed.
- No real backend database was migrated.
- No credentials, tokens, or production customer data appear anywhere in this document or its
  companion mapping document.
