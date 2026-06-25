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
