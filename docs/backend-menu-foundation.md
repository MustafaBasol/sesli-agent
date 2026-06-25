# Phase 37 — Backend Menu Schema + Admin/API Foundation

Status: implemented (schema + API + beta admin UI). No Vapi menu adapter,
no Supabase data migration. Builds on the decision made in
`docs/vapi-menu-routes-decision-pack.md` (Phase 36): defer real Vapi menu
routes until real `MenuCategory`/`MenuItem` Prisma models exist.

## 1. Schema summary

Two new tenant-scoped models in `backend/src/prisma/schema.prisma`,
following the existing plain-`restaurantId`-string convention (no enforced
FK, same as `RestaurantTable`/`Customer`/etc.):

```
MenuCategory
- id, restaurantId, name, description?, sortOrder (default 0),
  status ("active"|"inactive", default "active"), createdAt, updatedAt
- @@unique([restaurantId, name])
- @@index([restaurantId, status]), @@index([restaurantId, sortOrder])

MenuItem
- id, restaurantId, categoryId? (plain string, not an enforced FK),
  name, description?, priceCents? (Int, nullable — price is not mandatory
  since old/incoming data may not have a clean value), currency
  (default "EUR"), allergensJson?, dietaryTagsJson?, aliasesJson?
  (bounded string arrays, validated at the Zod layer before they reach
  Prisma), isAvailable (default true), sortOrder (default 0),
  status ("active"|"inactive", default "active"), createdAt, updatedAt
- @@index([restaurantId, categoryId]), @@index([restaurantId, status]),
  @@index([restaurantId, isAvailable]), @@index([restaurantId, sortOrder])
```

Migration: `backend/src/prisma/migrations/20260625000000_add_menu_models/migration.sql`
(written by hand against the existing migration SQL convention — no local
Postgres/Docker was available in this environment to run
`prisma migrate dev`; the SQL was hand-derived from the schema and must be
applied via `npm run prisma:migrate:deploy` on the VPS/test DB, where it
will be picked up as a normal pending migration).

**Multilingual fields are deferred** — neither table has a language column.
Consistent with Phase 36 Section 5's note, a future phase should decide
between `nameTranslationsJson`/`descriptionTranslationsJson` JSON columns or
a separate `MenuItemTranslation` model if multilingual menu support becomes
a real requirement; not pre-built here per "no abstractions beyond what the
task requires."

`aliasesJson` is included now (not deferred) specifically to support future
voice-search matching without a later schema change, per this phase's
instructions — it is not yet read by any Vapi adapter.

## 2. API summary

All routes are under the existing authenticated backend admin API,
mounted in `backend/src/app.ts` via `menuRouter` (`backend/src/routes/menu.ts`):

```
GET    /api/restaurants/:restaurantId/menu/categories
POST   /api/restaurants/:restaurantId/menu/categories
GET    /api/restaurants/:restaurantId/menu/categories/:categoryId
PATCH  /api/restaurants/:restaurantId/menu/categories/:categoryId

GET    /api/restaurants/:restaurantId/menu/items
POST   /api/restaurants/:restaurantId/menu/items
GET    /api/restaurants/:restaurantId/menu/items/:itemId
PATCH  /api/restaurants/:restaurantId/menu/items/:itemId
```

Every route runs through `authenticate` + `requireRestaurantContext()` +
`requireRestaurantRole(...)`, the same middleware chain as `tables`/
`customers`/`conversations`. Query/body validation uses Zod schemas in
`backend/src/schemas/menu.ts` (`.strict()` objects — unknown fields are
rejected with 400). List queries support `page`/`pageSize` (capped at 100),
plus:

- Categories: `status`, `search` (name/description substring).
- Items: `categoryId`, `status`, `isAvailable`, `search` (name/description
  substring, plus an exact-value match against `aliasesJson` — Postgres
  JSON filters only support exact-element containment, not substring
  matching inside array elements, so alias search is exact-value-only for
  now).

Category list responses include `itemCount` (a cheap `groupBy` count,
following the same pattern as `tableService.ts`'s
`upcomingReservationCount`). Category/item detail and list responses are
built via explicit `toSafeCategory`/`toSafeItem` mappers in
`backend/src/services/menuService.ts` — never a bare Prisma row.

`categoryId` on item create/update is validated against
`findMenuCategoryForRestaurant` before the write; a category id from
another restaurant (or a nonexistent one) is rejected with 400
(`CategoryNotInRestaurantError`), both on create and on a category-move
update.

## 3. Role policy

- `OWNER`/`MANAGER`: create/update categories and items.
- `STAFF`: read-only (list/detail); write attempts get 403
  (`Insufficient permissions`, same shape as every other restaurant-scoped
  route).
- Cross-tenant access: list returns 403 (no access to the restaurant at
  all), detail/update on another tenant's id returns 404 (never
  distinguishes "not found" from "belongs to another tenant").

## 4. No-hard-delete policy

There is no `DELETE` route for categories or items. Deactivation is done by
setting `status: "inactive"` via `PATCH` (categories) or `status`/
`isAvailable` (items). This matches the phase's instruction to avoid
destructive operations on menu data that may still be referenced elsewhere
later (e.g. a future Vapi adapter or order history).

## 5. Not implemented in this phase

- **No Vapi menu adapter.** `get-menu-info`/`get-item-details` still serve
  from the old Next.js/Supabase routes (`src/app/api/vapi/get-menu-info`,
  `get-item-details`) — see `docs/vapi-menu-routes-decision-pack.md`
  Section 7 for the existing cutover-blocked decision, unchanged by this
  phase.
- **No Supabase data migration.** `menu_items`/`menu_categories` rows are
  not imported. The new backend tables start empty (besides whatever an
  admin creates through the new UI).
- **Phase 38 (planned)**: Vapi menu adapters over these models, following
  the existing `backend/src/utils/vapi/*Adapter.ts` pattern, plus the
  Supabase → backend data migration for existing `menu_items`/
  `menu_categories` rows.

## 6. Frontend

`src/app/[lang]/backend-admin/menu/page.tsx` + `MenuClient.tsx` — a Beta
Admin screen gated behind `NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA` (404s when
disabled, identical convention to `/backend-admin/tables`). Two tabs
(Categories / Items) reusing the existing login/restaurant-picker/filter/
list/detail-edit pattern from `TablesClient.tsx`. Allergens/dietary
tags/aliases are edited as comma-separated text inputs (no structured
tag-picker in this phase). No image upload, no bulk import. A nav link was
added to `BackendAdminNav.tsx`. The old `/[lang]/admin/menu` Supabase screen
was not touched.

## 7. Tests

`backend/src/tests/menu.integration.test.ts` — DB-backed, not wired into
`npm run test` (same convention as `tables.integration.test.ts`), run via
`npm run test:menu`. Skips cleanly when `DATABASE_URL` is unset/unreachable.
Covers: role-based create/update (OWNER/MANAGER vs STAFF read-only),
cross-tenant 403/404, category name uniqueness (409), validation (400),
category item-count, item list filters (category/status/isAvailable/
search), pagination, `categoryId` cross-tenant rejection on both create and
update, no raw/internal fields in responses, and confirms there is no
`DELETE` route.

## 8. Phase 37 VPS fix-up (post-review)

VPS verification of the first cut found two issues, both now fixed/clarified:

1. **`isAvailable=false` query filter returned the wrong item.** The list
   query schema (`backend/src/schemas/menu.ts`) used
   `z.coerce.boolean().optional()` for the `isAvailable` query param.
   `z.coerce.boolean()` calls JS `Boolean(value)`, which is `true` for *any*
   non-empty string — including the literal string `"false"` that arrives
   from a real querystring (`?isAvailable=false`). So the filter silently
   inverted: requesting unavailable items returned available ones instead.
   Fixed by adding a dedicated `queryBooleanSchema =
   z.enum(["true","false"]).transform(v => v === "true")` and using it only
   for the query-string field. `isAvailable` in the create/update body
   schemas is unaffected — those values arrive as real JSON booleans, where
   `Boolean(false) === false` is correct.
2. **`/en/backend-admin/menu` returned 404 on the VPS despite being in the
   build manifest.** No code defect was found: reproducing locally with the
   beta flag unset at build time 404s *every* `backend-admin/*` route
   uniformly (not just `/menu`), so a missing build-time flag does not
   explain an isolated 404 on one new route. `next.config.ts` sets
   `output: 'standalone'`; running `next start` against that config
   prints `"next start" does not work with "output: standalone"
   configuration. Use "node .next/standalone/server.js" instead.` — meaning
   the actual production process most likely *is* the long-running
   standalone `server.js`, and a `npm run build` alone does not refresh it.
   The fix is operational, not a code change: restart the standalone server
   process after every build (see Section 9), copying `.next/static` and
   `public/` into `.next/standalone/` as required by Next.js standalone
   deployments.

## 9. Correct VPS restart procedure (standalone output)

```bash
cd /docker/sesli-agent/app
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true

# stop the existing standalone server process, then:
PORT=3000 nohup node .next/standalone/server.js > /tmp/sesli-agent-frontend.log 2>&1 &

curl -I http://127.0.0.1:3000/en/backend-admin/menu
curl -I http://127.0.0.1:3000/en/admin/menu
```

`npm start` (`next start`) is not the right restart command for this
project's `output: 'standalone'` build — it works for local checks but
Next.js itself warns it is unsupported for this config.
