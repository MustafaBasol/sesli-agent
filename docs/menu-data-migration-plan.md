# Phase 39/40/41 — Menu Data Migration / Import Dry-Run + Gated Write Mode + Real Export Review

Status (Phase 41): this phase prepares the dry-run tool for reviewing a **real** Supabase menu
export, but remains dry-run only — write mode is not enabled, no Supabase connection is made
(live or otherwise), and no production data is touched. It adds: a gitignored
`scripts/migration/menu-input-real/` drop folder (§2b) for the real export, a non-blocking
warning-threshold check (§5b) that flags data-quality issues without failing the run, and an
optional Markdown companion summary (§5c) alongside the JSON report. Builds on Phase 39 (dry-run)
and Phase 40 (gated write mode, §9/§11 below, still not exercised against real data as of this
phase).

Status (Phase 40): a gated write mode now exists alongside the Phase 39 dry-run. No Supabase
connection is ever made (live or otherwise), no production data has been touched, no Vapi
dashboard URL was changed, no Prisma schema/migration was added. Dry-run remains the default —
write mode only runs when every safety gate in §11 passes, and the preferred way to exercise it
for now is against a VPS/test database, not production. Builds on
`docs/backend-menu-foundation.md` (Phase 37 — schema/admin) and
`docs/vapi-menu-routes-decision-pack.md` (Phase 38 update — adapters implemented, data migration
pending).

## 1. Old Supabase menu data source

Two global (no `restaurantId`), independently-managed tables, confirmed from
`supabase/migrations/20240511_menu_system.sql` / `20240514_menu_categories.sql` and the admin
actions in `src/app/[lang]/admin/menu/actions.ts`:

```
menu_categories: id (uuid), name (text, unique), display_order (int), created_at.
menu_items: id (uuid), name (text), category (text, free-text label — NOT a foreign key),
  price (decimal(10,2)), currency (text, default 'TRY'), description (text),
  is_available (boolean, default true), created_at, updated_at.
```

`menu_items.category` is never joined against `menu_categories` by any old code path (admin UI
or Vapi routes) — the two tables are managed independently and category matching for migration
purposes is by **name only**.

## 2. Export expectations

This phase does not connect to Supabase. Produce a local JSON export of both tables (e.g. via
the Supabase dashboard's table export, or a one-off `select * from ...` dump saved as JSON) and
place the files at:

```
scripts/migration/menu-input/menu_categories.json
scripts/migration/menu-input/menu_items.json
```

Both files must be a JSON array of plain objects (one object per row). Missing files are
reported as "not found", not an error — the dry-run still runs with whichever file(s) exist.

This directory is not committed; only the fake fixtures under
`scripts/migration/menu-input-sample/` are. **Never commit a real export.**

## 2b. Reviewing a real export (Phase 41)

A dedicated, gitignored drop folder exists for a real export review, separate from the committed
fake fixtures:

```
scripts/migration/menu-input-real/menu_categories.json
scripts/migration/menu-input-real/menu_items.json
```

Only `scripts/migration/menu-input-real/README.md` is committed (it documents the expected
files/fields, mirroring this section) — the JSON files themselves are gitignored (see
`/scripts/migration/menu-input-real/*` in `.gitignore`) and must never be committed.

**How to export the old Supabase menu tables manually:** use the Supabase dashboard's table
editor (Table Editor → `menu_categories` / `menu_items` → Export → export to JSON), or run
`select * from menu_categories` / `select * from menu_items` in the SQL editor and save each
result set as a JSON array of row objects. Place the two resulting files at the paths above.

**Exact dry-run command for a real export review:**

```sh
MENU_IMPORT_RESTAURANT_ID="94581a20-a09a-4c9c-8ccb-88ab4e6df19f" \
MENU_IMPORT_INPUT_DIR="scripts/migration/menu-input-real" \
npm run migration:menu:dry-run
```

Do **not** set `MENU_IMPORT_WRITE_ENABLED`, `DATABASE_URL`, or any `MENU_IMPORT_ALLOW_PRODUCTION`/
`MENU_IMPORT_PRODUCTION_CONFIRMATION` override for this review — those belong to the separate,
explicitly-gated write-mode step in §4b/§11, not this review.

**This phase does not approve a production import.** A clean report (no errors, no threshold
warnings — see §5b) is a precondition for considering write mode, not an approval to run it. The
Vapi dashboard cutover for `get-menu-info`/`get-item-details` remains blocked regardless of this
review's outcome, per §10.

## 3. Field mapping

### MenuCategory

| Old field                                  | Backend field      | Notes |
|---------------------------------------------|---------------------|-------|
| `id`                                        | `sourceCategoryId`  | report-only, not stored as-is |
| `name`                                      | `name`              | required; duplicate detection by normalized name |
| `description` (if present)                  | `description`       | old schema has none today; supported if a later export adds it |
| `display_order` / `sort_order`              | `sortOrder`          | defaults to `0` if absent |
| `status` / `is_active` / `active` (if present) | `status`          | old schema has none today; defaults to `"active"` |

### MenuItem

| Old field                                          | Backend field                | Notes |
|------------------------------------------------------|-------------------------------|-------|
| `id`                                                  | `sourceItemId`                | report-only, not stored as-is |
| `category` / `category_id` / `category_name`          | `categoryId` (via matched name) | matched against categories by normalized name; unmatched -> `categoryName: null` + `orphanCategoryReferences` warning |
| `name`                                                 | `name`                         | required |
| `description`                                          | `description`                  | |
| `price`                                                | `priceCents`                   | parsed to integer cents, see §6; invalid/missing -> `null` + warning, never crashes |
| `currency`                                             | `currency`                     | defaults to `EUR` (old Supabase default was `TRY`; the admin UI's own default is already `EUR` — see `src/app/[lang]/admin/menu/page.tsx`) |
| `allergens` / `allergen_info`                          | `allergensJson`                | old schema has no such column today; supported if present |
| `dietary_tags` / `labels`                              | `dietaryTagsJson`              | same |
| `aliases`                                              | `aliasesJson`                  | same |
| `is_available` / `isAvailable`                         | `isAvailable`                  | defaults to `true` if absent |
| `status` (if present)                                  | `status`                       | defaults to `"active"` |
| `sort_order` / `display_order`                         | `sortOrder`                    | defaults to `0` |

## 4. Dry-run command

```sh
# required
MENU_IMPORT_RESTAURANT_ID=<target-restaurant-id> npx tsx scripts/migration/menu-import-dry-run.ts

# or via the package script
MENU_IMPORT_RESTAURANT_ID=<target-restaurant-id> npm run migration:menu:dry-run

# against the committed fake sample data
MENU_IMPORT_RESTAURANT_ID=test-restaurant-id MENU_IMPORT_INPUT_DIR=./scripts/migration/menu-input-sample npm run migration:menu:dry-run
```

`MENU_IMPORT_RESTAURANT_ID` is **required** — there is no default and the script never guesses
it. Without it, the script prints usage and exits with a non-zero code. `MENU_IMPORT_INPUT_DIR`
is optional and defaults to `scripts/migration/menu-input`.

Tests (pure helpers + report shape, no database):

```sh
npx tsx scripts/migration/menu-import-dry-run.test.ts
# or
npm run test:menu-import-dry-run
```

## 4b. Write-mode command (VPS/test DB only — see §11 before running this anywhere)

All four gating variables are required together:

```sh
MENU_IMPORT_WRITE_ENABLED=true \
MENU_IMPORT_RESTAURANT_ID=<target-restaurant-id> \
MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID=<target-restaurant-id> \
DATABASE_URL=<test-or-staging-database-url> \
npx tsx scripts/migration/menu-import-dry-run.ts

# or via the package script (same underlying file)
MENU_IMPORT_WRITE_ENABLED=true \
MENU_IMPORT_RESTAURANT_ID=<target-restaurant-id> \
MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID=<target-restaurant-id> \
DATABASE_URL=<test-or-staging-database-url> \
npm run migration:menu:write
```

The command is identical to the dry-run command except for the four added environment
variables — there is no separate write-mode script file. If `MENU_IMPORT_WRITE_ENABLED` is
unset (or anything other than `"true"`), the exact same invocation runs in dry-run mode.

DB-backed write-mode integration test (creates/cleans up a disposable restaurant; requires a
real test `DATABASE_URL`, never wired into any aggregate `npm test`):

```sh
DATABASE_URL=<test-database-url> npx tsx scripts/migration/menu-import-write.integration.test.ts
# or
DATABASE_URL=<test-database-url> npm run test:menu-import-write
```

## 5. Report interpretation

The dry-run always writes `scripts/migration/output/menu-import-report.json` (gitignored — see
`/scripts/migration/output/` in `.gitignore`) in addition to printing it to stdout. Key fields:

- `sourceFiles` — which input files were found and their record counts.
- `counts` — `categoriesRead`/`itemsRead` (raw), `validCategories`/`validItems` (passed
  validation), `skippedCategories`/`skippedItems` (not an object or missing `name`),
  `duplicateCategoryNames`/`duplicateItemNames`, `missingPrice`/`invalidPrice`,
  `missingCategory`/`orphanCategoryReferences`, `inactiveCategories`/`unavailableItems`.
- `proposedCategoryMappings` / `proposedItemMappings` — the full normalized/mapped record set a
  future write import would create, including per-item `warnings`.
- `duplicateCategoryNamesList` / `duplicateItemKeysList` — the actual duplicate names/keys, for
  a human to resolve before any write import.
- `warnings` / `errors` — non-blocking issues vs. issues serious enough that a write import
  should not proceed (e.g. zero source records found at all, or a write-mode safety gate abort).
- `dryRun` / `writeEnabled` — both `true`/`false` are now possible. `dryRun: true,
  writeEnabled: false` covers the default path and every aborted-write path (gate failure or a
  thrown DB error). `dryRun: false, writeEnabled: true` only appears after a write actually
  committed.
- `categories` / `items` — write-mode outcome counters: `read`/`valid`/`skipped` mirror the
  dry-run `counts` fields; `duplicateSkipped` mirrors `duplicateCategoryNames`/
  `duplicateItemNames` (duplicates are already excluded before the write step ever runs);
  `created`/`updated`/`unchanged` come from the actual database write (all zero in dry-run mode);
  `items.importedWithNullCategory` and `items.autoCreatedCategoryFromItemLabel` are write-mode
  only (see §9).
- `writeModeSafety` — records exactly which gates were evaluated: `writeEnabled` (was write mode
  requested at all), `confirmationMatched` (did the two restaurant-id env vars agree),
  `productionAllowed` / `productionConfirmationProvided` (the production override pair — see
  §11.3). Present and informative even when write mode was never requested.

## 5b. Warning thresholds (Phase 41)

After the counts above are final, the dry-run evaluates a fixed set of non-blocking thresholds
and appends any that trip to both `report.warnings` and a dedicated `report.thresholdWarnings`
array (pure, independently-testable via `evaluateThresholdWarnings` in
`scripts/migration/menuImportHelpers.ts`):

- `categoriesRead === 0` — no categories were read at all.
- `itemsRead === 0` — no items were read at all.
- more than 20% of valid items have a missing or invalid price.
- more than 20% of valid items have an orphan category reference.
- `duplicateItemNames > 0` — any duplicate item name+category combination at all.

These thresholds only ever **warn**, never fail the run — the only conditions that fail the dry-run
are a missing input directory or invalid JSON in a source file (existing Phase 39 behavior,
unchanged). A tripped threshold is a signal to review the data before considering a write import,
not a hard stop.

## 5c. Markdown summary (Phase 41)

Alongside the JSON report, the dry-run also writes a human-readable Markdown companion to
`scripts/migration/output/menu-import-report.md` (gitignored, same as the JSON report; pure
generation via `buildMarkdownSummary` in `scripts/migration/menuImportMarkdownSummary.ts`). It
includes: categories/items read, skipped/duplicate/orphan counts, missing/invalid price counts,
the top warnings (capped, with a count of how many more exist), the threshold warnings from §5b,
and a `GO`/`NO-GO` recommendation line.

**The JSON report remains the source of truth.** The Markdown file is a convenience summary for a
human reviewer — it is derived entirely from the JSON report's fields and never contains
information the JSON report doesn't already have. The `GO`/`NO-GO` line is a non-binding
suggestion (`NO-GO` if there are any errors, zero categories/items read, or any threshold
warning; `GO` otherwise) — it is not an approval mechanism and does not gate write mode in any
way (write mode's actual gates are §11, unrelated to this recommendation).

## 6. Price parsing policy

`priceCents` is computed from the old `price` field via string-based parsing (never naive
`parseFloat(...) * 100`, to avoid binary floating-point rounding on money):

- A plain number (`12.5`) is rounded to the nearest cent.
- A decimal-dot string (`"12.50"`) parses directly.
- A decimal-comma string (`"12,50"`) is treated as the European decimal separator.
- A string with both `.` and `,` (`"1.250,50"`) treats whichever separator appears **last** as
  the decimal point and strips the other as a thousands separator.
- A leading currency symbol or stray whitespace (`"€12.50"`) is stripped before parsing.
- Anything that doesn't reduce to a clean `-?digits(.digits{1,2})?` value (e.g. `"not-a-price"`,
  `null`, `NaN`) is **never guessed at** — it is reported as `priceCents: null` plus a
  `"missing price"` or `"invalid price"` warning, and the record is still included in
  `proposedItemMappings` (not silently dropped) so a human can fix the source value.

## 7. Duplicate policy

- **Categories**: duplicate by normalized name (`trim().toLowerCase()`, whitespace-collapsed)
  within the import batch. The first occurrence is kept as the proposed mapping; later
  duplicates are listed in `duplicateCategoryNamesList` and reported as warnings, never merged
  silently.
- **Items**: duplicate by normalized name **+** matched category name (or `"uncategorized"` if
  no category matched). Listed in `duplicateItemKeysList`. Both occurrences still appear in
  `proposedItemMappings` — the dry-run never decides which one "wins."
- Write mode (§9) never re-examines duplicates itself — `proposedCategoryMappings` /
  `proposedItemMappings` already contain only the first occurrence of each duplicate by the time
  write mode runs, so ambiguous duplicate records are never written, and their counts are
  reported via `categories.duplicateSkipped` / `items.duplicateSkipped`.

## 8. Target restaurant id requirement / no-production-data policy

- The import tool requires `MENU_IMPORT_RESTAURANT_ID` and refuses to run without it — old
  Supabase menu data is global/single-tenant, so every imported row would be assigned to this
  one restaurant id; the tool must never infer or default it.
- This script never connects to Supabase, live or otherwise, in either dry-run or write mode. It
  only ever reads local JSON files; write mode adds a connection to the backend's own Postgres
  (via `DATABASE_URL`), never to Supabase.
- Only fake fixture data is committed (`scripts/migration/menu-input-sample/`). Real exports go
  in `scripts/migration/menu-input/` or `scripts/migration/menu-input-real/` (see §2b), neither of
  which is committed.

## 9. Write mode (Phase 40)

Write mode performs real Prisma writes to `MenuCategory`/`MenuItem` for the records in
`proposedCategoryMappings`/`proposedItemMappings` — the exact same mapped output the dry-run
already computes and reports. The write logic itself lives in
`backend/src/scripts/menuImportWrite.ts` (the only file in this tool that imports `@prisma/client`);
`scripts/migration/menu-import-dry-run.ts` reaches it via a dynamic `import()` so the root
project never needs Prisma as a dependency.

### 9.1 Idempotency (safe to re-run)

- **Categories** are matched by `restaurantId` + normalized name. A match updates `description`/
  `sortOrder`/`status` if any differ (`updated`), or leaves the row alone (`unchanged`); no match
  creates a new row (`created`).
- **Items** are matched by `restaurantId` + normalized name + the *resolved* category id (or
  `null`). The category id is resolved fresh on every run from the item's `categoryName` (or, if
  unmatched, from its raw `sourceCategoryRef` label — see §9.2), never from a stored source id.
  A match updates any of `categoryId`/`description`/`priceCents`/`currency`/`allergensJson`/
  `dietaryTagsJson`/`aliasesJson`/`isAvailable`/`sortOrder`/`status` that differ (`updated`), or
  leaves the row alone (`unchanged`); no match creates a new row (`created`).
- No old Supabase id is ever persisted. Re-running the exact same input is always safe — it finds
  the same rows by name/category and reports them `unchanged`, never duplicating them.
- Field write policy is fixed to the columns above — write mode never writes the raw source
  object, the old source id, `rawPayload`, or any other debug metadata.

### 9.2 Orphan category references

If an item's category reference text didn't match any known category (an "orphan reference," the
same condition the dry-run already flags via `orphanCategoryReferences`/`categoryName: null`),
write mode auto-creates a category from that raw label text (status `"active"`, `sortOrder: 0`)
and links the item to it, recording a warning and incrementing
`items.autoCreatedCategoryFromItemLabel`. If the item has no category label at all, it is written
with `categoryId: null` and counted in `items.importedWithNullCategory` — it is never dropped.

### 9.3 Duplicates, transactions, and failure handling

- Duplicate source records are already excluded from `proposedCategoryMappings`/
  `proposedItemMappings` by the dry-run mapping stage (§7) before write mode ever sees them —
  write mode itself has nothing further to deduplicate.
- All writes for one run happen inside a single `prisma.$transaction(...)` — either the whole
  batch commits or none of it does. This is acceptable for this phase's data volumes; a much
  larger export would need batched transactions instead (not implemented, not needed yet).
- Any thrown database error fails the run with a non-zero exit code; `report.errors` records the
  failure and the report file is still written (see §11.4).

### 9.4 Safety gates (§11) and the write-mode command (§4b)

See §11 for exactly which environment variables are required and why, and §4b for the exact
command.

## 10. Cutover implication

This phase does **not**, by itself, lift the Vapi dashboard cutover blocker for
`get-menu-info`/`get-item-details` documented in `docs/backend-production-cutover-plan.md` and
`docs/backend-vapi-webhook-parity-assessment.md`. Running write mode against a VPS/test database
populates that database's `MenuCategory`/`MenuItem` tables, but cutover still requires: a real
production export reviewed by a human, an explicit production-targeted write-mode run (gated by
§11.1, not yet exercised), plus the same real-payload parity comparison required of every other
Vapi tool.

## 11. Write-mode safety gates

All four of the following are required together for write mode to run at all. Missing or
mismatched any one of them aborts the run *before any database write*, writes the report with
the abort reason in `errors`, and exits non-zero. Evaluated by the pure, independently-testable
`scripts/migration/menuImportWriteGates.ts`.

1. `MENU_IMPORT_WRITE_ENABLED=true` — without this, the script always runs in dry-run mode
   regardless of any other variable being set (this is the existing Phase 39 default, unchanged).
2. `MENU_IMPORT_RESTAURANT_ID=<id>` — the same required target-restaurant variable as dry-run.
3. `MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID=<id>` — must be set **and** exactly equal to
   `MENU_IMPORT_RESTAURANT_ID`. This is a deliberate second typed confirmation of the target
   restaurant, specifically to catch a copy-paste mistake before any write.
4. `DATABASE_URL=<backend-database-url>` — required in write mode; without it the run aborts.
   This is the backend's own Postgres connection string, never a Supabase URL.

### 11.1 Production override (not to be used yet)

If `NODE_ENV=production`, write mode additionally requires **both**:

- `MENU_IMPORT_ALLOW_PRODUCTION=true`, and
- `MENU_IMPORT_PRODUCTION_CONFIRMATION="I_UNDERSTAND_THIS_WRITES_MENU_DATA"` (exact phrase).

Even with both set, write mode still never connects to Supabase — it only ever reads local
export files. This override exists as a future safety mechanism only; the intended way to
exercise write mode for this phase is against a VPS/test database with `NODE_ENV` unset or
non-production, not production.

### 11.2 Rollback recommendation

Because the write happens inside a single transaction, a failed run leaves the database
unchanged — no manual rollback is needed for a failure. For a *successful* run that imported the
wrong data, recovery is manual: review `report.proposedCategoryMappings`/`proposedItemMappings`
and the created/updated row counts in the report, then correct or delete the affected
`MenuCategory`/`MenuItem` rows directly (there is no automated undo).

### 11.3 Report is always written

Every path — pure dry-run, a gate-abort, a successful write, or a failed write — always writes
`scripts/migration/output/menu-import-report.json`. An abort or failure never leaves a human
without a record of what was attempted and why it didn't proceed.

## 12. Real export dry-run review (Phase 41)

Phase 41 prepares this tool for reviewing a real Supabase menu export — see §2b for the input
folder, export instructions, and exact command; §5b for the new non-blocking warning thresholds;
and §5c for the optional Markdown summary. No code in this phase connects to Supabase, writes to
any database, or touches production data, and write mode (§9/§11) is not enabled by this phase.

**Production import is not approved by this phase.** A clean dry-run report against a real export
is a precondition for considering a future write-mode run, never an approval to perform one — that
remains a separate, explicit decision gated by §11 and reviewed by a human. The Vapi dashboard
cutover for `get-menu-info`/`get-item-details` remains blocked per §10 regardless of this review's
outcome — reviewing a real export dry-run report does not by itself lift that blocker.

## 13. Test-database import and Vapi menu preview (Phase 42)

Phase 42 exercises the existing Phase 40 write-mode mechanism (§9/§11) against a **VPS/test
database only** — `postgresql://.../sesliagent_test`, never production, never live Supabase — using
the real export reviewed in Phase 41. No code change was required for the write path itself; the
existing `MENU_IMPORT_WRITE_ENABLED` + `MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID` + `DATABASE_URL`
gate combination (§11) is sufficient. The only addition is a read-only preview helper,
`scripts/migration/menu-test-db-preview.ts` (`npm run migration:menu:preview`), which connects only
to `DATABASE_URL` and prints `MenuCategory`/`MenuItem` counts, the category list with per-category
item counts, and a few sample items per category for `MENU_IMPORT_RESTAURANT_ID` — it never writes,
updates, or deletes anything.

This phase also previews the backend Vapi `get-menu-info`/`get-item-details` webhook responses
against the imported test-database data, by calling the existing
`POST /api/webhooks/vapi/:publicWebhookKey/get-menu-info` and `.../get-item-details` routes on a
backend instance pointed at the test database. This is a local/VPS-test smoke check only — it does
not touch the Vapi dashboard configuration and does not change which environment the production
Vapi assistant actually calls (see §10; still blocked).

**This does not change §10's cutover-blocked conclusion, and production import is still not
approved.** A successful test-database import and a clean Vapi preview are necessary steps toward a
real cutover decision, never the decision itself. The agent that authored this section has no
VPS/live-environment access — all verification commands below must be run manually by a human with
VPS access, and Phase 42 is only accepted once that human reports actual command output (see
`docs/backend-production-cutover-plan.md`'s Phase 42 update for the acceptance report format). Do
not start Phase 43 until that report is reviewed and the Phase 42 update is accepted.

## 14. Production import safety: snapshot, diff preview, and replace mode (Phase 43)

Phase 43 addresses the root cause of the 46-vs-42-item discrepancy found in the Phase 42 test-DB
import: upsert-only mode creates/updates source records but **never removes or disables** DB-only
records (old seed or demo rows). Three tools are added to make a safe production import possible.
No production database, live Supabase, or Vapi dashboard was touched. Write mode is still
not enabled against production. Phase 44 will be the controlled production import phase.

### 14.1 Why upsert-only is insufficient when demo data exists

The Phase 40/42 write path is an idempotent upsert: categories are matched by
`restaurantId + normalizedName`, items by `restaurantId + normalizedName + resolvedCategoryId`.
Records in the DB but absent from the source are silently left alone. This is safe during
development (demo/seed rows stay until explicitly cleaned up), but means a production import
over a DB that contains seed/demo rows would leave those old rows **active alongside the real
menu**, confusing Vapi's `get-menu-info` and `get-item-details` responses.

### 14.2 Read-only DB snapshot

```sh
# Take a timestamped read-only snapshot of the current DB menu state.
DATABASE_URL=<db-url> \
MENU_IMPORT_RESTAURANT_ID=<restaurant-id> \
npm run migration:menu:snapshot
```

Writes `scripts/migration/output/menu-db-snapshot-{YYYYMMDD-HHmmss}.json` and a companion
`.md` — counts, category list (with per-category item counts), first 50 items, active/inactive
counts. **Never mutates any row.**

### 14.3 Source-vs-DB diff preview

```sh
# Compare source files against DB — read-only.
DATABASE_URL=<db-url> \
MENU_IMPORT_RESTAURANT_ID=<restaurant-id> \
MENU_IMPORT_INPUT_DIR=scripts/migration/menu-input-real \
npm run migration:menu:diff-preview
```

Writes `scripts/migration/output/menu-import-db-diff-preview.json` and a companion `.md`.
Shows: source counts, DB counts, categories/items to create / would update / unchanged, DB-only
categories and items (those that would remain if replace mode is not used), and a replace-mode
recommendation if DB-only records exist. **Never mutates any row.**

### 14.4 Replace mode (safe soft-disable)

Replace mode extends the write path: after upserting all source records, DB-only records (those
in the DB but absent from the source) are **soft-disabled** — never hard-deleted. Replace mode
is disabled by default and requires an explicit second confirmation phrase.

**Soft-disable rules:**
- DB-only `MenuItem` rows: `status → "inactive"`, `isAvailable → false`.
- DB-only `MenuCategory` rows: `status → "inactive"`.
- Records already fully disabled are counted as skipped (idempotent).
- No row is ever deleted.

**Replace mode safety gates (all required, in addition to the existing write gates §11):**

```sh
MENU_IMPORT_REPLACE_EXISTING=true
MENU_IMPORT_REPLACE_CONFIRMATION="I_UNDERSTAND_THIS_WILL_DISABLE_MENU_RECORDS_NOT_IN_SOURCE"
```

Full replace-mode command (VPS/test DB only — do not run against production yet):

```sh
MENU_IMPORT_WRITE_ENABLED=true \
MENU_IMPORT_RESTAURANT_ID=<restaurant-id> \
MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID=<restaurant-id> \
DATABASE_URL=postgresql://sesliagent:sesliagentpass@127.0.0.1:5433/sesliagent_test \
MENU_IMPORT_REPLACE_EXISTING=true \
MENU_IMPORT_REPLACE_CONFIRMATION="I_UNDERSTAND_THIS_WILL_DISABLE_MENU_RECORDS_NOT_IN_SOURCE" \
npm run migration:menu:write
```

The report gains a `replaceMode` block: `enabled`, `confirmationProvided`,
`dbOnlyCategoryCount`, `dbOnlyItemCount`, `disabledDbOnlyCategories`, `disabledDbOnlyItems`,
`skippedReplaceActions`. A clear warning in all replace-mode logs states:
**replace mode soft-disables only and never hard-deletes.**

### 14.5 Vapi dashboard cutover remains blocked (see §10)

Phase 43 does not lift the cutover blocker. Phase 44 will be the controlled production import
phase (snapshot → diff preview → human review → replace-mode write → post-import preview →
Vapi cutover decision). Do not start Phase 44 until Phase 43 is accepted.

## 15. Controlled production import runbook (Phase 44)

Phase 44 provides the final manual runbook for importing the cleaned real menu into the
**production backend database**. No production DB, live Supabase, or Vapi dashboard is touched by
the agent. All commands below must be run manually by a human with VPS access. Phase 45
(Vapi dashboard cutover) remains blocked until this phase is verified and accepted.

### 15.1 Production import prerequisites

Before running any production command, verify all of the following from code:

| Prerequisite | Where enforced |
|---|---|
| Snapshot helper is read-only (never writes DB rows) | `scripts/migration/menu-db-snapshot.ts` — only `SELECT`, writes only to `scripts/migration/output/` |
| Diff preview helper is read-only | `scripts/migration/menu-import-db-diff-preview.ts` — only `SELECT`, writes only to `scripts/migration/output/` |
| Write import requires all Phase 40 gates | `scripts/migration/menuImportWriteGates.ts` `evaluateWriteModeGates()` — `MENU_IMPORT_WRITE_ENABLED`, matching restaurant id confirmation, `DATABASE_URL` all required |
| Production write requires explicit production confirmation | `MENU_IMPORT_ALLOW_PRODUCTION=true` + `MENU_IMPORT_PRODUCTION_CONFIRMATION="I_UNDERSTAND_THIS_WRITES_MENU_DATA"` both required when `NODE_ENV=production` |
| Replace mode requires exact replace confirmation | `MENU_IMPORT_REPLACE_CONFIRMATION="I_UNDERSTAND_THIS_WILL_DISABLE_MENU_RECORDS_NOT_IN_SOURCE"` (exact phrase) |
| Replace mode soft-disables only | `backend/src/scripts/menuImportWrite.ts` — sets `status→inactive`, `isAvailable→false`; no DELETE statement exists |
| No hard delete exists | Grep `menuImportWrite.ts`: only `menuCategory.update` / `menuItem.update` in replace block; no `delete` or `deleteMany` |
| Vapi dashboard unchanged | No `src/app/api/vapi/*` file is touched; no Vapi dashboard URL is changed by this phase |

### 15.2 Take a normal DB backup before write

Before running the production write, take a standard PostgreSQL backup outside this tool:

```bash
# On VPS — replace <DB_USER>, <DB_NAME>, and output path as appropriate
pg_dump -U <DB_USER> <DB_NAME> > /tmp/phase44-production-pg-dump-before.sql
```

This is independent of the snapshot tool. The snapshot JSON provides a structured record for
rollback reference; the `pg_dump` is the actual recovery artifact.

### 15.3 Exact manual VPS production commands

Run these commands in order. **Stop at any step that fails or produces unexpected output.**

#### A. Update repo

```bash
cd /docker/sesli-agent/app
git pull origin main
```

#### B. Confirm source export files exist

```bash
ls -lah scripts/migration/menu-input-real/
test -s scripts/migration/menu-input-real/menu_categories.json
test -s scripts/migration/menu-input-real/menu_items.json
```

Stop if either `test -s` fails (file missing or empty).

#### C. Safety reset — unset all dangerous flags first

```bash
unset MENU_IMPORT_WRITE_ENABLED
unset MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID
unset MENU_IMPORT_REPLACE_EXISTING
unset MENU_IMPORT_REPLACE_CONFIRMATION
unset MENU_IMPORT_ALLOW_PRODUCTION
unset MENU_IMPORT_PRODUCTION_CONFIRMATION
```

#### D. Set production target env

```bash
export MENU_IMPORT_RESTAURANT_ID="94581a20-a09a-4c9c-8ccb-88ab4e6df19f"
export MENU_IMPORT_INPUT_DIR="scripts/migration/menu-input-real"
export DATABASE_URL="<PRODUCTION_DATABASE_URL>"
```

`<PRODUCTION_DATABASE_URL>` must be filled from the production backend's `.env` or Docker secrets.
Do not print or commit this value.

#### E. Production snapshot before import

```bash
npm run migration:menu:snapshot | tee /tmp/phase44-production-snapshot-before.txt
```

Expected output:
- `counts.categories`: current production category count
- `counts.items`: current production item count
- active/inactive/available/unavailable counts printed
- JSON + markdown written to `scripts/migration/output/menu-db-snapshot-{ts}.json|.md`
- Script is **read-only** — no row is mutated

Stop if the database is unreachable or the snapshot count looks wrong (e.g. 0 categories when
production has real data — indicates `DATABASE_URL` may be pointing at the wrong DB).

#### F. Production diff preview before import

```bash
npm run migration:menu:diff-preview | tee /tmp/phase44-production-diff-preview-before.txt
```

Expected output:
- `sourceCategoryCount: 11`
- `sourceItemCount: 42`
- categories / items to create / update / unchanged shown
- DB-only categories and items listed if any exist
- `replaceRecommended: true` if production has demo/seed DB-only rows
- Script is **read-only** — no row is mutated

Stop if unexpected DB-only records appear that look like real customer-created data that should
not be disabled. Review the list before proceeding to the write step.

#### G. Production pre-write dry-run (no write flags set)

```bash
npm run migration:menu:dry-run | tee /tmp/phase44-production-prewrite-dryrun.txt
```

Expected output (all of these must be clean before proceeding):
- `dryRun: true`
- `writeEnabled: false`
- source files found: true for both
- `categoriesRead: 11`
- `itemsRead: 42`
- `errors: []`
- `thresholdWarnings: []`
- `orphanCategoryReferences: 0`
- `duplicateCategoryNames: 0`
- `duplicateItemNames: 0`
- `missingPrice: 0`
- `invalidPrice: 0`

Stop immediately if any of the above are not clean.

#### H. Production write import with replace mode

Only run after E, F, and G are all clean:

```bash
export MENU_IMPORT_WRITE_ENABLED=true
export MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID="94581a20-a09a-4c9c-8ccb-88ab4e6df19f"
export MENU_IMPORT_REPLACE_EXISTING=true
export MENU_IMPORT_REPLACE_CONFIRMATION="I_UNDERSTAND_THIS_WILL_DISABLE_MENU_RECORDS_NOT_IN_SOURCE"
export MENU_IMPORT_ALLOW_PRODUCTION=true
export MENU_IMPORT_PRODUCTION_CONFIRMATION="I_UNDERSTAND_THIS_WRITES_MENU_DATA"

npm run migration:menu:dry-run | tee /tmp/phase44-production-write-replace-run-1.txt
```

Expected output:
- `dryRun: false`
- `writeEnabled: true`
- `replaceMode.enabled: true`
- `productionAllowed: true`
- `categories.created`/`updated`/`unchanged` consistent with diff preview
- `items.created`/`updated`/`unchanged` consistent with diff preview
- `errors: []`
- `replaceMode.disabledDbOnlyItems` — list of any soft-disabled DB-only items (demo/seed rows)
- `replaceMode.disabledDbOnlyCategories` — list of any soft-disabled DB-only categories
- No hard delete

Stop if `errors` is non-empty.

#### I. Production idempotency rerun

```bash
npm run migration:menu:dry-run | tee /tmp/phase44-production-write-replace-run-2.txt
```

Expected output (idempotency check):
- No new categories created (all `unchanged` or 0 `created`)
- No new items created (all `unchanged` or 0 `created`)
- `replaceMode.skippedReplaceActions` equals previous run's `disabledDbOnlyItems` +
  `disabledDbOnlyCategories` count (already disabled, so skip rather than re-disable)

Stop if new records are created that were not created in run 1 — indicates a key collision or
schema inconsistency.

#### J. Production snapshot and preview after import

```bash
npm run migration:menu:snapshot | tee /tmp/phase44-production-snapshot-after.txt
npm run migration:menu:diff-preview | tee /tmp/phase44-production-diff-preview-after.txt
npx tsx scripts/migration/menu-test-db-preview.ts | tee /tmp/phase44-production-menu-preview-after.txt
```

Expected:
- Snapshot counts include all 11 real categories
- `activeItems: 42` / `availableItems: 42`
- If demo/seed rows existed: `inactiveItems` ≥ 0, `unavailableItems` ≥ 0 (those soft-disabled)
- Diff preview after import: `dbOnlyItemCount: 0` for non-disabled items; DB-only items from
  pre-import diff are now shown with `status: inactive`
- Menu preview includes:
  - Mocktails category → Hibiscus Ice Tea
  - Mojitos category → Mojito Classic
  - Kebabs category → Ali Nazik Kebab at 21.90 EUR

Stop if the expected spot-check items are missing or shown as inactive/unavailable.

#### K. Backend production safety check (do not change Vapi dashboard yet)

If the backend is running, perform a health + menu route smoke check:

```bash
# Health check — adjust host/port to match production backend
curl -s http://127.0.0.1:4000/api/health

# Or using the production domain placeholder (fill in the actual domain):
# curl -s https://<BACKEND_DOMAIN>/api/health
```

For Vapi menu route preview (requires a valid `publicWebhookKey` from the production
`IntegrationConnection` — do NOT change the Vapi dashboard URL):

```bash
# get-menu-info — preview only, no dashboard change
curl -s -X POST http://127.0.0.1:4000/api/webhooks/vapi/<PUBLIC_WEBHOOK_KEY>/get-menu-info \
  -H "Content-Type: application/json" \
  -d '{"message":{"type":"tool-calls","toolCallList":[]}}' | jq .

# get-item-details for Hibiscus Ice Tea
curl -s -X POST http://127.0.0.1:4000/api/webhooks/vapi/<PUBLIC_WEBHOOK_KEY>/get-item-details \
  -H "Content-Type: application/json" \
  -d '{"message":{"type":"tool-calls","toolCallList":[{"function":{"name":"get-item-details","parameters":{"item_name":"Hibiscus Ice Tea"}}}]}}' | jq .

# get-item-details for Mojito Classic
curl -s -X POST http://127.0.0.1:4000/api/webhooks/vapi/<PUBLIC_WEBHOOK_KEY>/get-item-details \
  -H "Content-Type: application/json" \
  -d '{"message":{"type":"tool-calls","toolCallList":[{"function":{"name":"get-item-details","parameters":{"item_name":"Mojito Classic"}}}]}}' | jq .

# get-item-details for Ali Nazik Kebab
curl -s -X POST http://127.0.0.1:4000/api/webhooks/vapi/<PUBLIC_WEBHOOK_KEY>/get-item-details \
  -H "Content-Type: application/json" \
  -d '{"message":{"type":"tool-calls","toolCallList":[{"function":{"name":"get-item-details","parameters":{"item_name":"Ali Nazik Kebab"}}}]}}' | jq .
```

Replace `127.0.0.1:4000` with the actual production backend host/port if different.
`<PUBLIC_WEBHOOK_KEY>` must be the real value from the production `IntegrationConnection` row —
do not invent or hardcode it here.

Expected: all three items returned with `status: active`, `isAvailable: true`, correct prices.

**Do not change the Vapi dashboard URL after this check.** Phase 45 (Vapi cutover) is a
separate decision that remains blocked until this phase is fully accepted.

### 15.4 Stop conditions

Stop immediately if any of the following occur:

- `DATABASE_URL` appears to point at the test DB (`sesliagent_test`) — check `\l` in psql before write
- Source files are missing or empty (`test -s` fails in step B)
- Pre-write dry-run (step G) has any errors, threshold warnings, orphan references, duplicate
  names, or missing/invalid prices
- Snapshot output (step E) shows 0 categories or 0 items when production has real data
- Diff preview (step F) shows unexpected real customer-created records in `dbOnlyItems` that
  should not be soft-disabled — do not proceed to write without reviewing and deciding on those
- Write report (step H) has non-empty `errors`
- Post-import snapshot (step J) shows `activeItems` ≠ 42 or expected spot-check items
  (Hibiscus Ice Tea, Mojito Classic, Ali Nazik Kebab) are missing or inactive
- Vapi preview (step K) returns empty menu or demo items as active/available

### 15.5 Rollback notes

Because Phase 43's replace mode uses soft-disable and no hard delete:

- **No rows are deleted.** DB-only rows are set `status=inactive, isAvailable=false` only.
- **Rollback from snapshot**: the pre-import JSON snapshot in `scripts/migration/output/` records
  every row's exact status/isAvailable/price/name before the import. To restore a previously
  active DB-only row, use the snapshot's `id` field and run an `UPDATE` directly.
- **Rollback from pg_dump**: the `pg_dump` taken in §15.2 is the definitive recovery artifact —
  a full restore (`pg_restore` or `psql < dump.sql`) will return the database to its exact
  pre-import state if the import results are unacceptable.
- **Source-imported rows** (created/updated by the import) can be rolled back manually by
  restoring previous `status`/`isAvailable`/`priceCents`/`name` values from the snapshot JSON
  or from the `pg_dump`.
- Recommended recovery order: attempt targeted SQL corrections from the snapshot first; fall
  back to full `pg_dump` restore only if the import caused widespread unexpected data issues.

### 15.6 Phase 45 Vapi dashboard cutover remains blocked

Phase 44 (this phase) does **not** lift the Vapi dashboard cutover blocker for
`get-menu-info`/`get-item-details`. Phase 45 is the next phase; it may only start after:

1. A human has run all Phase 44 VPS commands above and reported actual output.
2. The post-import snapshot confirms `activeItems: 42` and the spot-check items are present.
3. The backend Vapi route preview (step K) returns the correct menu and item details.
4. The Phase 44 verification report is reviewed and accepted.

Until all four conditions are met, the live Vapi dashboard continues pointing at
`src/app/api/vapi/get-menu-info` and `src/app/api/vapi/get-item-details` (the existing
Next.js/Supabase routes), and no dashboard URL is changed.
