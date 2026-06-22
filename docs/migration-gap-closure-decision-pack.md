# Migration Gap Closure Decision Pack (Phase 22)

This document is **planning and decision support only**. It does not implement schema changes,
does not write migration/import scripts, does not connect to Supabase, and does not touch
production data, `/admin/*`, or `src/app/api/vapi/*`.

It builds directly on the findings in `docs/supabase-to-backend-migration-mapping.md` (Phase 21)
and proposes a concrete, reviewable path to close each open gap before a real Supabase → backend
migration is attempted.

Methodology: every recommendation below was checked against the current backend code
(`backend/src/prisma/schema.prisma`, `backend/src/services/*.ts`, `backend/src/routes/webhooks/vapi.ts`)
as of this phase, not assumed. Where the code already implies an answer, that is called out
explicitly so the recommendation isn't speculative.

---

## 1. ReservationRequest table assignment

**Problem statement**: Old Supabase `reservation_requests` can carry `assigned_table_id`
(added in `supabase/migrations/20240510_crm_tables.sql`), but backend `ReservationRequest` has no
`assignedTableId` field. `Reservation` already has one (`backend/src/prisma/schema.prisma:164`).

**Existing Supabase source table(s)**: `reservation_requests.assigned_table_id`, `tables`.

**Current backend model status**: `ReservationRequest` — no table field. `Reservation` — has
`assignedTableId String?`, settable via `updateReservation` (`backend/src/services/reservationService.ts:190`).

**Why it blocks/affects migration**: a pending (not-yet-confirmed) old request that already has a
table pencilled in has nowhere to put that value on import without a schema change.

**Code evidence**: `confirmReservationRequestWithReservation`
(`backend/src/services/reservationRequestService.ts:166-194`) creates the `Reservation` row
**without** `assignedTableId` — table assignment is applied afterwards via a separate
`PATCH`/`updateReservation` call. The backend's own confirmed-flow already treats table
assignment as a *post-confirmation* operational step, not a property of the request.

**Options**:
- A) Add `assignedTableId` to `ReservationRequest`.
- B) Only assign tables after confirmation, in `Reservation` (matches current backend behavior).
- C) Store requested/preferred table info in `internalNote`/a new `note` field only (no FK, no conflict checking).
- D) Defer and accept table-assignment loss for pending requests.

**Recommended option**: **B**.

**Pros**: zero schema change; matches the pattern the backend already implements end-to-end;
avoids holding a table reservation against a request that might still be rejected; table-conflict
checking only ever needs to run against confirmed `Reservation` rows, which is simpler.

**Cons**: an old *pending* request's table preference, if any existed, cannot be imported onto the
new `ReservationRequest` row — it can only be preserved as free text (see Option C as a
supplement) or dropped.

**Required schema/API/UI changes if accepted**: none for B itself. Optionally, also adopt C as a
non-blocking text-preservation step: copy old `assigned_table_id`'s resolved table number into
`ReservationRequest.internalNote` (e.g. `"Legacy preferred table: T3"`) for any request still
`pending`/`new` at export time, so the information isn't silently lost — purely additive, no FK.

**Migration impact**: confirmed old requests migrate cleanly (table assignment moves with them
onto the `Reservation` row created during import, mirroring step order in
`docs/supabase-to-backend-migration-mapping.md` §5). Pending requests lose structured table data
unless the optional note-preservation step is taken.

**Risk level**: Low.

**Must solve before migration, or can defer?**: **Can defer** — the existing schema already
supports the dominant case (confirmed reservations). Only the note-preservation supplement is
worth doing before migration; it is a one-line addition to the (not-yet-written) import logic, not
a schema change.

---

## 2. Staff handoff

**Problem statement**: Old Supabase `staff_handoffs` records calls escalated to a human; backend
has no `StaffHandoff` model.

**Existing Supabase source table(s)**: `staff_handoffs` (see `supabase/migrations/20240509_init.sql`).

**Current backend model status**: No dedicated model. Closest existing models: `IntegrationEvent`
(`restaurantId` nullable, generic `eventType`/`status`/`payload`,
`backend/src/prisma/schema.prisma:335-349`) and `Conversation`/`Message`. The webhook route
`POST /:publicWebhookKey/handoff-to-staff` is a literal stub returning `501`
(`backend/src/routes/webhooks/vapi.ts:166`).

**Why it blocks/affects migration**: handoffs are operational — they typically need staff
follow-up, not just a historical record. Mapping them to a generic log loses that operational
quality unless paired with admin UI.

**Options**:
- A) Add a dedicated `StaffHandoff` model.
- B) Map handoffs to `ToolLog`.
- C) Map handoffs to `IntegrationEvent`.
- D) Map handoffs to `Conversation`/`Message` (e.g. a system message marking handoff + conversation status change).
- E) Archive only, do not migrate into the operational backend.

**Recommended option**: **D for the live/future flow, E for historical migration.**

**Reasoning**: a handoff is fundamentally "this conversation needs a human" — it is conversation
state, not a standalone log line. `Conversation.status` already has an `open/pending/closed/archived`
vocabulary that a `"handoff"` status (or `assignedToUserId` set + a system `Message`) fits
naturally, and it shows up in the existing conversation timeline UI for free, satisfying the "do
they need to affect the conversation timeline" question below without a new model. For the
*historical* Supabase rows (calls that already happened, no longer need follow-up), there is no
operational value in modeling them as live, actionable handoffs — archiving them (Option E, e.g.
as `IntegrationEvent` rows with `eventType: "legacy_staff_handoff"`) is sufficient and avoids
inventing fake "open" handoffs against restaurant state that no longer reflects reality.

**Pros**: no new model for the common case; reuses existing Conversation timeline UI; historical
data isn't lost, just correctly marked non-actionable.

**Cons**: if product later needs handoff-specific fields (reason code, assigned staff member,
resolved-at timestamp, SLA tracking) that don't fit naturally on `Conversation`/`Message`, a
dedicated `StaffHandoff` model (Option A) will be needed anyway — this defers, not eliminates,
that possibility.

**Required schema/API/UI changes if accepted**: implement the real `handoff-to-staff` webhook
handler (currently `501`) to create/update a `Conversation` (status → e.g. `"pending"` or a new
`"handoff"` value) plus a system `Message`; no schema change required. For historical migration,
write `staff_handoffs` rows into `IntegrationEvent` with `eventType: "legacy_staff_handoff"`.

**Migration impact**: historical handoffs become inert audit records (`IntegrationEvent`), not
live operational items — correct, since the underlying calls are already over.

**Risk level**: Low for migration; **Medium** for the live webhook (it's currently unimplemented,
which is a functional gap independent of migration — see §8).

**Must solve before migration, or can defer?**: **Can defer** for migration purposes (Option E is
trivial). Implementing the live handoff webhook (Option D) is a **cutover-readiness** item, not a
migration-safety item — see §8.

---

## 3. Menu data

**Problem statement**: Old Supabase has `menu_items` and `menu_categories` with seeded Golden Meat
data; backend has no menu model at all.

**Existing Supabase source table(s)**: `menu_items`, `menu_categories`
(`supabase/migrations/20240511_menu_system.sql`, `20240514_menu_categories.sql`).

**Current backend model status**: none. Confirmed via grep — no `MenuItem`/`MenuCategory` model in
`schema.prisma`, and `restaurantSettingsService.ts` explicitly documents that only fields that
actually exist on `Restaurant` are exposed (no menu-adjacent fields exist).

**Why it blocks/affects migration**: only if something downstream actually reads menu data today.

**Code evidence**: nothing in `backend/src` or the current `create-reservation-request` Vapi flow
reads or references menu data — the only "menu" mentions in this repo are the Supabase
migrations/seed data themselves. The current Vapi assistant flow (`vapiReservationService.ts`) is
reservation-only; there is no evidence the Vapi assistant prompts for or returns menu items as
part of reservation intake.

**Options**:
- A) Add backend `MenuCategory`/`MenuItem` models now.
- B) Keep menu in old Supabase/legacy for now.
- C) Move menu to static content/config (no DB at all).
- D) Do not migrate menu yet.

**Recommended option**: **B + D** (defer; leave menu in Supabase legacy, do not migrate).

**Pros**: zero new schema; zero migration risk; matches actual current usage (nothing depends on
it being in the new backend).

**Cons**: if/when a future phase needs Vapi to answer menu questions or admin UI to manage the
menu, this becomes a real backlog item — but that is a *new feature*, not a migration requirement.

**Required schema/API/UI changes if accepted**: none in this phase.

**Migration impact**: none — menu data is simply not part of the Phase 21–23 migration scope.

**Risk level**: Low.

**Must solve before migration, or can defer?**: **Can defer indefinitely** until a product
decision requires backend-managed menu data; it is decoupled from reservation migration safety.

---

## 4. Restaurant settings / blackout dates / rules

**Problem statement**: Old Supabase has `restaurant_settings` (opening hours per weekday,
`last_reservation_offset_minutes`), `blackout_dates`, and `restaurant_rules`
(`max_party_size`, `manual_approval_threshold`, `auto_confirm`, `reservation_interval_minutes`).
Backend `Restaurant` has none of these fields.

**Existing Supabase source table(s)**: `restaurant_settings`, `blackout_dates`, `restaurant_rules`
(`supabase/migrations/20240512_settings_and_blackouts.sql`, `20240515_advanced_rules.sql`).

**Current backend model status**: `Restaurant` has only identity/status fields
(`name`, `slug`, `timezone`, `defaultLanguage`, `status`) — confirmed via
`restaurantSettingsService.ts`'s explicit comment that no opening-hours/availability fields exist
yet.

**Why it blocks/affects migration**: this is the one category with real *availability-logic*
consequences. Opening hours, blackout dates, and rules like `max_party_size`/`auto_confirm`
directly affect whether a reservation *should* be accepted — not just historical record-keeping.

**Options**:
- A) Extend `Restaurant` with simple scalar fields.
- B) Add separate `RestaurantSettings`, `BlackoutDate`, `RestaurantRule` models.
- C) Store some settings as JSON (e.g. a single `settingsJson` field).
- D) Defer non-critical settings.

**Recommended option**: **B for opening hours + blackout dates, D for the rest of `restaurant_rules`.**

**Reasoning**: opening hours (per-weekday) and blackout dates (per-date) are inherently
multi-row/structured data — forcing them into scalar `Restaurant` fields (A) or a single JSON blob
(C) makes per-day/per-date querying and admin UI editing awkward, and the existing Supabase schema
already models them correctly as separate tables. A dedicated `RestaurantSettings` (one row per
restaurant, holding `lastReservationOffsetMinutes` and similar singletons) and `BlackoutDate`
(one row per date) pair of models is the more natural fit, and both are needed *before* backend
Vapi reservation creation becomes the primary path — otherwise the backend cannot reject a
reservation request for a closed day/blackout date, which is a functional regression versus the
current Supabase-backed flow. `restaurant_rules` (`max_party_size`, `manual_approval_threshold`,
`auto_confirm`, `reservation_interval_minutes`) is lower-urgency: the backend's
`create-reservation-request` handler currently has no auto-confirm/approval-threshold logic at
all (it always creates a `"new"` request), so importing these rules today would configure logic
that doesn't exist yet — defer until that logic is built.

**Pros**: closes the actual availability gap before backend Vapi becomes primary; reuses the
existing Supabase data shape almost 1:1, easing migration; avoids over-fitting JSON for what is
genuinely tabular data.

**Cons**: two new models + migration + admin UI is real implementation work, not a one-line
change; must be scoped as its own phase rather than squeezed into migration tooling.

**Required schema/API/UI changes if accepted**: new Prisma models `RestaurantSettings` (1:1 with
`Restaurant`) and `BlackoutDate` (`restaurantId` + unique `date`); new admin settings endpoints/UI
to manage them; `create-reservation-request` should eventually check blackout dates and opening
hours before accepting a request (separate functional change, not in this phase's scope).

**Migration impact**: without these models, blackout dates and opening hours cannot be migrated
at all (no destination) and the backend Vapi flow has no way to honor them — a real
**cutover blocker**, not just a migration nicety.

**Risk level**: Medium (availability-logic gap, not just data-completeness).

**Must solve before migration, or can defer?**: opening hours + blackout dates — **must solve
before backend Vapi becomes the primary reservation path** (cutover blocker, see §8); not required
before *migrating historical reservation data*, since past reservations don't need future
availability rules to import correctly. `restaurant_rules` — **can defer**.

---

## 5. Orders

**Problem statement**: Old Supabase has an `orders` table; backend has no order/commerce model.

**Existing Supabase source table(s)**: `orders` (`supabase/migrations/20240513_customer_history_and_orders.sql`).

**Current backend model status**: none.

**Why it blocks/affects migration**: only if orders are read anywhere in the current
reservation/admin flow.

**Code evidence**: no reference to "order" in `backend/src` outside this assessment; the AGENTS.md
target architecture (Vapi, SMS, WhatsApp, Instagram, website reservations, central inbox) does not
mention commerce/ordering as a target capability. Orders appear to be a legacy/exploratory feature
of the Supabase app, not part of the platform's forward roadmap.

**Options**:
- A) Add `Order`/`OrderItem` models.
- B) Archive old orders only.
- C) Defer orders entirely — current reservation beta does not depend on them.
- D) Keep orders in Supabase legacy.

**Recommended option**: **C + D** (defer; leave in Supabase legacy; no backend model now).

**Pros**: zero schema risk; matches the fact that nothing in the target architecture needs it.

**Cons**: if order history is ever shown alongside customer profiles in the new backend admin UI,
this becomes a real gap later — explicitly out of scope here.

**Required schema/API/UI changes if accepted**: none.

**Migration impact**: none — out of scope for reservation-platform migration.

**Risk level**: Low.

**Must solve before migration, or can defer?**: **Can defer indefinitely**, pending an explicit
product decision that orders matter to the platform.

---

## 6. Timezone and date/time handling

**Problem statement**: Old Supabase `reservation_date`/`reservation_time` are plain `DATE`/`TIME`
columns with no stored timezone; it's unclear what timezone they were entered/interpreted in.

**Existing Supabase source table(s)**: `reservation_requests.reservation_date`/`reservation_time`
(`DATE`, `TIME`, no tz).

**Current backend model status**: `ReservationRequest.reservationDate` is `DateTime?` (timestamp,
implicitly UTC at the Postgres/Prisma layer); `reservationTime` stays a plain `String` (`HH:MM`),
not merged into a single timestamp. `Restaurant.timezone` defaults to `"Europe/Paris"` in the seed
(`backend/src/prisma/seed.ts:76`), while the menu's seeded currency is `TRY` (Turkish Lira) —
the same ambiguity already flagged in Phase 21.

**Why it blocks/affects migration**: a wrong timezone assumption silently shifts every migrated
reservation's effective date/time, which is a correctness bug that would not be visible from row
counts alone.

**Options**:
- A) Assume `Europe/Paris` for all historical Golden Meat data.
- B) Infer timezone from restaurant settings.
- C) Preserve original date/time strings plus a normalized datetime.
- D) Require a manual validation sample before migration.

**Recommended option**: **C, gated by D.**

**Reasoning**: the backend already keeps `reservationTime` as a separate plain string rather than
folding it into a single tz-aware timestamp — so the existing pattern is "store the literal
wall-clock date/time as entered, don't silently convert it." The safest import therefore
*preserves* the old `DATE`/`TIME` values verbatim into the same `reservationDate`/`reservationTime`
shape (no timezone math applied at all, since neither old nor new schema actually stores a UTC
instant for these business fields) — which sidesteps the Europe/Paris-vs-Turkey ambiguity entirely
for the bulk of the data. The one place a real timezone decision is unavoidable is
`Conversation`/`Message`/`ToolLog` timestamps (`createdAt`, etc.), which *are* true UTC instants;
those should simply use the original row's stored timestamp as-is (already UTC in Postgres),
no reinterpretation needed. Before trusting any of this at scale, a manual sample (Option D) of a
handful of known historical reservations should be cross-checked against operator memory/records
to confirm the literal values weren't already being entered in a different zone than assumed.

**Pros**: avoids guessing a timezone for business-meaning fields entirely; matches existing schema
design intent; cheap to validate with a small manual sample.

**Cons**: does not resolve the underlying ambiguity about what timezone the restaurant *operates*
in for the future (relevant to §4's opening-hours model, a separate concern from migrating past
data).

**Required schema/API/UI changes if accepted**: none for migration itself. Confirming
`Restaurant.timezone` is actually correct (Europe/Paris vs. a Turkey zone) is a product/ops
question, not a migration-tooling question — track separately from this migration.

**Migration impact**: literal date/time values import unchanged; no shift risk as long as no
reinterpretation step is added.

**Risk level**: Low if Option C is followed exactly (no conversion); **High** if any
script silently re-interprets old naive date/time values into a different assumed zone.

**Must solve before migration, or can defer?**: **Must solve before migration** — specifically,
the *policy* (preserve literal values, don't convert) must be locked in before any import script
is written, plus a manual validation sample (D) run once real export access exists.

---

## 7. Raw payload migration policy

**Problem statement**: old `calls`/`tool_logs` rows may contain full raw Vapi webhook payloads,
which can include customer PII (phone numbers, names, free-text speech).

**Existing Supabase source table(s)**: `calls.raw_payload` (JSONB), `tool_logs` payload columns.

**Current backend model status**: `ReservationRequest.rawPayload`, `Message.rawPayload`,
`ToolLog.requestPayload`/`responsePayload` all exist as `Json?` fields. The backend already
enforces an access policy on these: `reservationRequestService.ts` only ever returns `rawPayload`
to an explicitly-opted-in OWNER/MANAGER caller (`omitRawPayload` by default,
`getReservationRequestDetail`'s `includeRawPayload` option) — this is a real, already-shipped
precedent, not a hypothetical.

**Why it blocks/affects migration**: migrating raw payloads multiplies how much PII exists in the
new operational database; the access-control precedent already exists, but the *retention*
decision for old data does not.

**Options**:
- A) Migrate full `rawPayload` only into the existing restricted fields (reusing the
  already-enforced access policy).
- B) Migrate a summarized/sanitized payload only.
- C) Store raw legacy payloads in an encrypted archive outside the operational DB.
- D) Do not migrate raw payloads.

**Recommended option**: **A**, because the restriction mechanism already exists and is proven —
introducing a second storage tier (C) or a lossy summarization step (B) adds complexity to solve a
problem the backend has already solved at the access-control layer. Migrating into the existing
`rawPayload`/`requestPayload`/`responsePayload` fields means legacy data inherits the same
OWNER/MANAGER-only exposure as all newly-created data, with no separate code path to get wrong.

**Pros**: no new infrastructure; consistent access policy for old and new data; debugging value
preserved.

**Cons**: operational DB grows with historical PII-bearing JSON; if there's a legal/GDPR retention
requirement to *not* keep historical raw call payloads indefinitely, A doesn't address retention
limits (a TTL/purge policy would be a separate, later decision).

**Required schema/API/UI changes if accepted**: none — reuse existing fields and existing
access-control code paths verbatim.

**Migration impact**: straightforward 1:1 copy into existing JSON columns.

**Risk level**: Medium (PII volume increases; access control already mitigates exposure risk, but
retention/legal policy is a separate open question worth flagging to the team, not assumed away
here).

**Must solve before migration, or can defer?**: **Must solve before migration** (the policy must
be picked, even if the answer is "reuse existing fields/access control as-is") — but no new
engineering work is required to act on the chosen answer.

---

## 8. Backend Vapi webhook parity

**Problem statement**: backend `vapiWebhookRouter` only implements
`create-reservation-request`; `modify-reservation-request`, `cancel-reservation-request`, and
`handoff-to-staff` are literal `501 notImplemented` stubs
(`backend/src/routes/webhooks/vapi.ts:160-166`). The old Next.js `src/app/api/vapi/*` routes are
production-active and presumably implement all of these today (not modified or re-verified in this
phase, per the non-negotiable rules).

**Existing Supabase source table(s)**: N/A (this is a code-parity gap, not a data gap) — but it
directly affects how `reservation_changes`, `reservation_cancellations`, and `staff_handoffs`
historical rows would even continue to be generated if backend Vapi became primary today.

**Current backend model status**: only the create path is implemented end-to-end
(`vapiReservationService.createVapiReservationRequest`).

**Why it blocks/affects migration**: this is **not** a data-migration blocker — historical data
migration does not require live webhook parity. It **is** a cutover blocker: switching the
production Vapi assistant to point at the backend before modify/cancel/handoff exist would break
real customer-facing functionality the old Next.js routes currently provide.

**Options**:
- A) Complete backend Vapi parity before any webhook cutover.
- B) Keep old Next.js Vapi routes indefinitely and only migrate admin UI/historical data.
- C) Cut over only `create-reservation-request` first, keep the rest on the old routes.
- D) Do not touch Vapi until after data migration.

**Recommended option**: **A, sequenced after D** — i.e. do not touch the live Vapi cutover during
the data-migration phases at all; build full parity (A) as its own dedicated phase once migration
planning is settled, then cut over all four tool endpoints together rather than splitting
create/modify/cancel/handoff across two backends (which would mean a single phone call could
mutate state in two different systems depending on which tool the assistant invokes — a correctness
hazard, not just an inconvenience).

**Pros**: avoids a split-brain state where one call's create lands in the backend and its later
modify/cancel lands in Supabase (or vice versa); keeps the already-working production flow
untouched and low-risk during migration work, satisfying AGENTS.md rule 1.

**Cons**: delays backend Vapi cutover until parity work is done — but this is explicitly
acceptable per the non-negotiable rule "Do not break the current Vapi reservation flow" and the
project's own incremental-phase strategy.

**Required schema/API/UI changes if accepted**: implement `modify-reservation-request`,
`cancel-reservation-request`, `handoff-to-staff` against the existing Prisma schema (modify/cancel
need no new fields; handoff's implementation is described in §2); a payload-comparison plan against
the old Next.js routes' tool-response shapes; a rollback plan (point the Vapi assistant's tool URLs
back at the Next.js routes) before flipping any production URL — consistent with "Do not change
Vapi dashboard URLs" being out of scope until that dedicated phase explicitly addresses it.

**Migration impact**: none directly; this only affects *future* live traffic handling, not
historical data import.

**Risk level**: Medium-High if rushed/split (C); Low if sequenced as a dedicated phase (A).

**Must solve before migration, or can defer?**: **Can defer relative to data migration itself**,
but **must solve before any Vapi webhook cutover** — these are two independent timelines and
should not be conflated.

---

## 9. Supabase export/import tooling

**Problem statement**: no export or import tooling exists yet (Phase 21 intentionally skipped
writing one — see `scripts/migration/README.md`).

**Why it blocks/affects migration**: obviously required before any real migration, but should not
be built until the open decisions above (§1, §2, §4, §6, §7) are resolved, since each changes what
the tool must actually do.

**Options**:
- A) Build one dry-run import script after schema gaps are decided.
- B) Use SQL/CSV exports first and write transform scripts later.
- C) Use Supabase API reads in a controlled migration tool.
- D) Perform manual migration for only critical tables.

**Recommended option**: **A**, using `pg_dump`-based export (per
`docs/supabase-to-backend-dry-run-plan.md` §1) rather than C — a direct Postgres-level export is
simpler to make repeatable/auditable than paginating through a REST API, and the existing dry-run
plan already assumes this method.

**Assessment**:
- **Safest source access method**: `pg_dump` against a read-only/service-role connection string
  supplied via env var (never hardcoded), per the existing dry-run plan — no live app-level access
  needed, no risk of accidental writes.
- **Auditability**: a single script with a fixed migration order (already drafted in
  `docs/supabase-to-backend-migration-mapping.md` §5) is far easier to review/audit than ad-hoc
  manual steps (D) or a bespoke API-walking tool (C).
- **Repeatability**: a script run against a disposable staging DB (per dry-run plan §2) can be
  re-run after fixes; manual migration (D) cannot.
- **Dry-run reporting**: the script's default mode must be count/plan-only, per the dry-run plan
  §3/§10 report format already specified.
- **Rollback implications**: since the script only ever targets a staging DB by default (gated by
  `MIGRATION_WRITE_ENABLED=true` for any real write, as already specified in
  `scripts/migration/README.md`), rollback is "drop and recreate staging" — a real production
  migration's rollback is a separate, already-documented concern
  (`docs/05_MIGRATION_FROM_SUPABASE.md` "Rollback plan").

**Pros**: builds on plans already written and reviewed in Phase 21; no wasted effort from
designing a tool before its required behavior is settled.

**Cons**: necessarily delayed until §1/§2/§4/§6/§7 decisions are accepted — which is the correct
order, not a drawback.

**Required schema/API/UI changes if accepted**: implements (does not redesign) the migration order
and checks already specified in the Phase 21 docs.

**Migration impact**: this *is* the migration tooling.

**Risk level**: Low, given it is deliberately sequenced after decisions are locked.

**Must solve before migration, or can defer?**: **Must solve before migration** by definition —
but only after the upstream decisions in this document are accepted.

---

## A) Recommended pre-migration implementation backlog

**Must solve before migration** (data migration would be unsafe or lossy without these):
- §6 Timezone policy: lock in "preserve literal date/time values, no conversion" + run one manual
  validation sample once real export access exists.
- §7 Raw payload policy: confirm reuse of existing `rawPayload`/`requestPayload`/`responsePayload`
  fields and their existing OWNER/MANAGER access restriction for migrated legacy data.
- §9 Export/import tooling: build the dry-run import script — but only after the above two
  decisions (and the deferred-but-still-decided items below) are locked, since they change its
  behavior.

**Should solve before full backend/Vapi cutover** (not required for migrating historical data, but
required before backend becomes operationally primary):
- §4 Opening hours + blackout dates: add `RestaurantSettings` + `BlackoutDate` models and wire them
  into `create-reservation-request` availability checks — true cutover blocker, not a migration
  blocker.
- §8 Vapi webhook parity: implement `modify-reservation-request`, `cancel-reservation-request`,
  `handoff-to-staff` before any production Vapi tool URL points at the backend.
- §2 Staff handoff live flow: implement the `Conversation`-status-based handoff handling described
  in §2 (paired with §8, since it's the same stub).

**Can defer** (legacy/archive-only for now, no near-term product need identified):
- §1 ReservationRequest table assignment — current `Reservation`-only assignment pattern already
  covers the operational case; optional note-preservation supplement only.
- §3 Menu data — nothing in the current backend reads it.
- §5 Orders — out of current platform scope.
- §4 `restaurant_rules` (max party size / auto-confirm / approval threshold) — no corresponding
  backend logic exists yet to consume these rules.
- §2 Historical `staff_handoffs` rows — archive as `IntegrationEvent`, not operational data.

## B) Proposed Phase 23

**Phase 23: Backend Schema Gap Implementation — Minimal Migration Blockers**

Rationale: of the four candidate phases, this one reduces migration risk the most directly. It
should implement exactly the "must solve" items above that require schema/code changes — primarily
locking the timezone/raw-payload policies into the (still not-yet-written) import logic — while
explicitly *not* yet building the opening-hours/blackout-date models or Vapi parity work, which are
cutover-readiness items on a separate timeline (§4, §8) and would expand this phase's scope beyond
"minimal migration blockers." Vapi webhook parity and the menu/rules backend models are better
served by their own later phases (e.g. a future "Vapi Webhook Parity" phase and a future
"Restaurant Availability Settings" phase), once this phase has proven the migration approach end to
end on the data that's actually ready to move.

## C) No-go items

- Do not write the full migration/import script before the §6 (timezone) and §7 (raw payload)
  decisions in this document are explicitly accepted.
- Do not cut over any Vapi webhook tool URL to the backend before §8 parity is complete and
  verified against the old Next.js routes' behavior.
- Do not migrate raw payloads without the explicit policy decision in §7, even though this
  document recommends one — recommendation is not the same as team sign-off.
- Do not assume `Europe/Paris` (or any other zone) for historical date/time values without the
  manual validation sample described in §6.
- Do not add `RestaurantSettings`/`BlackoutDate`/menu/order models speculatively "while we're at
  it" during the next phase — each should be its own scoped phase per the backlog grouping above.

---

## Explicit non-goals of this phase

- No Prisma schema or migration files were added or modified.
- No migration/import script was written.
- No Supabase connection was made.
- No production data was read, written, or mutated.
- No file under `src/app/api/vapi/*` or `/admin/*` (Next.js admin pages) was modified.
- No existing backend beta functionality was removed or altered.
