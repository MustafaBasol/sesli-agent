# Sample menu import input

This directory contains tiny, entirely fake fixture files used to exercise the menu import
dry-run script (`scripts/migration/menu-import-dry-run.ts`). None of this is real menu data —
every name, price, and id below is invented for testing only, including the deliberate
"Seasonal Special" / "Soups" orphan-category example.

Run the dry-run against this directory:

```sh
MENU_IMPORT_RESTAURANT_ID=test-restaurant-id MENU_IMPORT_INPUT_DIR=./scripts/migration/menu-input-sample npx tsx scripts/migration/menu-import-dry-run.ts
```

To point the dry-run at a real local export instead, copy a real export's `menu_items.json`/
`menu_categories.json` into `scripts/migration/menu-input/` (gitignored) or another local,
`.gitignore`d directory, and set `MENU_IMPORT_INPUT_DIR` to that path. Never commit real
exported menu data here.
