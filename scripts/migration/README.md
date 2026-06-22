# Supabase → Backend Migration Tooling

## Status: dry-run skeleton only (Phase 23)

Phase 21 was assessment/planning only (no script). Phase 22 closed open schema/policy gaps. This
phase (23) adds a **read-only, non-destructive dry-run skeleton**. There is still no real migration
script, no Supabase connection, and no write path.

See:

- `docs/migration-policy.md` — the governing policy this script implements (safety, timezone, raw
  payload, duplicate handling, reporting rules).
- `docs/migration-gap-closure-decision-pack.md` — the Phase 22 decisions this policy is based on.
- `docs/supabase-to-backend-migration-mapping.md` — field-level mapping (Phase 21).
- `docs/supabase-to-backend-dry-run-plan.md` — the broader staging/live dry-run plan this script's
  local-file mode is a first, safe step toward.

## What this script does

`supabase-to-backend-dry-run.ts`:

- reads local JSON export files from a directory (`MIGRATION_SOURCE_DIR`);
- never connects to Supabase;
- never writes to any database;
- never prints raw payload bodies (counts/flags only — see `docs/migration-policy.md` §F);
- produces a JSON migration report to stdout (and optionally to `MIGRATION_OUTPUT_DIR`, which is
  gitignored).

If `MIGRATION_SOURCE_DIR` is not set or the directory does not exist, it prints usage and exits
without doing anything.

## Supported input files

Place these (optional — missing ones are reported as skipped, not an error) inside the directory
pointed to by `MIGRATION_SOURCE_DIR`:

- `customers.json`
- `tables.json`
- `reservation_requests.json`
- `reservations.json`
- `calls.json`
- `tool_logs.json`
- `staff_handoffs.json`
- `restaurant_settings.json`

`menu_items.json`, `menu_categories.json`, `orders.json`, `blackout_dates.json`, and
`restaurant_rules.json` are recognized as **deferred** (per `docs/migration-policy.md` §G) — if
present, they are flagged in the report's warnings but never parsed for import.

## Running it

`MIGRATION_SOURCE_DIR` is required — there is no default, by design (running with no input should
never silently do something unexpected). Without it, the script prints usage and exits.

```sh
# bash/macOS/Linux
MIGRATION_SOURCE_DIR=./scripts/migration/sample-input npm run migration:dry-run

# PowerShell
$env:MIGRATION_SOURCE_DIR = "./scripts/migration/sample-input"; npm run migration:dry-run
```

`scripts/migration/sample-input/` contains only fake fixture data (see that directory's own
README — none of it is real data). To point at a different local export directory, set
`MIGRATION_SOURCE_DIR` to that path instead.

Never point this at a live Supabase connection string — it has no code path that would use one.

## Helpers

`helpers.ts` contains the pure normalization/classification functions used by the dry-run script:
`normalizePhone`, `normalizeEmail`, `parseSourceDate`, `parseSourceTime`,
`detectSensitiveFieldNames`, `safeCountRawPayloadPresence`, `classifyReservationStatus`. These have
no I/O and are covered by `supabase-to-backend-dry-run.test.ts`.

## What is still not built

- No real Supabase export/connection logic.
- No write path (`MIGRATION_WRITE_ENABLED=true` has no effect — see `docs/migration-policy.md` §I).
- No `reservation_changes`/`reservation_cancellations` parsing (deferred per Phase 22 decisions,
  not yet assigned a report shape).
- No staging-database integration (`docs/supabase-to-backend-dry-run-plan.md` §2 is still manual).

Do not add any of the above without a dedicated phase that revisits this policy.
