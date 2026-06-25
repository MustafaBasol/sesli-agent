# Phase 36 — Vapi Menu Routes (`get-menu-info` / `get-item-details`) Decision Pack

Status: decision/design only. No `src/app/api/vapi/*`, no `/admin/*`, no
Prisma schema/migration, no Supabase connection, and no production data were
touched while producing this document. See "Checks performed" (Section 9)
at the end.

This document makes the **menu data-source decision** for the two remaining
unimplemented backend Vapi tools — `get-menu-info` and `get-item-details` —
explicit, building on the gap both Phase 26
(`docs/backend-vapi-webhook-parity-assessment.md` Sections 2.10–2.11, 5, 6,
7) and Phase 32 (`docs/vapi-modify-cancel-handoff-decision-pack.md` Section
4 item 4) already flagged: no `Menu`/`MenuItem` Prisma model exists, and
both phases deliberately deferred the decision rather than guessing at a
schema. This document resolves that deferral with a recommendation, not an
implementation.

## CodeGraph setup note

Per this phase's instructions, CodeGraph was scoped to `backend/src` only
(`cd backend && codegraph init src`), not the full repository root. It
reported "Already initialized" (an existing index from a prior phase), and
`codegraph sync` reported "Already up to date" — no re-index was necessary.
`codegraph_explore`/`codegraph_node` calls against `backend/src/routes/webhooks/vapi.ts`,
the `backend/src/prisma/schema.prisma` models, and the existing Vapi adapter
pattern files were used for the backend-side inspection in Section 2. The
old Next.js/Supabase routes and the Supabase SQL migrations live outside
`backend/src`, so they were read directly with the file-read tool (CodeGraph
is not indexed over them by design — its scope was deliberately the backend
source root only, per this phase's instruction not to run it from the full
repo root).

## 1. Old route behavior inventory (production, Supabase)

### 1.1 `POST /api/vapi/get-menu-info` (per-tool generation)

```
Route: src/app/api/vapi/get-menu-info/route.ts
Payload shapes accepted: none — no input is read from the request body at all.
Required fields: none.
Old response shape: { menu_info: string, footer_message: "Please inform the
  guest that all prices are inclusive of VAT." }. menu_info is every
  is_available=true menu_items row formatted as one line each:
  "- {name} ({category}): {price} {currency}. Description: {description}",
  newline-joined.
Old Supabase tables/queries: menu_items, select('*'), .eq('is_available', true).
  No restaurantId column exists on this table — single global table, no
  tenant scoping of any kind.
Whether it reads menu categories/items: items only (menu_categories table
  exists separately but this route never queries it — see 1.3 below).
Whether it supports search/filter/category: no — always returns the full
  available-item list, unconditionally, every call.
Whether it supports item detail lookup: no — that is get-item-details's job.
Whether it exposes prices/allergens/descriptions: prices and free-text
  descriptions yes (raw price as a number, currency as a separate string);
  allergens/dietary tags: no such column exists on menu_items at all.
Whether it has fallback/static text: no — if menu_items is empty, data is
  empty and .map(...).join('\n') silently produces an empty string menu_info
  (not caught/handled as a distinct "no menu" case).
Privacy/security notes: none — menu data is not customer PII. The route is
  unauthenticated (any caller can POST it) but this is consistent with every
  other per-tool Vapi route in this codebase (key-less, since Vapi itself is
  the only intended caller).
Known limitations: hardcoded VAT-inclusive footer message regardless of
  restaurant/locale; no pagination/limit (every active item is always
  returned in one response, which does not scale well as a voice-read-aloud
  payload if the menu grows large); no multilingual name/description field;
  category is a free-text string column on menu_items, not a foreign key to
  menu_categories (the two tables are not joined or kept in sync by this
  route).
```

### 1.2 `POST /api/vapi/get-item-details` (per-tool generation)

```
Route: src/app/api/vapi/get-item-details/route.ts
Payload shapes accepted: item_name|item|dish|product_name|menu_item|name,
  resolved via parseVapiPayload + getValueFromAliases (same shared helpers
  used by every other per-tool Vapi route in this codebase).
Required fields: item_name (one of its aliases). Missing -> 
  buildMissingFieldsResponse(['item_name']).
Old response shape: not found -> { message: "I couldn't find detailed
  information for this specific item. Please refer to the general menu or
  ask a staff member." } (success:true is implied by createVapiToolResponse's
  wrapper; there is no explicit success:false on this path). Found ->
  { name, price: "<price> <currency>", description (or a fallback string if
  empty), category, availability: "In Stock"|"Out of Stock", instruction:
  "Use this information to answer the guest..." }.
Old Supabase tables/queries: menu_items, .ilike('name', `%${item_name}%`),
  .limit(1).single() — first partial/case-insensitive substring match on
  name only, no restaurantId scoping (same global-table caveat as 1.1).
Whether it reads menu categories/items: items only, category is read as the
  item's free-text category column, not joined against menu_categories.
Whether it supports search/filter/category: only as a side effect of
  ilike substring matching on name — there is no category filter parameter,
  and no explicit fuzzy/Levenshtein matching, just SQL ILIKE.
Whether it supports item detail lookup: yes — this is the route's entire
  purpose, by (partial) name only. No lookup by id, no lookup by category +
  position, no multi-result disambiguation (limit(1) always picks one
  arbitrary match if multiple items share a substring).
Whether it exposes prices/allergens/descriptions: price (formatted string)
  and description yes; allergens/dietary tags: no such column exists.
Whether it has fallback/static text: yes — both for "not found" and for an
  empty description ("No detailed description available in the system.").
Privacy/security notes: none beyond 1.1's notes — no customer data is
  involved.
Known limitations: no multilingual item-name matching (a caller asking for
  a dish by its Turkish vs. English name with no aliasing data on the row
  will simply fail to match); ambiguous matches are silently resolved to
  "first match" rather than surfaced as ambiguous; no out-of-stock-aware
  fallback suggestion (it reports is_available as a binary "In Stock"/"Out
  of Stock" string but does not suggest a similar in-stock item).
```

### 1.3 Legacy dispatcher (`src/app/api/vapi/webhook/route.ts`) — conflicting behavior

The legacy `tool-calls` switch implements both tool names with **inferior,
less voice-friendly** behavior versus the per-tool routes above:

```
case 'get_menu_info' (lines ~198-208):
  -> supabase.from('menu_items').select('*').eq('is_available', true)
  Formats each row as "- {name} ({category}): {price}€. {description}" —
  note the currency symbol is hardcoded to "€" regardless of the row's own
  `currency` column (the per-tool route correctly uses `item.currency`).
  Fallback: 'Menu is currently empty.' if no rows — this is the *only* place
  across either generation that has an explicit "no menu" fallback string;
  the per-tool route (1.1) does not.
  No footer_message field at all (unlike the per-tool route's VAT notice).

case 'get_item_details' (lines ~210-218):
  -> supabase.from('menu_items').select('*').ilike('name', `%${args.item_name}%`).single()
  Returns the **raw Supabase row object directly** as `result` if found
  (id, name, category, price, currency, description, is_available,
  created_at, updated_at — every column, unfiltered) — this is a real,
  voice-assistant-unfriendly "raw DB-like" response, unlike the per-tool
  route's curated { name, price, description, category, availability,
  instruction } shape. If not found: { message: 'No details found for
  "${args.item_name}".' } — no instruction field, no missing-field check on
  args.item_name (a missing item_name produces `%undefined%` in the ILIKE
  pattern, which Postgres will happily run as a literal substring match
  that almost certainly returns nothing — a silent-failure-by-malformed-query
  bug, not a graceful missing-fields response).
```

**Conclusion:** the two production generations agree on the underlying
Supabase table (`menu_items`, no `restaurantId`) and the core query shape
(get-all-available / ilike-name-search), but disagree on response shape and
robustness. The per-tool generation is the more voice-friendly, defensible
contract (allowlisted fields, an explicit footer/instruction, an explicit
missing-fields check) and — consistent with every other Phase 26+ decision
in this codebase — is the one this document treats as the parity target if
a backend menu route is ever built; the legacy dispatcher's raw-row
"`get_item_details`" response in particular should **not** be propagated
into any backend route.

### 1.4 Admin UI dependency (new finding this phase)

Unlike the modify/cancel/handoff routes (which had no admin UI touching
their underlying tables), menu has a real, already-shipped admin surface:
`src/app/[lang]/admin/menu/actions.ts` (`getMenuItems`, `getCategories`,
`addCategory`, `deleteCategory`, `addMenuItem`, `updateMenuItem`), all
gated by `requireAdminSession`. This means `menu_items`/`menu_categories`
are not just Vapi-read tables — they are an actively staff-managed CRUD
surface today. Any backend menu model decision must also account for
**where staff manage the menu going forward**, not just where Vapi reads it
from; this materially raises the stakes of Option C below (see Section 3).

### 1.5 Underlying Supabase schema (for completeness)

```sql
-- supabase/migrations/20240511_menu_system.sql
menu_items: id (uuid), name (text), category (text, free-text, NOT a FK),
  price (decimal(10,2)), currency (text, default 'TRY'), description (text),
  is_available (boolean, default true), created_at, updated_at.

-- supabase/migrations/20240514_menu_categories.sql
menu_categories: id (uuid), name (text, unique), display_order (int),
  created_at. Not foreign-keyed from menu_items.category at all — the two
  tables are managed independently by the admin UI.
```

No `restaurantId` column on either table (single-tenant, matching the
"current repo facts to preserve" baseline noted in `AGENTS.md` — this
predates the multi-tenant migration entirely).

## 2. Backend model capability mapping

Inspected via CodeGraph (`backend/src/prisma/schema.prisma`,
`backend/src/routes/webhooks/vapi.ts`, and every existing `*Adapter.ts`
file under `backend/src/utils/vapi/`):

```
Backend supports menu route without schema change: no.
What data source would be used: none exists today. Restaurant,
  RestaurantSettings, IntegrationConnection, IntegrationEvent, and ToolLog
  were all inspected — none of them models a list of priced, categorized
  items. RestaurantSettings.openingHoursJson and IntegrationConnection.configJson
  are the only two free-form Json? columns on any tenant-scoped model, and
  neither is intended for unboundedly-growing structured catalog data (see
  Section 3, Option C, for why this matters).
What cannot be represented: individual menu items with name/category/price/
  currency/description/availability, each independently creatable/editable/
  orderable by staff; categories with sort order; multilingual names;
  voice-search aliases; allergen/dietary tags; per-item availability
  toggling without rewriting an entire JSON blob.
Risk level: Low *if deferred* (no schema/route exists to regress); Medium-
  High *if forced into an existing Json? column* (see Option C below) —
  unbounded growth, no per-item query/filter/index capability, no admin-UI
  story without a parallel JSON-editing UI that itself needs validation.
Recommended approach: defer real menu routes until a deliberate
  MenuCategory/MenuItem Prisma model (or an explicitly-scoped, validated
  JSON contract) exists — see Section 4.
```

Cross-checked against every existing backend Vapi adapter pattern
(`checkAvailabilityAdapter.ts`, `customerProfileAdapter.ts`,
`dateOpeningHoursAdapter.ts`, `callSummaryAdapter.ts`,
`handoffToStaffAdapter.ts`, `cancelReservationRequestAdapter.ts`,
`modifyReservationRequestAdapter.ts`): every one of them is a thin
read/write adapter over an **already-existing, purpose-built Prisma model**
(`RestaurantSettings`, `Customer`, `ReservationRequest`, `Reservation`,
`IntegrationEvent`). None of them invents a new "shape" of data inside a
generic `Json?` column the way Option C below would require for menu items
— this would be the first such precedent in the codebase, which is itself a
reason for caution, not just convenience.

## 3. Options analysis

### A. Defer menu routes until backend `MenuCategory`/`MenuItem` models are added

- Implementation complexity: none this phase (by definition).
- Data quality: unaffected — old routes keep serving accurate, currently-
  staff-maintained menu data.
- Admin UI requirements: none yet; existing `/admin/menu` keeps working
  unchanged.
- Migration requirements: none yet.
- Vapi parity quality: full parity is simply postponed, not degraded — the
  live assistant keeps using the existing, working routes.
- Risk of stale menu/prices: none introduced by this phase; whatever
  staleness exists today (if any) is unchanged.
- Cutover suitability: fully compatible with cutover of every *other* tool
  — menu routes can keep pointing at the Next.js app indefinitely without
  blocking the rest of the Vapi backend migration (see Section 7).

### B. Add backend `MenuCategory`/`MenuItem` Prisma models in a future phase

- Implementation complexity: medium — two new tenant-scoped models, a
  migration, CRUD routes/services for the future backend admin, a Vapi
  adapter pair, and (per Section 1.4's new finding) eventually a backend
  admin UI to replace `/admin/menu` so staff have one place to manage menu
  data rather than two divergent ones.
- Data quality: highest of all options — proper relational modeling
  (typed price/currency, real category FK, availability flag, indexable by
  restaurantId) supports search/filter without ad hoc JSON parsing.
- Admin UI requirements: a backend-admin `/backend-admin/menu` screen,
  mirroring the existing Supabase `/admin/menu` (see Section 1.4) —
  non-trivial but directly reuses the `RestaurantSettings`-style
  beta-admin pattern already established for other backend models.
- Migration requirements: a real data migration from `menu_items`/
  `menu_categories` (Supabase) into the new Prisma models, assigning
  `restaurantId` to every existing row (today there is exactly one
  implicit "tenant" — Golden Meat — so this is a 1:1 backfill, not a
  fan-out, but it must still be a deliberate, reviewed migration per
  `docs/05_MIGRATION_FROM_SUPABASE.md`'s general policy).
- Vapi parity quality: highest — once built, a backend adapter pair can
  match or exceed the per-tool routes' contract (Section 1.1/1.2), with
  proper tenant scoping the old global table never had.
- Risk of stale menu/prices: low once migrated (assuming the future admin
  UI actually replaces, not duplicates, staff's day-to-day menu editing —
  otherwise two systems can drift, the worst outcome).
- Cutover suitability: this is the option that actually enables cutover for
  these two tools — but only after the model, migration, and adapter work
  is done as deliberate, separately-scoped work (recommended as Phases 37–38,
  see Section 4).

### C. Store lightweight menu JSON in `RestaurantSettings` or `IntegrationConnection.configJson`

- Implementation complexity: low to add, but deceptively low — no schema
  migration is needed up front, but every consumer (Vapi adapter, any
  future admin UI) must hand-validate an unstructured `Json?` blob with
  application-level Zod schemas instead of the database enforcing shape,
  and every item-level operation (toggle one item's availability, add one
  item) requires reading and rewriting the *entire* JSON document — no
  per-item indexing or partial update.
- Data quality: lower — no per-item indexing (search/filter must happen in
  application code over the whole blob), no foreign-key integrity between
  "category" references and category definitions, easy for the JSON shape
  to drift across versions with no migration history to fall back on.
- Admin UI requirements: still needs a UI (a generic JSON editor is not an
  acceptable staff-facing experience for editing prices), so this option
  does not actually save UI effort versus Option B — it only defers the
  *schema* effort while keeping the *UI* effort, which is the worse trade.
- Migration requirements: same Supabase -> backend migration work as
  Option B, just landing in a `Json?` column instead of relational rows.
- Vapi parity quality: medium — can replicate the response shape, but
  every read pays an O(menu size) JSON parse/scan instead of an indexed
  query, which matters once a restaurant's menu grows past a trivial size.
- Risk of stale menu/prices: medium-high — without DB-level structure
  (unique item ids, required fields, types), it is easier for a bad write
  to silently corrupt the blob (e.g. a missing price field merged badly)
  with no constraint to catch it before it reaches Vapi.
- Cutover suitability: technically possible, but per `RestaurantSettings`'s
  own existing comment ("no relation field to Restaurant... only
  RestaurantUser carries an enforced FK") and `IntegrationConnection.configJson`'s
  intended purpose (provider-specific *integration config*, not
  restaurant-specific *catalog data*), neither column was designed for
  this and reusing them this way invites exactly the kind of scope-creep
  AGENTS.md's "no abstractions beyond what the task requires" principle
  warns against — except in the opposite direction (force-fitting catalog
  data into a column shaped for something else, rather than building an
  unnecessary abstraction).

### D. Implement menu routes as safe "menu not available / ask staff" responses until schema exists

- Implementation complexity: very low — two new backend routes with no
  data dependency, just a static, safe response shape.
- Data quality: none — by design, no real menu data is ever returned.
- Admin UI requirements: none.
- Migration requirements: none.
- Vapi parity quality: lowest — if the live assistant prompt actually
  relies on menu_info/get_item_details to answer guest questions (Section
  1.1/1.2 confirm both are real, currently-served tools, not stubs), a
  "not available" response is a **functional regression** versus the old
  routes the moment any Vapi traffic is pointed at this backend route
  instead of the old one. This option is only safe as a placeholder that
  is never actually wired to live Vapi traffic ahead of Option A/B/C — it
  protects against an incomplete migration accidentally going live with a
  half-built menu adapter, not a recommended end state.

## 4. Recommended target behavior

**Recommendation: Option A now (defer), Option B next (build real
`MenuCategory`/`MenuItem` models), explicitly reject Option C
(unstructured JSON) for this domain, and treat Option D as an
implementation safety net only — never a target end state.**

This validates the preferred recommendation stated in this phase's
instructions, confirmed (not just assumed) by the Section 1–3 inspection:

- Both old routes (Section 1.1/1.2) are real, currently-used, non-trivial
  tools — not legacy dead code — so "do not implement real menu routes
  until backend has explicit `MenuCategory`/`MenuItem` models" is the
  correct caution, not over-engineering: a half-built backend menu adapter
  that returns less than the old routes would be a regression the moment
  it received live traffic.
- The discovery that menu also has an active admin-managed CRUD surface
  (Section 1.4) — not just a Vapi-read table — strengthens the case against
  Option C specifically: an unstructured JSON blob makes the *next* phase's
  admin-UI work harder, not easier, compared to proper relational models.
- For production cutover, menu routes should **remain served by the old
  production Vapi routes** (`src/app/api/vapi/get-menu-info`,
  `get-item-details`) until Phase 37/38 land — Option D's "menu not
  available" response must never be pointed at live Vapi traffic as a
  substitute for real parity; it exists only as a defensive placeholder if
  a future phase needs to ship a route before data migration is complete
  (and even then, only with an explicit, documented decision to accept the
  regression for a bounded time).

Recommended future phases (as anticipated by this phase's instructions,
confirmed by this inspection):

- **Phase 37: Backend Menu Schema + Admin/API Foundation** — add
  `MenuCategory`/`MenuItem` Prisma models (Section 5), a migration, tenant-
  scoped CRUD service/routes for the future backend admin, and (per Section
  1.4) a `/backend-admin/menu` screen so staff have a real, single place to
  manage menu data once cutover happens — not just a backend data store with
  no UI.
- **Phase 38: Backend Vapi Menu Adapters** — `get-menu-info`/
  `get-item-details` adapters over the Phase 37 models, following the exact
  pattern established by every other Phase 27–35 adapter (pure
  extraction/response-builder functions in `backend/src/utils/vapi/`, a
  `ToolLog`-audited route in `backend/src/routes/webhooks/vapi.ts`), plus
  the Supabase -> backend data migration for existing `menu_items`/
  `menu_categories` rows.

## 5. Proposed backend menu schema (draft only — not implemented)

```txt
MenuCategory:
- id              String   @id @default(uuid())
- restaurantId    String
- name            String
- description     String?
- sortOrder       Int      @default(0)
- status          String   @default("active")   // active, archived
- createdAt       DateTime @default(now())
- updatedAt       DateTime @updatedAt
  @@unique([restaurantId, name])
  @@index([restaurantId, sortOrder])

MenuItem:
- id              String   @id @default(uuid())
- restaurantId    String
- categoryId      String?                          // nullable: an item can be
                                                     // uncategorized rather than
                                                     // forced into a placeholder
                                                     // category
- name            String
- description     String?
- price           Decimal                           // not Float — avoid binary
                                                     // floating-point rounding on
                                                     // money, consistent with the
                                                     // old Supabase `decimal(10,2)`
- currency        String   @default("TRY")
- allergensJson   Json?                             // array of strings, optional
- dietaryTagsJson Json?                             // array of strings, optional
- isAvailable     Boolean  @default(true)
- sortOrder       Int      @default(0)
- createdAt       DateTime @default(now())
- updatedAt       DateTime @updatedAt
  @@index([restaurantId, categoryId])
  @@index([restaurantId, isAvailable])
```

Additional considerations for Phase 37 to resolve explicitly (not decided
here, since this phase is deferred-decision-only per its own instructions):

- **Multilingual names/descriptions**: neither old Supabase table has any
  language column today (Section 1.5) — if multilingual menu support is
  wanted, Phase 37 should decide between (a) a `nameTranslationsJson`/
  `descriptionTranslationsJson` pair of `Json?` columns keyed by language
  code on `MenuItem` itself (lowest-friction, consistent with this schema's
  existing `Json?` precedent for non-relational sub-data), or (b) a separate
  `MenuItemTranslation` model (more normalized, more migration-friendly for
  per-language admin editing). Not pre-decided here.
- **Voice-search aliases**: Section 1.2 showed the old `get-item-details`
  relies entirely on a `name` substring match with no alias support — a
  caller asking for a dish by a colloquial/alternate name will fail to
  match today, and will continue to fail unless Phase 37/38 add an
  `aliasesJson: Json?` (array of strings) column to `MenuItem` for
  voice-search robustness. Flagged as a quality improvement, not a
  blocking requirement, since the old routes never had it either.
- **Availability/out-of-stock**: `isAvailable` (boolean) directly mirrors
  the old `menu_items.is_available` column — no new decision needed, this
  is a straight port.
- **Price currency**: `currency` directly mirrors the old column
  (`TRY` default) — no new decision needed.
- **Category filters**: `MenuItem.categoryId` (nullable FK to
  `MenuCategory`) is a structural improvement over the old free-text,
  unenforced `category` string column (Section 1.5) — Phase 37 should
  decide whether existing `menu_items.category` text values are migrated
  by exact-name match against `menu_categories.name` (likely, given the
  seed data in Section 1.5 already uses matching category names) or left
  unmatched (`categoryId: null`) where no match is found, with a manual
  admin cleanup pass afterward.
- **Migration from old Supabase tables**: Phase 37/38 should migrate
  `menu_categories` rows first (preserving `display_order` as `sortOrder`),
  then `menu_items` rows (resolving `categoryId` per the point above),
  assigning every row the single existing restaurant's `restaurantId` (no
  fan-out needed today — there is exactly one production restaurant).
- **Admin UI needs**: per Section 1.4's finding, this is not optional
  scope — staff already manage menu data through `/admin/menu` today, and
  Phase 37 should plan a `/backend-admin/menu` replacement (or at minimum a
  read-only mirror) as part of the same phase, not as an afterthought.

## 6. Future route behavior specification (draft only — not implemented)

### `POST /api/webhooks/vapi/:publicWebhookKey/get-menu-info`

```
Payload aliases: none required (matches the old route — Section 1.1).
  Optionally accept category|category_name|filter as an alias group for a
  future category-filtered variant, but this is additive, not required for
  parity.
Response shape (draft):
  {
    success: true,
    has_menu: boolean,            // false if zero active MenuItem rows exist
    categories: [
      { name: string, items: [ { name, price, currency, description,
        is_available } ] }
    ],
    message: string                // voice-friendly summary or "menu not
                                    // configured yet" fallback
  }
Missing-field behavior: none possible — no required input.
No raw DB object: every field above is allowlisted/curated, mirroring every
  existing adapter's toSafeXPayload-style convention (e.g.
  toSafeCustomerPayload in customerProfileAdapter.ts) — never a bare
  `prisma.menuItem.findMany()` result.
No full menu dump if too large: cap the number of items actually included
  per response (e.g. top N per category, or a category-summary-only mode
  when the full menu exceeds a configurable size) — exact threshold is a
  Phase 38 implementation decision, not pre-decided here, but the
  *requirement* that an unbounded dump must not be returned verbatim to a
  voice assistant is established now, consistent with Section 1.1's noted
  old-route limitation ("does not scale well as a voice-read-aloud
  payload").
ToolLog pattern: create "processing" before the query, update to
  "success"/"failure" after — identical convention to every other Phase
  27-35 route in backend/src/routes/webhooks/vapi.ts.
IntegrationEvent optional logging: not needed — this is a pure read, same
  rationale as check-availability/get-opening-hours (Phase 27/30) not
  logging an IntegrationEvent either.
Smoke test approach: same convention as the other read-only routes (Phase
  27's check-availability) — a pure-adapter unit test (no DB) plus a
  DB-backed integration test run via its own npm script, not wired into the
  default npm test (matching every *.integration.test.ts file's existing
  convention), plus an addition to scripts/smoke-backend-beta.sh's
  read-only checks if/when the route ships.
```

### `POST /api/webhooks/vapi/:publicWebhookKey/get-item-details`

```
Payload aliases: item_name|item|dish|product_name|menu_item|name (same
  alias group as the old route — Section 1.2, ported as-is for prompt
  compatibility).
Response shape (draft):
  Found (single unambiguous match):
    { success: true, found: true, name, price, currency, description,
      category, is_available, message }
  Found (multiple equally-plausible matches):
    { success: true, found: false, ambiguous: true,
      candidates: [string, ...] (names only, capped count), message:
      "I found a few items that might match — can you be more specific?" }
  Not found:
    { success: true, found: false, message: "I couldn't find that item on
      the menu. Please ask a staff member or check the full menu." }
Missing-field behavior: item_name (or an alias) missing -> 
  { success: false, missing_fields: ["item_name"] } — matches the old
  route's existing missing-fields contract exactly (Section 1.2), no
  deviation needed.
No raw DB object: never return the bare MenuItem row (explicitly rejecting
  the legacy dispatcher's raw-row response noted as a known limitation in
  Section 1.3) — always the curated shape above.
ToolLog pattern: identical convention to get-menu-info above.
IntegrationEvent optional logging: not needed, same rationale.
Smoke test approach: identical convention to get-menu-info above, plus an
  explicit ambiguous-match test case (the old routes never handled this —
  Section 1.2's "Known limitations" — so Phase 38 should add coverage for
  it as a genuine behavioral improvement over both old generations).
```

## 7. Cutover implications

- **The old assistant does depend on menu tools for real guest-facing
  answers** (Section 1.1/1.2 confirm both are live, non-trivial,
  currently-serving routes — not vestigial code). This means: **Vapi
  dashboard cutover for `get-menu-info`/`get-item-details` specifically
  remains blocked** until Phase 37/38 land a real backend equivalent.
- This does **not** block cutover of the other already-implemented tools
  (`create-reservation-request`, `check-availability`,
  `get-customer-profile`/`create-customer-profile`, `get-current-date`/
  `get-opening-hours`, `log-call-summary`, `handoff-to-staff`,
  `cancel-reservation-request`, `modify-reservation-request`) — per-tool
  Vapi dashboard configuration allows each tool to point at its own URL
  independently, so menu tools can keep pointing at
  `src/app/api/vapi/get-menu-info` / `get-item-details` while every other
  tool cuts over on its own schedule. This is the same "tool-by-tool, not
  all-or-nothing" cutover model already implied by Section E of
  `docs/backend-production-cutover-plan.md`.
- **If menu accuracy matters for the live assistant — and Section 1.1/1.2
  confirm it answers real price/description/availability questions — menu
  routes must not be cut over until real menu data exists in the backend**
  (Phase 37's migration), not just until a route exists that returns
  *some* response. An empty or stale backend menu would be a worse
  customer experience than simply not cutting over yet.
- **Explicit decision recorded here, before any dashboard URL switch**: menu
  tool cutover is deferred until Phase 37 (schema) and Phase 38 (adapters +
  data migration) are both complete and have passed the same real-payload
  parity comparison required of every other tool
  (`docs/backend-production-cutover-plan.md` Section E). No dashboard URL
  for any tool was changed by this phase.

## 8. Documentation created/updated

Created:

- `docs/vapi-menu-routes-decision-pack.md` (this file).

Updated:

- `docs/backend-vapi-webhook-parity-assessment.md` — added a "Phase 36"
  status section (Section 19) recording that menu routes are decision-ready
  on data source (defer + build real models), not implemented, pointing at
  this document.
- `docs/backend-production-cutover-plan.md` — added an explicit menu-route
  blocker/cutover note (a new dated subsection under Section E) stating
  menu tool cutover remains blocked pending Phase 37/38, independent of
  every other tool's own cutover status.

`docs/backend-beta-smoke-tests.md` was **not** modified — consistent with
Phase 32's precedent (Section 6 of
`docs/vapi-modify-cancel-handoff-decision-pack.md`): it already documents
that only currently-implemented write/read paths are smoke-tested, and
Section 6 above already specifies the smoke-test approach for when the
routes are actually built. Editing it now, ahead of any implementation,
would be speculative.

## 9. Checks performed

- `git diff --name-only` shows documentation files only (this file, plus
  the two updates listed in Section 8).
- No file under `src/app/api/vapi/*` was modified — `get-menu-info/route.ts`,
  `get-item-details/route.ts`, and `webhook/route.ts` were opened with a
  read-only tool and none were edited.
- No file under `/admin/*` (or any Next.js `[lang]/admin` route) was
  modified — `src/app/[lang]/admin/menu/actions.ts` was opened read-only
  for Section 1.4's finding and not edited.
- No Prisma schema or migration file was modified — `backend/src/prisma/schema.prisma`
  was only read (via CodeGraph) to confirm the model gap; Section 5's
  schema is a draft in this document only, not applied anywhere.
- No connection was made to Supabase or any live/production database — the
  two Supabase SQL migration files (Section 1.5) were read directly from
  the repository, not queried live.
- No production data was read, written, or touched.
- No Vapi dashboard URL or tool configuration was changed.
- CodeGraph was initialized/synced scoped to `backend/src` only (per this
  phase's explicit instruction), not run from the repository root.
- Menu Prisma models, adapters, and the legacy dispatcher cutover were not
  implemented — out of scope per this phase's instructions.

If any non-doc file changed during this phase, that would be a mistake
requiring explanation and review before proceeding — none did.

## 10. Report summary

- **CodeGraph findings**: `backend/src/routes/webhooks/vapi.ts` (1384
  lines) implements 10 Vapi tools today, all following one consistent
  adapter pattern (pure extraction/response-builder functions in
  `backend/src/utils/vapi/*Adapter.ts`, a `ToolLog`-audited Express route);
  no menu-related file exists anywhere under `backend/src`. The Prisma
  schema (`backend/src/prisma/schema.prisma`) has no `Menu`/`MenuCategory`/
  `MenuItem` model among its 16 models — confirmed directly, not inferred.
- **Old `get-menu-info` behavior**: returns the full active-item list,
  unconditionally, as one newline-joined formatted string, plus a static
  VAT footer — no search/filter/category support (Section 1.1).
- **Old `get-item-details` behavior**: single-item lookup by partial
  case-insensitive name match (SQL ILIKE) against `menu_items.name`, no id/
  category lookup, first-match-wins on ambiguity, with a curated response
  shape including a binary in-stock/out-of-stock string (Section 1.2). The
  legacy dispatcher's equivalent returns the raw, unfiltered DB row instead
  — explicitly rejected as a pattern to carry forward (Section 1.3).
- **Old Supabase menu table usage**: a single global (no `restaurantId`)
  `menu_items` table plus an unrelated (no FK) `menu_categories` table,
  both also actively managed by a staff-facing admin UI
  (`src/app/[lang]/admin/menu/actions.ts`) — a new finding this phase that
  raises the bar for any "lightweight JSON" shortcut (Section 1.4).
- **Backend capability mapping**: zero existing backend model can represent
  menu data without a schema change; the only two free-form `Json?` columns
  on any tenant-scoped model (`RestaurantSettings.openingHoursJson`,
  `IntegrationConnection.configJson`) are purpose-built for something else
  and are not a safe substitute (Section 2/3).
- **Recommended target approach**: defer now (Option A), build real
  `MenuCategory`/`MenuItem` Prisma models next (Option B, Phase 37), reject
  unstructured JSON storage for this domain (Option C), and treat a "menu
  not available" safe-fallback route (Option D) as an implementation safety
  net only, never a cutover target (Section 4).
- **Proposed future schema**: `MenuCategory` (id, restaurantId, name,
  description, sortOrder, status, timestamps) and `MenuItem` (id,
  restaurantId, categoryId?, name, description, price (Decimal), currency,
  allergensJson?, dietaryTagsJson?, isAvailable, sortOrder, timestamps) —
  draft only, not applied (Section 5).
- **Future route behavior spec**: curated, capped, allowlisted response
  shapes for both tools, explicitly rejecting the legacy dispatcher's raw-
  row pattern, plus a new ambiguous-match response for `get-item-details`
  that neither old generation has today (Section 6).
- **Cutover implications**: menu tool cutover remains blocked until Phase
  37/38 land; this does not block cutover of any of the nine other
  already-implemented Vapi tools, which can proceed independently
  (Section 7).
- **Docs created/updated**: this file (new);
  `docs/backend-vapi-webhook-parity-assessment.md` and
  `docs/backend-production-cutover-plan.md` (status notes appended);
  `docs/backend-beta-smoke-tests.md` intentionally not modified.
- **No code/runtime files were changed.** No `src/app/api/vapi/*`,
  `/admin/*`, Prisma schema/migration, Supabase connection, production
  data, or Vapi dashboard URL was touched.

Do not start Phase 37 until this Phase 36 decision pack is accepted.

## 11. Phase 37 status update

Phase 37 (Backend Menu Schema + Admin/API Foundation) has landed: real
`MenuCategory`/`MenuItem` Prisma models, tenant-scoped CRUD routes/services,
and a `/backend-admin/menu` beta UI now exist — see
`docs/backend-menu-foundation.md` for the implementation summary. This
**does not change any conclusion in this document**: `get-menu-info`/
`get-item-details` are still served entirely by the old Next.js/Supabase
routes, no Vapi adapter was implemented in Phase 37, and no
`menu_items`/`menu_categories` Supabase data was migrated. Section 7's
cutover-blocked status for these two tools remains unchanged and is
expected to be resolved by the still-pending Phase 38 (Vapi menu adapters +
data migration).
