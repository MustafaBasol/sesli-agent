# Phase 39/40 — Menu Data Migration / Import Dry-Run + Gated Write Mode

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
  in `scripts/migration/menu-input/`, which is not committed.

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
