# Migration Policy (Phase 23)

This document is the governing policy for a future Supabase → Backend migration. **It does not
execute migration.** It defines the safety, timezone, raw-payload, duplicate-handling, and
reporting rules that any future import script must follow. It builds on the decisions accepted in
`docs/migration-gap-closure-decision-pack.md` (Phase 22) and the field mapping in
`docs/supabase-to-backend-migration-mapping.md` (Phase 21).

The companion dry-run skeleton (`scripts/migration/supabase-to-backend-dry-run.ts`) implements the
read-only reporting rules in this policy against local JSON fixtures only — it does not connect to
Supabase, does not write to any database, and does not perform a real migration.

## A) Scope

- This policy covers a *future* Supabase → Backend migration.
- It does not execute migration.
- It defines safety, timezone, raw payload, duplicate handling, and reporting rules that bind any
  import tooling written in a later phase.
- It governs the dry-run skeleton introduced in this phase, which is read-only and operates on
  local JSON fixtures, not a live Supabase connection.

## B) Safety rules

- Never run any migration tooling against production without explicit, separate confirmation from
  the team — this policy does not grant that confirmation.
- Always run dry-run first, against local export files, before any write attempt is even
  considered.
- Always back up both the Supabase project and the backend Postgres database before any real write
  migration.
- Never write to any database unless `MIGRATION_WRITE_ENABLED=true` is explicitly set — and as of
  this phase, no write path is implemented at all (see §I).
- Never log secrets (connection strings, API keys, tokens).
- Never print full raw payload bodies by default — only counts and presence flags (§F).
- Never assume timezone conversion silently (§C).
- Never drop or overwrite records in the target database during a first migration.
- Always produce a migration report (§H) for every run, dry-run or otherwise.

## C) Timezone / date policy

- Preserve old Supabase reservation `reservation_date`/`reservation_time` as literal values — do
  not reinterpret them into a different timezone.
- Do not convert date/time values unless the source timezone has been explicitly confirmed by the
  team (per the open question in `docs/supabase-to-backend-migration-mapping.md` §6).
- For Golden Meat, `Europe/Paris` may be used **later** as an explicit, documented validation
  assumption — never as a silent default applied by code.
- A future write migration should store both:
  - the source literal date/time, unchanged;
  - a normalized backend-compatible date/time, only once the timezone assumption above has been
    confirmed.
- Dry-run reporting must flag, per record, without guessing or correcting them:
  - missing date;
  - missing time;
  - invalid date;
  - invalid time;
  - past/future anomalies (e.g. a reservation date far in the past or far in the future relative
    to the run date);
  - ambiguous timezone cases (flagged as a category, not resolved).

## D) Customer matching policy

- Prefer normalized phone number as the primary match key, when the phone value is reliable.
- Email may be used as a secondary match signal.
- Name-only matching is unreliable and must never trigger an automatic merge.
- If a record matches more than one possible existing customer, mark it as a **conflict** — do not
  pick one automatically.
- Do not merge customers automatically in the first write migration, whenever it is built.
- Dry-run reporting must surface:
  - exact phone duplicates;
  - exact email duplicates;
  - records missing both phone and email;
  - likely duplicates by name + phone/email similarity (reported as a candidate list, not acted
    on).

## E) Reservation / request policy

- Confirmed historical reservations should map to a backend `Reservation` where a clean mapping
  exists.
- Pending/unclear items should map to `ReservationRequest` if their status can be reconciled
  against the backend's known status vocabulary.
- Unsupported legacy statuses (anything not in the backend's known status set) must be reported,
  never guessed at or silently coerced.
- The old `seen` status (and any other status with no backend equivalent) must be flagged as
  unsupported, not auto-mapped.
- Table assignment is recorded on `Reservation` only, matching current backend behavior
  (`docs/migration-gap-closure-decision-pack.md` §1, Option B).
- Table assignment for pending requests is deferred — out of scope for this phase and the next
  write migration.

## F) Raw payload policy

- Raw Vapi payloads may contain sensitive data (phone numbers, free-text transcripts).
- Dry-run output must never print raw payload bodies, by default or otherwise.
- A future write migration may, per record class, either:
  - migrate the raw payload into the existing restricted backend `rawPayload`/`requestPayload`/
    `responsePayload` fields (OWNER/MANAGER-only exposure, matching the precedent in
    `reservationRequestService.ts`; STAFF must never receive raw payload);
  - summarize the payload only;
  - archive it externally, outside the operational database.
- Until that decision is made explicitly per data class, dry-run must only **count and flag the
  presence** of raw payload fields — never print their contents.
- Sensitive field names/patterns found inside a record must be detected and reported by count
  only, never printed verbatim.

## G) Deferred data policy

The following are explicitly deferred and must be reported as `deferred`, not imported, unless a
later phase adds a corresponding backend model:

- `menu_items`
- `menu_categories`
- `orders`
- `blackout_dates`
- `restaurant_rules`
- unsupported `restaurant_settings` fields (anything without a corresponding `Restaurant` column)

This matches `docs/migration-gap-closure-decision-pack.md` §3–§5 — none of these have a backend
destination today, and none should be invented speculatively in this phase.

## H) Reporting policy

Every dry-run must produce a report containing:

- source counts (per input file/table);
- planned target counts (what *would* be created, per model, if a write migration ran);
- skipped counts (missing files, unsupported records);
- conflict counts (ambiguous customer matches, duplicate candidates);
- warnings (non-blocking issues worth a human look);
- blockers (issues that should stop a write migration from running at all);
- missing required fields, per record;
- duplicate candidates (customers);
- unsupported statuses (reservation requests);
- sensitive payload field presence (counts only, never raw content);
- a summary grouped by source table/model.

## I) Write-path status

As of this phase, **no write path exists**. `MIGRATION_WRITE_ENABLED=true` is reserved for a future
phase that explicitly implements writes against a staging database — it has no effect on the
current dry-run skeleton, which is read-only regardless of any environment variable.

## Explicit non-goals of this phase

- No real Supabase connection was made.
- No production data (Supabase or backend) was read or mutated.
- No Prisma schema or migration files were added.
- No `/admin/*` Supabase admin page was modified.
- No `src/app/api/vapi/*` production route was modified.
- No write-to-database behavior was implemented.
