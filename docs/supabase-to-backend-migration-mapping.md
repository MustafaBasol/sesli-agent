# Supabase → Backend Migration Mapping (Phase 21)

Assessment and planning only. No production data was read, exported, mutated, or migrated to
produce this document. All findings below come from static inspection of:

- `supabase/migrations/*.sql` (schema as defined in code, not a live DB introspection);
- `src/app/api/vapi/*` (Vapi tool routes that read/write Supabase);
- `src/app/[lang]/admin/*/actions.ts` (admin server actions that read/write Supabase);
- `backend/src/prisma/schema.prisma` (target Prisma schema);
- `backend/src/services/*` (target backend service layer, Phases 1–20).

No live Supabase connection was used. Where a detail cannot be confirmed from code (e.g. actual
row counts, whether `customers.phone_number` data is consistently E.164-formatted in production),
it is marked **UNKNOWN — requires live inspection**.

## 1. Inferred Supabase tables

| Table | Read in | Written in | Key fields | Category | Raw/sensitive payload | Production-critical |
|---|---|---|---|---|---|---|
| `calls` | `admin/calls/actions.ts`, `admin/dashboard/actions.ts`, `admin/analytics/actions.ts` | `api/vapi/log-call-summary`, `api/vapi/webhook` | `vapi_call_id`, `caller_phone`, `customer_name`, `language`, `intent`, `summary`, `outcome`, `started_at`, `ended_at`, `raw_payload`, `customer_id` | call | yes (`raw_payload` JSONB, caller phone) | yes |
| `reservation_requests` | `admin/reservations/actions.ts`, `admin/dashboard/actions.ts`, `admin/calendar/actions.ts`, `admin/customers/[id]/actions.ts` | `api/vapi/create-reservation-request` | `call_id`, `vapi_call_id`, `customer_name`, `phone_number`, `party_size`, `reservation_date`, `reservation_time`, `language`, `special_request`, `status`, `internal_note`, `raw_payload`, `customer_id`, `assigned_table_id` | reservation | yes (`raw_payload`, phone) | yes |
| `reservation_changes` | `admin/changes/actions.ts` | `api/vapi/modify-reservation-request` | `call_id`, `vapi_call_id`, `customer_name`, `phone_number`, `original_reservation_date/time`, `new_reservation_date/time`, `party_size`, `note`, `status`, `raw_payload` | reservation | yes | yes |
| `reservation_cancellations` | `admin/cancellations/actions.ts` | `api/vapi/cancel-reservation-request` | `call_id`, `vapi_call_id`, `customer_name`, `phone_number`, `reservation_date`, `reservation_time`, `reason`, `status`, `raw_payload` | reservation | yes | yes |
| `staff_handoffs` | `admin/handoffs/actions.ts` | `api/vapi/handoff-to-staff` | `call_id`, `vapi_call_id`, `customer_name`, `phone_number`, `reason`, `conversation_summary`, `urgency`, `status`, `raw_payload` | call/handoff | yes | yes |
| `tool_logs` | `admin/tool-logs/actions.ts` | every `api/vapi/*` route, `api/vapi/webhook` | `vapi_call_id`, `tool_name`, `request_payload`, `response_payload`, `status`, `error_message` | tool/log | yes (full request/response payload) | medium (debugging value, not user-facing) |
| `customers` | `admin/customers/actions.ts`, `admin/customers/[id]/actions.ts` | `api/vapi/create-customer-profile`, `api/vapi/create-reservation-request` | `phone_number` (unique), `full_name`, `total_reservations`, `last_visit_at`, `notes` | customer | phone number (PII) | yes |
| `tables` | `admin/tables/actions.ts`, `api/vapi/check-availability` | `admin/tables/actions.ts` | `table_number` (unique), `capacity`, `location`, `is_active` | settings | no | yes |
| `menu_items` | `admin/menu/actions.ts`, `api/vapi/get-menu-info`, `api/vapi/get-item-details` | `admin/menu/actions.ts` | `name`, `category`, `price`, `currency`, `description`, `is_available` | settings/menu | no | medium (used live by Vapi calls) |
| `menu_categories` | `admin/menu/actions.ts` | `admin/menu/actions.ts` | `name` (unique), `display_order` | settings/menu | no | low |
| `restaurant_settings` | `admin/settings/actions.ts`, `api/vapi/get-opening-hours`, `api/vapi/check-availability` | `admin/settings/actions.ts` | `day_of_week` (unique), `open_time`, `close_time`, `is_closed`, `last_reservation_offset_minutes` | settings | no | yes (drives availability logic) |
| `blackout_dates` | `admin/settings/actions.ts`, `api/vapi/check-availability` | `admin/settings/actions.ts` | `date` (unique), `reason` | settings | no | medium |
| `restaurant_rules` | `admin/settings/actions.ts`, `api/vapi/check-availability` | `admin/settings/actions.ts` | `key` (unique), `value`, `description` | settings | no | medium |
| `orders` | `admin/customers/[id]/actions.ts` (UNKNOWN — confirm usage) | UNKNOWN — no Vapi route writes orders; likely admin-only or unused | `reservation_id`, `customer_id`, `item_name`, `quantity`, `unit_price`, `total_price` | customer history | no | low — UNKNOWN whether actively used |

Notes:
- `calls.customer_id`, `reservation_requests.customer_id`, `reservation_requests.assigned_table_id`
  were added by later migrations (`20240510_crm_tables.sql`, `20240513_customer_history_and_orders.sql`).
- RLS (`20260525_rls_security.sql`) denies all anon/public access; all reads/writes happen through
  the service-role key on the server. This does not change the migration approach but confirms no
  client-side Supabase access exists to additionally audit.

## 2. New backend Prisma models (relevant subset)

Source: `backend/src/prisma/schema.prisma`.

| Model | Tenant field | Unique constraints | Notable enums/status fields | Fields requiring generation | Fields requiring transform |
|---|---|---|---|---|---|
| `Organization` | n/a (tenant root) | — | `status` | `id` (uuid) | — |
| `Restaurant` | `organizationId` | `[organizationId, slug]` | `status` | `id`, `slug` | — |
| `Customer` | `restaurantId` | `[restaurantId, normalizedPhone]` | — | `id`, `normalizedPhone` | `phoneNumber` → E.164 → `normalizedPhone` |
| `RestaurantTable` | `restaurantId` | `[restaurantId, tableNumber]` | `isActive` | `id` | — |
| `ReservationRequest` | `restaurantId` | none (no natural unique key) | `status`: `new, pending_info, confirmed, rejected, cancelled, done` (no `seen`) | `id`, `channel="voice"`, `provider="vapi"` | `status` (`seen`→`new`), date/time parsing, `sourceExternalId`=`vapi_call_id` |
| `Reservation` | `restaurantId` | none | `status`: `pending, confirmed, cancelled, no_show, completed` | `id`, `sourceChannel` | derived from confirmed `ReservationRequest`s only — no direct old equivalent |
| `Conversation` | `restaurantId` | `[restaurantId, channel, provider, externalThreadId]` | `status`: `open, pending, closed, archived` | `id`, `externalThreadId`=`vapi_call_id` | built from `calls`, not a 1:1 table |
| `Message` | `restaurantId` | none | `direction`, `senderType`, `status` | `id` | built from `calls`/`tool_logs` content, not a 1:1 table |
| `IntegrationConnection` | `restaurantId` | `publicWebhookKey` | `status`: `inactive, active, error` | `id`, `publicWebhookKey` (random) | credentials must be re-entered, see §3.I |
| `OutboundMessage` | `restaurantId` | none | `status`: `queued, sent, failed, delivered` | `id` | no old equivalent (new SMS/WhatsApp feature) |
| `MessageTemplate` | `restaurantId` | `[restaurantId, channel, templateKey, language]` | — | `id` | no old equivalent |
| `AutomationRule` | `restaurantId` | `[restaurantId, triggerKey, channel, templateKey]` | — | `id` | no old equivalent |
| `ToolLog` | `restaurantId` (nullable) | none | — | `id` | `vapi_call_id`→`externalCallId`, needs `restaurantId` backfilled (old table has none) |
| `IntegrationEvent` | `restaurantId` (nullable) | none | — | `id` | no old equivalent — could host `staff_handoffs`/`reservation_changes`/`reservation_cancellations` history if chosen |

Confirmed from `backend/src/services/restaurantSettingsService.ts` (Phase 18 comment): `Restaurant`
has **no** `openingHours`, `city`, `country`, `currency`, or reservation-default columns. This is an
explicit, already-documented gap — do not invent destination fields for `restaurant_settings`,
`blackout_dates`, `restaurant_rules`, `menu_items`, or `menu_categories` data.

Confirmed from `backend/src/services/vapiReservationService.ts`: the live backend Vapi reservation
flow already implements the `Customer` upsert → `Conversation`/`Message` (if `callId` present) →
`ReservationRequest` create pattern. This is the reference implementation for how historical
`calls`/`reservation_requests` rows should be re-shaped during migration.

## 3. Mapping table

Legend for **Transform needed**: `none` / `normalize` / `parse` / `derive` / `manual` / `n/a (new feature)`.

### A) Organization / Restaurant identity

| Old source.field | New model.field | Transform | Required? | Risk/notes |
|---|---|---|---|---|
| (none — implicit single restaurant) | `Organization.name` = "Golden Meat Group" | manual | yes | Already seeded in `backend/src/prisma/seed.ts`; do not duplicate. |
| (none) | `Restaurant.name`/`slug` = "Golden Meat"/"golden-meat" | manual | yes | Already seeded. Real migration only needs to confirm this restaurant row exists, not create a second one. |
| Supabase env config (opening hours via `restaurant_settings`) | none yet | n/a | no | No `Restaurant.openingHours` field exists; see §4.C. |
| Supabase env config (phone/email/address, if set anywhere) | `Restaurant.phone/email/address` | normalize | no | UNKNOWN whether old app stores restaurant-level contact info anywhere in DB vs hardcoded — confirm before assuming a source. |

### B) Customers

| Old source.field | New model.field | Transform | Required? | Risk/notes |
|---|---|---|---|---|
| `customers.phone_number` | `Customer.phoneNumber` | none (copy as-is) | yes | Keep original format for display/audit. |
| `customers.phone_number` | `Customer.normalizedPhone` | normalize (E.164) | yes | Required for the `[restaurantId, normalizedPhone]` unique constraint; old table has no normalized column, so this must be derived. Ambiguous local numbers without country code are a manual-decision risk (§4.D). |
| `customers.full_name` | `Customer.fullName` | none | no | — |
| `customers.total_reservations` | `Customer.totalReservations` | none | no | Could instead be recomputed post-migration from migrated `ReservationRequest`/`Reservation` rows for accuracy — manual decision. |
| `customers.last_visit_at` | `Customer.lastVisitAt` | none | no | — |
| `customers.notes` | `Customer.notes` | none | no | — |
| (none) | `Customer.restaurantId` | derive (= seeded Golden Meat restaurant id) | yes | Single-tenant migration: every row gets the same restaurant id. |
| (none) | `Customer.email`, `instagramHandle`, `whatsappId` | n/a (new feature) | no | No old source; leave null. |
| duplicate `phone_number` rows (old table has a DB-level `UNIQUE` constraint already) | — | — | — | Old schema already enforces uniqueness by phone, so duplicate-by-phone collisions are unlikely. Duplicate-by-name with different phone formats (e.g. with/without spaces) are still possible — see §4.D. |

### C) Reservations (requests)

| Old source.field | New model.field | Transform | Required? | Risk/notes |
|---|---|---|---|---|
| `reservation_requests.customer_name` | `ReservationRequest.customerName` | none | yes | — |
| `reservation_requests.phone_number` | `ReservationRequest.phoneNumber` + derived `normalizedPhone` | normalize | yes | Same normalization as Customer. |
| `reservation_requests.party_size` | `ReservationRequest.partySize` | none | yes | — |
| `reservation_requests.reservation_date` (DATE) + `reservation_time` (TIME) | `ReservationRequest.reservationDate` (DateTime) + `reservationTime` (String) | parse | yes | Old `DATE`/`TIME` columns must combine cleanly into the new `DateTime` + string-time pair; confirm timezone assumption (old DB stored naive date/time with no explicit tz column — assume restaurant-local time, matching `Restaurant.timezone = Europe/Paris` default, but the live deployment may use Turkey time given "TRY" currency in menu seed — **UNKNOWN, requires manual confirmation before any date migration**). |
| `reservation_requests.language` | `ReservationRequest.language` | none | no | — |
| `reservation_requests.special_request` | `ReservationRequest.specialRequest` | none | no | — |
| `reservation_requests.status` (`new, seen, confirmed, rejected, cancelled, done`) | `ReservationRequest.status` (`new, pending_info, confirmed, rejected, cancelled, done`) | normalize | yes | `seen` has no direct equivalent — map to `new` (manual decision in §4.D) or extend the enum's *allowed values* (not the schema) if staff rely on "seen vs not seen" distinction operationally. |
| `reservation_requests.internal_note` | `ReservationRequest.internalNote` | none | no | — |
| `reservation_requests.raw_payload` | `ReservationRequest.rawPayload` | none (copy JSONB→Json) | no | See §4.D — raw payload policy. |
| `reservation_requests.vapi_call_id` | `ReservationRequest.sourceExternalId` | none (rename) | yes | Also set `channel="voice"`, `provider="vapi"` (constants, not present in old schema). |
| `reservation_requests.call_id` (FK to `calls`) | `ReservationRequest.conversationId` | derive | no | Only resolvable if the corresponding `calls` row is migrated to a `Conversation` first — establishes migration order dependency (§5). |
| `reservation_requests.customer_id` | `ReservationRequest.customerId` | derive | yes (if present) | Must resolve to the *new* `Customer.id` generated during customer migration, not the old uuid. |
| `reservation_requests.assigned_table_id` | `ReservationRequest.assignedTableId` (UNKNOWN — field does not exist on `ReservationRequest` in current schema; only `Reservation.assignedTableId` exists) | manual | no | **Gap**: schema.prisma's `ReservationRequest` model has no `assignedTableId` field. Confirm whether table assignment belongs on `Reservation` only, or whether this is a schema gap to raise before migrating. |
| (none) | `ReservationRequest.restaurantId` | derive | yes | Single seeded restaurant id. |

### D) Tables

| Old source.field | New model.field | Transform | Required? | Risk/notes |
|---|---|---|---|---|
| `tables.table_number` | `RestaurantTable.tableNumber` | none | yes | Backend seed (`backend/src/prisma/seed.ts`) already created 6 default tables (`1`–`6`) with different numbering than old seed (`T1`–`T5`). **Conflict risk**: migrating old tables verbatim will create a second, differently-named set of tables rather than merging with the seeded ones — must decide whether to keep seeded tables, replace them, or reconcile by capacity/location (manual decision, §4.D). |
| `tables.capacity` | `RestaurantTable.capacity` | none | yes | — |
| `tables.location` | `RestaurantTable.location` | none | no | — |
| `tables.is_active` | `RestaurantTable.isActive` | none | no | — |
| (none) | `RestaurantTable.restaurantId` | derive | yes | — |

### E) Calls / Vapi logs / tool logs

| Old source.field | New model.field | Transform | Required? | Risk/notes |
|---|---|---|---|---|
| `calls.vapi_call_id` | `Conversation.externalThreadId` | none (rename) | yes (if migrating calls) | Also set `channel="voice"`, `provider="vapi"`. |
| `calls.caller_phone` | `Conversation.customerPhone` | none | yes | — |
| `calls.customer_name` | `Conversation.customerName` | none | no | — |
| `calls.summary`/`outcome`/`intent` | `Conversation.lastMessagePreview` or a `Message.messageText` | derive | no | No 1:1 field; must be synthesized into a summary message, matching the pattern already used in `vapiReservationService.ts`. |
| `calls.started_at`/`ended_at` | `Conversation.lastMessageAt` (approX.) / no exact equivalent | derive | no | Backend has no explicit call-duration fields; information would be lossy unless kept in `rawPayload`. |
| `calls.raw_payload` | `Message.rawPayload` (on a synthesized message) or `ToolLog.responsePayload` | manual | no | See raw-payload policy below. |
| `calls.customer_id` | `Conversation.customerId` | derive | no | Resolve to new `Customer.id`. |
| `tool_logs.vapi_call_id` | `ToolLog.externalCallId` | none (rename) | no | — |
| `tool_logs.tool_name`/`request_payload`/`response_payload`/`status`/`error_message` | `ToolLog.toolName`/`requestPayload`/`responsePayload`/`status`/`errorMessage` | none | no | Direct 1:1 field match — easiest table to migrate mechanically. |
| (none) | `ToolLog.restaurantId` | derive | recommended | Old `tool_logs` has no restaurant scoping (table predates multi-tenancy); must backfill with the seeded restaurant id or leave null per current nullable schema. |

**Raw payload policy (manual decision required, not decided by this assessment):** old tables
store full Vapi JSON payloads in `raw_payload`/`request_payload`/`response_payload`. These may
contain caller phone numbers and full transcripts. Recommendation to put to the user/stakeholder:
migrate raw payloads only for `tool_logs` (operationally low-risk, already isolated), and for
`calls`/`reservation_requests` either (a) migrate raw payload as-is into the new `rawPayload` JSON
column (same sensitivity class, no new exposure), or (b) summarize and drop the raw payload to
reduce stored PII. This document does not decide which.

### F) Conversations / messages

Old schema has no dedicated message/transcript table — `calls.summary`/`raw_payload` are the only
transcript-like data. Mapping to `Conversation`+`Message` is therefore a **derive**, not a direct
copy: one `Conversation` per `calls` row (keyed by `vapi_call_id`), with at most one synthesized
inbound `Message` carrying the summary/payload. This mirrors the pattern in
`vapiReservationService.ts`. If this is judged not worth the engineering effort for historical data,
old calls can instead be left out of `Conversation`/`Message` entirely and only migrated into a
read-only legacy archive (see §4.C).

### G) Changes / cancellations / handoffs

| Old source | New destination options | Recommendation (not a decision made here) |
|---|---|---|
| `reservation_changes` | `ReservationRequest` with `requestType="change"` (new row) referencing original via `sourceExternalId`/`rawPayload`, **or** `IntegrationEvent` with `eventType="reservation_change"` | Schema already anticipates this exact case (`docs/02_TARGET_DATABASE_SCHEMA.md` migration note + `ReservationRequest.requestType` enum literally lists `change`). Recommend `ReservationRequest` row per change, but this duplicates `reservation_date`/`time` semantics (old/new) that `ReservationRequest` doesn't model — likely needs `internalNote` or `rawPayload` to carry the "original" date/time. Manual decision. |
| `reservation_cancellations` | `ReservationRequest` with `requestType="cancel"`, **or** mark the original `Reservation`/`ReservationRequest.status="cancelled"` directly | Same ambiguity as above — does the team want full cancellation history as separate rows, or just a status flip on the original record? Manual decision. |
| `staff_handoffs` | `Conversation`+`Message` (if linked to a call) and/or `IntegrationEvent` (`eventType="staff_handoff"`) | No `StaffHandoff` model exists yet (the existing `docs/05_MIGRATION_FROM_SUPABASE.md` already flags "optional `StaffHandoff` later"). Until that model exists, `IntegrationEvent` is the only structured destination; `urgency`/`reason`/`conversation_summary` would go into its `payload` JSON, losing first-class queryability. **Gap — flag for backend schema before migrating.** |

### H) Menu / settings

| Old source | New destination | Status |
|---|---|---|
| `menu_items`, `menu_categories` | none | **Not migratable yet.** No `MenuItem`/`MenuCategory` Prisma model exists. Do not invent one. |
| `restaurant_settings` (opening hours), `blackout_dates`, `restaurant_rules` | none | **Not migratable yet.** Confirmed by `restaurantSettingsService.ts` comment: `Restaurant` has no opening-hours/reservation-defaults columns. |
| `orders` | none | **Not migratable yet**, and usage is itself unconfirmed (UNKNOWN whether any live admin page actively writes/reads `orders` beyond the migration that created it). |

These three areas are explicitly deferred to a future phase per the task's own instruction ("If no
destination exists, mark as future phase. Do not invent a migration target unless model exists.").

### I) Integrations

| Old source | New destination | Transform | Notes |
|---|---|---|---|
| Vapi assistant/webhook config (env vars / Vapi dashboard, not in Supabase) | `IntegrationConnection` (channel=`vapi`, provider=`vapi`) | manual | No plaintext secret exists in Supabase to migrate — Vapi credentials live in env vars/Vapi's own dashboard today. Per AGENTS.md rule 6/"Do not change Vapi dashboard URLs", and this phase's instruction not to store real secrets in docs, the only safe action is: document that the production `IntegrationConnection` row must be created/edited through the backend UI with credentials re-entered by a human, encrypted via `backend/src/utils/encryption.ts` (`credentialsEncrypted` column, never plaintext). The existing dev seed row (`publicWebhookKey: "dev_vapi_golden_meat"`) carries no secret and must not be reused for production. |
| Any other provider env vars (SMS/WhatsApp/Instagram, if configured anywhere historically) | `IntegrationConnection` (other channels) | manual | UNKNOWN — no evidence found of WhatsApp/Instagram/SMS provider config in Supabase; these are net-new per AGENTS.md scope and have no migration source. |

No plaintext credential value appears in this document, in line with the task's "never migrate
plaintext secrets into docs" rule.

## 4. Gaps and blockers

### A) Directly migratable (low risk)
- `tool_logs` → `ToolLog` (field-for-field rename, optional `restaurantId` backfill).
- `tables` → `RestaurantTable` (field-for-field, but see table-number conflict in §3.D).
- `menu_categories`/`menu_items`/`restaurant_settings`/`blackout_dates`/`restaurant_rules` are
  **not** in this category — they have no destination (see §4.C).

### B) Migratable with transformation
- Phone normalization (`customers.phone_number`, `reservation_requests.phone_number`, etc. → `normalizedPhone`).
- Date/time parsing (`DATE`+`TIME` columns → single `DateTime` + time string), pending timezone confirmation.
- Status mapping (`reservation_requests.status` `seen`→ no direct target).
- `calls`/`tool_logs` raw payload carried through as `Json` (same shape, JSONB→Prisma `Json`).
- Customer matching/dedup by phone before assigning `normalizedPhone` unique key.

### C) Not migratable yet (no backend destination)
- `menu_items`, `menu_categories` — no Prisma model.
- `restaurant_settings`, `blackout_dates`, `restaurant_rules` — no `Restaurant` fields for these.
- `orders` — no Prisma model, and usage itself is unconfirmed.
- Call audio/recordings — not stored in Supabase schema at all (no column for a recording URL was
  found), so this is moot, not a blocker.
- Detailed per-change/per-cancellation audit trail as distinct rows — `IntegrationEvent` can hold
  them but with materially less structure than the old dedicated tables (§3.G).

### D) Requires manual decision (stakeholder, not engineering)
- Whether to migrate `raw_payload`/`request_payload`/`response_payload` verbatim or summarize/redact.
- Whether historical `calls` become `Conversation`+`Message` rows or are left in a legacy archive.
- Whether `reservation_changes`/`reservation_cancellations` become new `ReservationRequest` rows
  (`requestType=change/cancel`) or just status updates on the original record.
- Whether old `status="seen"` requests map to `new` or need a schema/enum extension.
- Whether duplicate customers (same person, slightly different phone formatting or name spelling)
  should be merged, and by what rule.
- Whether to keep the backend's seeded tables (`1`–`6`) or replace them with the old `T1`–`T5` set,
  or reconcile by capacity.
- Whether `Customer.totalReservations` is copied as-is or recomputed from migrated reservation rows.
- Whether `staff_handoffs` deserves a first-class `StaffHandoff` Prisma model before migration
  (current backend has no such model — see §3.G).

### E) Production cutover blockers
- No Supabase export script/strategy exists yet (this phase intentionally does not create one beyond a documented dry-run plan).
- No import/migration script exists yet (`backend/scripts/import-supabase-data.ts` from
  `docs/05_MIGRATION_FROM_SUPABASE.md` Stage 3 has not been built).
- `ReservationRequest` has no `assignedTableId` field — gap to resolve before migrating
  `reservation_requests.assigned_table_id` (§3.C).
- No `StaffHandoff` model — gap to resolve before migrating `staff_handoffs` with full fidelity.
- Timezone of stored old `DATE`/`TIME` values is unconfirmed (Europe/Paris default vs Turkey
  operations implied by `TRY` currency in the menu seed) — must be confirmed against the live
  Supabase project/Vapi assistant config before any date migration, otherwise reservations could
  shift by hours.
- No automated count/consistency-check tooling exists yet (planned in the dry-run document, §
  "Dry-run strategy" below).

## 5. Migration order proposal

1. Back up Supabase (export, not delete/alter).
2. Back up backend PostgreSQL (pg_dump or managed snapshot).
3. Freeze or snapshot old production data (read-only window or point-in-time export).
4. Confirm Organization + Restaurant already exist (`backend/src/prisma/seed.ts` — "Golden Meat
   Group" / "golden-meat"); do not create a second one.
5. Reconcile and migrate `tables` → `RestaurantTable` (resolve seeded-table conflict from §3.D first).
6. Migrate `customers` → `Customer` (normalize phone, dedupe).
7. Migrate `reservation_requests` → `ReservationRequest` (requires customers + tables migrated first
   for `customerId`/table-assignment resolution).
8. Derive confirmed `Reservation` rows from `reservation_requests` where `status="confirmed"` (or
   from a separate confirmed-reservations source, if one exists beyond `reservation_requests` —
   UNKNOWN, the current schema does not show a distinct "reservations" table in Supabase, only
   `reservation_requests`; confirm this before assuming `Reservation` rows must be derived rather
   than directly sourced).
9. Migrate `calls` → `Conversation`/`Message` if the raw-payload/legacy-archive decision (§4.D)
   favors full migration; otherwise skip per that decision.
10. Migrate `tool_logs` → `ToolLog` (independent of the above, can run anytime after step 4).
11. Resolve `reservation_changes`/`reservation_cancellations`/`staff_handoffs` per the manual
    decisions in §4.D and §3.G, after their referenced `calls`/`reservation_requests` are migrated.
12. Do not migrate `IntegrationConnection` credentials automatically — re-create/re-enter via the
    backend integrations UI with encryption, per §3.I.
13. Run consistency checks (counts, FK integrity, tenant scoping, sensitive-field leak check) —
    see `docs/supabase-to-backend-dry-run-plan.md`.
14. Run the existing beta smoke test pack (`docs/backend-beta-smoke-tests.md`) against the migrated
    data.
15. Keep old `/[lang]/admin/*` available as a fallback until the new backend is the sole writer.

This order matches and slightly expands the staged plan already in
`docs/05_MIGRATION_FROM_SUPABASE.md` (Stages 1–6) and does not contradict it.
