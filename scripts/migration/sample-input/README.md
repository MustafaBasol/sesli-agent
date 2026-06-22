# Sample dry-run input

This directory contains tiny, entirely fake fixture files used to exercise the dry-run script
(`scripts/migration/supabase-to-backend-dry-run.ts`) and its tests. None of this is real customer,
reservation, or call data — every name, phone number, and id below is invented for testing only.

Run the dry-run against this directory:

```sh
MIGRATION_SOURCE_DIR=./scripts/migration/sample-input npx tsx scripts/migration/supabase-to-backend-dry-run.ts
```

To point the dry-run at a real local export instead, copy a real export directory's JSON files
into a separate, `.gitignore`d directory and set `MIGRATION_SOURCE_DIR` to that path. Never commit
real exported data here.
