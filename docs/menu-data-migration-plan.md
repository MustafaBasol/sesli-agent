# Phase 39 — Menu Data Migration / Import Dry-Run

Status: dry-run tooling only. No Supabase connection was made, no production data was touched,
no write path exists, no Vapi dashboard URL was changed, no Prisma schema/migration was added.
Builds on `docs/backend-menu-foundation.md` (Phase 37 — schema/admin) and
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
  should not proceed (e.g. zero source records found at all).
- `writeEnabled: false` — always `false` in this phase; confirms no write path ran.

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
- A future write import may upsert or otherwise resolve duplicates, but that decision is
  explicitly deferred to Phase 40 (§9).

## 8. Target restaurant id requirement / no-production-data policy

- The import tool requires `MENU_IMPORT_RESTAURANT_ID` and refuses to run without it — old
  Supabase menu data is global/single-tenant, so every imported row would be assigned to this
  one restaurant id; the tool must never infer or default it.
- This script never connects to Supabase, live or otherwise. It only reads local JSON files.
- No backend database write occurs in this phase, regardless of any environment variable —
  `MENU_IMPORT_WRITE_ENABLED` has no effect (see §9).
- Only fake fixture data is committed (`scripts/migration/menu-input-sample/`). Real exports go
  in `scripts/migration/menu-input/`, which is not committed.

## 9. Future write/import phase

**This phase (39) is dry-run only.** No write path exists. A future Phase 40 must explicitly
implement:

- `MENU_IMPORT_WRITE_ENABLED=true` actually performing Prisma writes (currently a no-op other
  than a warning log).
- A required `MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID` matching `MENU_IMPORT_RESTAURANT_ID`, as
  a second explicit confirmation before any write.
- A decision on duplicate handling (upsert by normalized name vs. skip vs. manual review queue).
- A decision on whether the import is run once against production or repeatably against a
  staging/test database first.

## 10. Cutover implication

This phase does **not** lift the Vapi dashboard cutover blocker for `get-menu-info`/
`get-item-details` documented in `docs/backend-production-cutover-plan.md` and
`docs/backend-vapi-webhook-parity-assessment.md`. A dry-run report is not migrated data — the
backend `MenuCategory`/`MenuItem` tables remain exactly as populated by Phase 37's admin UI (or
empty) until a real Phase 40 write import runs. Cutover still requires: the write import to
actually run against the target restaurant, plus the same real-payload parity comparison
required of every other Vapi tool.
