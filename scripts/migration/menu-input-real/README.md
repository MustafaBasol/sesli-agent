# Real menu export input (not committed)

This folder is the intended drop location for a **real** export of the old
Supabase `menu_categories`/`menu_items` tables, for use with the Phase 41
real-export dry-run review. Everything in this folder except this README is
gitignored (see `/scripts/migration/menu-input-real/*` in `.gitignore`) —
**never commit a real export.**

This is a dry-run input folder only. Placing files here and running the
dry-run command never connects to Supabase, never writes to any database,
and never touches production data — see `docs/menu-data-migration-plan.md`
for the full tool design.

## Expected files

```
menu_categories.json
menu_items.json
```

Both files must be a JSON array of plain objects (one object per row).
Missing files are reported as "not found" by the dry-run, not an error.

## Expected old fields

`menu_categories.json` — one object per row of the old Supabase
`menu_categories` table:

```
id
name
display_order
created_at
```

`menu_items.json` — one object per row of the old Supabase `menu_items`
table:

```
id
name
category
price
currency
description
is_available
created_at
updated_at
```

See `docs/menu-data-migration-plan.md` Section 1/3 for how these old fields
map onto the backend `MenuCategory`/`MenuItem` shape, and Section 2 for how
to produce this export from the Supabase dashboard.

## Running the dry-run against this folder

```sh
MENU_IMPORT_RESTAURANT_ID="94581a20-a09a-4c9c-8ccb-88ab4e6df19f" \
MENU_IMPORT_INPUT_DIR="scripts/migration/menu-input-real" \
npm run migration:menu:dry-run
```

Do **not** set `MENU_IMPORT_WRITE_ENABLED`, `DATABASE_URL`, or any
production override variable for this review — this command only ever
reads the JSON files above and writes a report to
`scripts/migration/output/`, never a database.
