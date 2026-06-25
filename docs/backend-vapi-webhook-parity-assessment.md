# Phase 26 — Backend Vapi Webhook Parity Assessment

Status: assessment and planning only. No production code, Prisma schema, or
Vapi dashboard configuration was changed while producing this document. See
"Checks performed" at the end.

## 1. Scope and method

Inspected (read-only):

- All 13 files under `src/app/api/vapi/*` (production Next.js + Supabase).
- `src/lib/vapi-parser.ts`, `src/lib/vapi-normalizers.ts`, `src/lib/vapi-response.ts`,
  `src/lib/vapi-messages.ts`, `src/lib/current-date.ts` (shared helpers used by the
  newer routes).
- `backend/src/routes/webhooks/vapi.ts` (the only backend Vapi webhook router).
- `backend/src/services/vapiReservationService.ts`.
- `backend/src/tests/vapiNormalizers.test.ts`, `backend/src/tests/vapiWebhook.integration.test.ts`.
- `backend/src/services/availabilitySlotService.ts` / `availabilitySlotTypes.ts`
  (Phase 25 slot calculation, not currently wired to any public/Vapi route).
- `backend/src/routes/restaurantAvailability.ts` (Phase 25 admin-authenticated
  availability API — JWT-protected, not webhook-key-protected).
- `backend/src/prisma/schema.prisma` (model inventory only).
- `backend/src/routes/reservationRequests.ts` (admin confirm/reject flow, for
  context on what already exists server-side for modify/cancel-adjacent logic).
- `backend/src/middleware/rateLimit.ts`.

No `src/app/api/vapi/*` file was edited. No backend route behavior was changed.
No Supabase or Postgres connection was made (no queries executed against either
database — only static source reading).

### Note on route maturity split

The 13 production routes fall into two generations:

- **Legacy generation** (`webhook/route.ts`): a single monolithic handler that
  dispatches Vapi's older `message.type === 'tool-calls'` envelope via a
  `switch` on function name (`get_current_date`, `check_availability`,
  `create_reservation_request`, etc.). This is also the route handling
  `assistant-request` (dynamic prompt injection) and `end-of-call-report`.
- **Per-tool generation** (`check-availability/route.ts`,
  `create-reservation-request/route.ts`, etc.): one Next.js route per Vapi
  tool, using the shared `vapi-parser`/`vapi-normalizers`/`vapi-response`
  helpers, with `tool_logs` logging and consistent missing-field handling.

Both generations are live in production simultaneously — Vapi's tool
configuration determines which one actually receives traffic for a given
tool. This assessment treats the **per-tool generation as the parity target**
(it is more robust: normalized inputs, missing-field handling, tool_logs
auditing) but documents the legacy `webhook/route.ts` behavior wherever it
differs, since cutover must not silently drop legacy-only behavior
(`assistant-request` dynamic prompts, `end-of-call-report` ingestion, menu
tools, opening-hours tool inside the same dispatcher).

## 2. Production Next.js Vapi routes — inventory

### 2.1 `POST /api/vapi/webhook` (legacy dispatcher)

- **Purpose**: handles three Vapi message types in one endpoint —
  `assistant-request` (returns a dynamically rewritten system prompt +
  `firstMessage`, with caller recognition baked in), `end-of-call-report`
  (upserts a `calls` row keyed by `vapi_call_id`), and `tool-calls` (dispatches
  to 12 inline tool implementations: `get_current_date`,
  `get_customer_profile`, `get_menu_info`, `get_item_details`,
  `check_availability`, `create_reservation_request`, `create_customer_profile`,
  `modify_reservation_request`, `cancel_reservation_request`,
  `handoff_to_staff`, `log_call_summary`, `get_opening_hours`).
- **Request payload**: Vapi's full webhook envelope —
  `{ message: { type, customer, call, toolCallList, summary, analysis, ... }, assistant, customer, call }`.
  Tool arguments arrive as `toolCallList[].function.arguments` (string or object).
- **Response payload**:
  - `assistant-request` → `{ assistant: { firstMessage, model: { messages: [...] } } }`.
  - `end-of-call-report` → `{ ok: true }`.
  - `tool-calls` → `{ results: [{ toolCallId, result: JSON.stringify(result) }] }` for
    every tool call in the batch — note `result` is a **stringified JSON blob**,
    not a JSON object, and there is no `error` key variant used here (errors are
    embedded inside the stringified `result` instead, e.g.
    `{ success: false, message }`).
- **Supabase tables read/written**: `customers` (read/insert via "silent
  registration"), `menu_items` (read), `restaurant_settings` (read),
  `blackout_dates` (read), `restaurant_rules` (read, for `max_party_size` /
  `manual_approval_threshold`), `reservation_requests` (read for booking
  collisions, insert on create, update on modify, delete on cancel), `tables`
  (read), `calls` (upsert on `end-of-call-report` and on
  `create_reservation_request`/`log_call_summary`).
- **Validation behavior**: minimal. `check_availability`/`create_reservation_request`
  do inline year-correction on dates but do not validate party size, time
  format, or required-field presence before querying. `cancel_reservation_request`
  performs a hard **delete** of the `reservation_requests` row (no soft cancel,
  no audit trail beyond whatever Supabase logs).
- **Error behavior**: top-level `try/catch` returns `{ error: error.message }`
  with HTTP 500 for anything uncaught; inline per-tool errors (e.g. Supabase
  insert failure) are swallowed into `{ success: false, message: error.message }`
  inside the stringified result, HTTP 200.
- **Record creation**: yes — customer, reservation_request, call records; also
  the only route that **deletes** a reservation_requests row (cancel) and the
  only route that performs a destructive **hard delete** at all.
- **Reads settings/menu/tables/availability**: yes — all of the above.
- **Env var dependencies**: Supabase service-role credentials via
  `createServerSupabase()` (implicit; not inspected further per scope — this is
  existing, untouched production code).
- **Logs raw payloads**: `console.log` of tool name + args, full `body` is
  persisted as `raw_payload` on `calls` upserts (so caller phone numbers,
  names, and full Vapi envelopes land in logs/DB either way).
- **Sensitive data exposure risk**: `get_customer_profile`'s result includes
  internal `notes` field passed straight back into the tool result, which the
  assistant prompt is trusted (but not enforced in code) not to read aloud.
  `console.log` of args may include phone numbers/names in server logs.

### 2.2 `POST /api/vapi/check-availability`

- **Purpose**: standalone availability check (per-tool generation), checking
  blackout dates, weekly hours, max party size, and table capacity collisions
  against existing `reservation_requests` for the requested slot.
- **Request payload**: tool args via `parseVapiPayload`, aliases resolved via
  `getValueFromAliases`: `date|reservation_date|requested_date|new_date|new_reservation_date`,
  `time|reservation_time|requested_time|new_time|new_reservation_time`,
  `party_size|partySize|guests|guest_count|number_of_people|people|new_party_size`.
- **Response payload** (always wrapped via `createVapiToolResponse`, which
  emits `{ results: [{ toolCallId, result: JSON.stringify(payload) }] }` if a
  `toolCallId` is present in the raw body, else the raw JSON payload directly):
  - Missing fields → `{ success: false, available: false, reason: 'Missing Required Information', message, missing_fields: [...] }`.
  - Holiday/closure → `{ available: false, reason: "Holiday/Closure", message }`.
  - Closed day → `{ available: false, reason: "Closed", message }`.
  - Outside hours → `{ available: false, reason: "Outside Hours", message }`.
  - Party too large → `{ available: false, reason: "Party Too Large", message }`.
  - Fully booked → `{ available: false, reason: "Fully Booked", message, suggest_alternatives: true }`.
  - Available → `{ available: true, needs_approval: boolean, best_table_id, date, message }`.
- **Supabase tables**: `restaurant_settings`, `restaurant_rules`,
  `blackout_dates`, `tables`, `reservation_requests` (all read, fetched in
  parallel via `Promise.all`).
- **Validation**: normalizes date/time/party-size via shared normalizers;
  returns structured missing-fields response rather than throwing.
- **Error behavior**: caught and returned via `createVapiToolErrorResponse`
  (200 + `{ results: [{ toolCallId, error }] }`, or 500 + `{ error }` if no
  toolCallId).
- **Record creation**: none — read-only.
- **Env vars**: Supabase credentials (implicit).
- **Raw payload logging**: `console.log('[CHECK_AVAILABILITY INPUT]', ...)` of
  normalized fields only, not the full raw body.
- **Sensitive data**: low — no customer PII returned beyond what was asked.

### 2.3 `POST /api/vapi/create-reservation-request`

- **Purpose**: the canonical reservation-creation tool (per-tool generation).
- **Request payload**: `customer_name|full_name|name|customerName`,
  phone via several aliases or `rawBody.customer.number` /
  `message.customer.number` / `message.call.customer.number` /
  `call.customer.number`, `reservation_date|date|requested_date`,
  `reservation_time|time|requested_time`, `party_size|partySize|guests|...`,
  `language|lang` (default `'tr'`), `special_request|notes|request|special_notes`.
- **Response payload**: missing fields → `buildMissingFieldsResponse` shape
  (see 2.2). Success → `getVapiResponse('reservation_received', language)`,
  i.e. `{ status: 'received', message: 'reservation received successfully.', customer_message_fr, customer_message_tr, customer_message_en, text }`
  — **no `reservation_id` is returned to Vapi** in this route's success path.
- **Supabase tables**: `tool_logs` (insert "processing", update "success"),
  `customers` (upsert on `phone_number` conflict — overwrites `full_name` and
  `last_visit_at` unconditionally, no `total_reservations` increment here),
  `reservation_requests` (insert, status `'new'`), `calls` (upsert keyed by
  `vapi_call_id`).
- **Validation**: all 5 required fields (`customer_name`, `phone_number`,
  `reservation_date`, `reservation_time`, `party_size`) checked; missing-fields
  response returned before any DB write.
- **Error behavior**: thrown errors from the insert bubble to the outer
  `catch`, returned via `createVapiToolErrorResponse`. No partial-write
  rollback — the `tool_logs` "processing" row insert happens before the
  reservation insert and is never marked failed if the reservation insert
  throws (only the success path updates `tool_logs` to `'success'`).
- **Record creation**: customer (upsert), reservation_request (insert), call
  (upsert), tool_log (insert + conditional update).
- **Raw payload logging**: full `rawBody` stored as `raw_payload` on both
  `reservation_requests` and `tool_logs`; `console.log` of normalized fields
  only.
- **Sensitive data**: customer name/phone persisted in 3 tables; acceptable
  for this domain, no extra exposure beyond what's needed operationally.

### 2.4 `POST /api/vapi/modify-reservation-request`

- **Purpose**: per-tool-generation "change" tool — does **not** mutate the
  existing reservation; it inserts an audit/request row into a separate
  `reservation_changes` table for staff to action.
- **Request payload**: `customer_name|full_name|name`, phone aliases,
  `original_reservation_date|original_date`, `original_reservation_time|original_time`,
  `new_reservation_date|new_date|reservation_date|date`,
  `new_reservation_time|new_time|reservation_time|time`,
  `party_size|new_party_size|partySize|guests`, `language|lang`, `note|notes|special_request`.
- **Response payload**: missing fields (requires `customer_name` OR
  `phone_number`, plus `new_reservation_date`/`new_reservation_time`) →
  standard missing-fields shape; success → `getVapiResponse('reservation_received', language)`
  (same generic "received" message as create — **no indication to Vapi that
  this was specifically a modify**, and no resolved reservation id/old-vs-new
  diff returned).
- **Supabase tables**: `tool_logs`, `reservation_changes` (insert only,
  status `'new'`) — **does not touch `reservation_requests` or `reservations`
  at all**. The actual reservation record is unchanged until a human applies
  the change elsewhere (not found within `src/app/api/vapi/*`).
- **Validation**: as above; no lookup/existence check against an actual
  reservation — accepts any `customer_name`/`phone_number` without confirming
  a matching reservation exists.
- **Error behavior**: same pattern as 2.3.
- **Record creation**: `reservation_changes` row only.
- **Sensitive data**: low/normal.

### 2.5 `POST /api/vapi/cancel-reservation-request`

- **Purpose**: per-tool-generation "cancel" tool — same audit-row pattern as
  modify: inserts into `reservation_cancellations`, does **not** delete or
  status-transition the original `reservation_requests` row. (Contrast with
  the legacy `webhook/route.ts` `cancel_reservation_request` tool, which
  performs a real hard delete on `reservation_requests` — the two generations
  disagree on what "cancel" does.)
- **Request payload**: `customer_name|full_name|name`, phone aliases,
  `reservation_date|date|original_date`, `reservation_time|time|original_time`,
  `language|lang`, `reason|cancellation_reason|notes`.
- **Response payload**: missing fields → standard shape; success →
  `getVapiResponse('reservation_received', language)` (again the generic
  message, not a cancellation-specific one).
- **Supabase tables**: `tool_logs`, `reservation_cancellations` (insert only).
- **Validation**: requires `customer_name` or `phone_number`, plus
  `reservation_date`/`reservation_time`; no existence check against the
  reservation being cancelled.
- **Record creation**: `reservation_cancellations` row only.

### 2.6 `POST /api/vapi/handoff-to-staff`

- **Purpose**: logs a staff handoff request into `staff_handoffs`.
- **Request payload**: `customer_name|full_name|name`, phone aliases,
  `language|lang`, `reason|handoff_reason|request`,
  `conversation_summary|summary|notes`, `urgency|priority` (default `'normal'`).
- **Response payload**: `getVapiResponse('staff_handoff', language)` —
  `{ status: 'received', message: 'staff handoff successfully.', customer_message_fr/tr/en, text }`.
  (Contrast with legacy `webhook/route.ts`'s inline `handoff_to_staff` tool,
  which just returns `{ success: true, message: "Transferring to staff..." }`
  and writes nothing — the two generations again disagree, this time on
  whether a handoff is persisted at all.)
- **Supabase tables**: `tool_logs`, `staff_handoffs` (insert, status `'new'`).
- **Validation**: none of the fields are required/checked for presence before
  insert (no `missingFields` block in this route, unlike 2.3–2.5).
- **Record creation**: `staff_handoffs` row.
- **Relevant prior decision**: per AGENTS.md Phase 22, live handoffs in the
  target backend should use `Conversation` status + `Message`, with historical
  rows representable as `IntegrationEvent`. Neither model is touched by this
  route today.

### 2.7 `POST /api/vapi/get-current-date`

- **Purpose**: returns server-side current date info (also has a `GET`
  handler for health/manual checks).
- **Request payload**: none required; `POST` tolerates an unparseable/missing
  body (try/catch swallows JSON parse failure).
- **Response payload**: `getCurrentDateInfo()` result wrapped via
  `createVapiToolResponse` — fields not enumerated here since
  `src/lib/current-date.ts` was out of this phase's read list, but usage
  elsewhere shows at least `today_iso`, `today_spoken_tr`, `weekday_tr`,
  `tomorrow_iso`, `tomorrow_spoken_tr`, `tomorrow_weekday_tr`,
  `relative_date_rule_tr`, `tool_date_rule`, `spoken_date_rule_tr`.
- **Supabase tables**: none.
- **Risk**: lowest of all routes — pure function, no DB, no PII.

### 2.8 `POST /api/vapi/get-customer-profile`

- **Purpose**: per-tool-generation customer lookup by phone (fuzzy suffix
  match), **read-only** — does not create a customer if not found (contrast
  with the legacy `webhook/route.ts` `get_customer_profile` tool, which
  performs "silent registration": inserts a new `customers` row with
  `full_name: 'New Guest'` if none is found).
- **Request payload**: phone via aliases or Vapi envelope customer/call number.
- **Response payload**: not found → `{ is_known: false, caller_phone, message: 'New customer' }`;
  found → `{ is_known: true, customer_id, full_name, phone_number, notes, total_reservations, last_visit_at, instructions, customer_message_fr, customer_message_tr, customer_message_en }`.
- **Supabase tables**: `customers` (read only, `ilike` on last-9-digits suffix).
- **Sensitive data**: returns internal `notes` directly in the tool result,
  same as the legacy dispatcher's equivalent tool — this is consistent across
  generations but is a standing risk if the assistant ever echoes `notes`
  verbatim to the caller.

### 2.9 `POST /api/vapi/create-customer-profile`

- **Purpose**: per-tool-generation customer upsert (update-if-exists,
  insert-if-not, preserving existing `notes` if none supplied), plus a `calls`
  upsert if `call_id` is present.
- **Request payload**: phone (required, 400-equivalent via
  `createVapiToolErrorResponse` if missing — note this route, unusually,
  errors on missing phone rather than returning the missing-fields shape),
  `full_name|customer_name|name|customerName` (default `'Unknown Customer'`),
  `notes|conversation_summary|summary|request`.
- **Response payload**: `{ success: true, customer_id, full_name, phone_number, is_new, message: 'Customer profile saved' }`.
- **Supabase tables**: `tool_logs`, `customers` (select + update or insert),
  `calls` (upsert, conditional on `call_id`).
- **Validation**: only phone is enforced; mismatched with `create_customer_profile`
  in the legacy dispatcher, which requires nothing and silently no-ops update
  fields it can't get.

### 2.10 `POST /api/vapi/get-menu-info`

- **Purpose**: returns all `is_available = true` menu items formatted as a
  newline list for the assistant to read from.
- **Request payload**: none required.
- **Response payload**: `{ menu_info: string, footer_message: "Please inform the guest that all prices are inclusive of VAT." }`.
- **Supabase tables**: `menu_items` (read).
- **Backend equivalent**: none — no `Menu`/`MenuItem` Prisma model exists at
  all in `backend/src/prisma/schema.prisma` (confirmed: model list has no
  Menu-related model). This is a genuine missing-model gap, not an
  implementation gap.

### 2.11 `POST /api/vapi/get-item-details`

- **Purpose**: per-item menu lookup by fuzzy name match.
- **Request payload**: `item_name|item|dish|product_name|menu_item|name`
  (missing → missing-fields response).
- **Response payload**: not found → generic "couldn't find" message; found →
  `{ name, price: "<price> <currency>", description, category, availability: "In Stock"|"Out of Stock", instruction }`.
- **Supabase tables**: `menu_items` (read).
- **Backend equivalent**: none, same gap as 2.10.

### 2.12 `POST /api/vapi/get-opening-hours`

- **Purpose**: formats weekly `restaurant_settings` rows plus upcoming
  `blackout_dates` into a human-readable block for the assistant.
- **Request payload**: none required.
- **Response payload**: `{ opening_hours: string, holiday_closures: string, instruction }`.
- **Supabase tables**: `restaurant_settings` (read, all days), `blackout_dates`
  (read, `date >= today`).
- **Backend data source readiness**: Phase 25 added `RestaurantSettings.openingHoursJson`
  (a `Json?` keyed by weekday → array of `{start, end}` windows) and
  `BlackoutDate` (with `localDate`, `isFullDay`, `startsAtLocal`/`endsAtLocal`,
  `reason`, `status`). The **data model is present and richer** than the old
  flat `open_time`/`close_time`/`day_of_week` row-per-day Supabase shape, but
  there is **no backend route today** that formats this into the
  `{ opening_hours, holiday_closures }` string shape Vapi expects — a small
  Vapi-specific adapter would be needed, not a data-model change.

### 2.13 `POST /api/vapi/log-call-summary`

- **Purpose**: per-tool-generation call-summary logger; upserts a `calls` row
  if `call_id` present, else inserts. Explicitly tells the assistant not to
  make the caller wait (`silent: true`).
- **Request payload**: `caller_phone|phone_number` or webhook envelope
  customer number, `customer_name|full_name|name`, `language|lang`,
  `intent|call_intent|reason`, `summary|conversation_summary|notes`,
  `outcome|status|result`.
- **Response payload**: `{ success: true, silent: true, assistant_instruction: "Do not tell the caller to wait. If the caller is ending the call, say a short polite goodbye." }`.
- **Supabase tables**: `calls` (upsert or insert), full `rawBody` stored as
  `raw_payload`.
- **No field validation at all** — every field is optional; the route's only
  failure mode is a thrown Supabase error.

## 3. Backend Vapi webhook routes — inventory

Backend has exactly **one router file** for Vapi webhooks:
`backend/src/routes/webhooks/vapi.ts`, mounted (per its own router object) at
a base path consistent with `/api/webhooks/vapi/:publicWebhookKey/<tool>`
(confirmed by the integration test's `baseUrl`).

| Backend path | Status |
|---|---|
| `POST /:publicWebhookKey/create-reservation-request` | **Implemented** |
| `POST /:publicWebhookKey/modify-reservation-request` | **Stub** — `notImplemented` → `501 { error: "Not implemented yet" }` |
| `POST /:publicWebhookKey/cancel-reservation-request` | **Stub** — same |
| `POST /:publicWebhookKey/handoff-to-staff` | **Stub** — same |

No backend route exists at all (implemented or stubbed) for: `check-availability`,
`get-current-date`, `get-customer-profile`, `create-customer-profile`,
`get-menu-info`, `get-item-details`, `get-opening-hours`, `log-call-summary`,
or the legacy `webhook` dispatcher's `assistant-request`/`end-of-call-report`
handling.

### 3.1 `create-reservation-request` (implemented)

- **Tenant resolution**: `resolveVapiIntegrationConnection(publicWebhookKey)`
  looks up `IntegrationConnection` by `{ publicWebhookKey, channel: "vapi" }`
  and returns `{ id, restaurantId, status }`. **The restaurant is never taken
  from the request body** — only from this lookup, which is the correct
  tenant-resolution pattern per `docs/06_SECURITY_AND_TENANCY_RULES.md`.
  Caveat: the connection's own `status` field is fetched but **not checked**
  in the route (an `inactive`/`error` connection still resolves and is
  treated as usable) — worth confirming intentional before cutover.
- **publicWebhookKey usage**: as above; unknown/inactive-status key still only
  fails on "not found" (404-equivalent via 401), not on `status !== 'active'`.
- **Rate limiting**: `webhookRateLimiter` applied to the whole router (`.use`
  at the top) — independent of user-session rate limits, keyed by IP via
  express-rate-limit defaults.
- **Request normalization**: reuses the *same* `parseVapiPayload`,
  `getValueFromAliases`, `normalizeDate`, `normalizeTime`, `normalizePartySize`,
  `normalizePhone` functions (ported 1:1 into `backend/src/utils/vapi/*`,
  same aliases as the Next.js route in 2.3) plus an added `toDigitsOnlyPhone`
  helper for the new `normalizedPhone` tenant-scoped uniqueness key.
- **Response shape**: missing fields → identical `buildMissingFieldsResponse`
  shape via `sendVapiToolResponse`. Success → `getVapiResponse("reservation_received", language)`
  — **same exact response contract** as the Next.js route in 2.3, ported into
  `backend/src/utils/vapi/messages.ts`.
- **Database writes**: `ToolLog` (create "processing" / update "success" or
  "failure" — note this **fixes** the Next.js route's gap where a failed
  reservation insert left the tool_log stuck in "processing"; backend
  explicitly marks `"failure"` with `errorMessage`), then
  `createVapiReservationRequest()` in `vapiReservationService.ts`:
  - `Customer.upsert` keyed by `{ restaurantId, normalizedPhone }` — increments
    `totalReservations` on update (Next.js route does not increment this field
    on its customer upsert — a behavioral **improvement**, not a gap, but a
    difference worth knowing about if comparing reported reservation counts
    across systems during migration).
  - `Conversation.upsert` keyed by `{ restaurantId, channel: "voice", provider: "vapi", externalThreadId: callId }`
    — **only created if `callId` is present**.
  - `Message.create` (inbound, channel "voice", provider "vapi") — **only if
    callId is present**; this is genuinely new tracking the Next.js route has
    no equivalent for (no `messages`/`conversations` Supabase tables existed).
  - `ReservationRequest.create` with `channel: "voice"`, `provider: "vapi"`,
    `sourceExternalId: callId`, `requestType: "create"`, `status: "new"` —
    field-for-field richer than the Next.js insert (adds `conversationId`,
    `normalizedPhone`, `requestType`, `sourceExternalId` vs. the flat
    `vapi_call_id` on the old table).
- **Error behavior**: connection-not-found → 401 with
  `sendVapiToolErrorResponse` (explicitly documented in-code as "must never
  surface as a 500"); internal failure during reservation creation → `ToolLog`
  marked `"failure"`, then `sendVapiToolErrorResponse` (generic message, no
  leaked internal error text to Vapi — `logger.error` captures the real error
  server-side only).
- **Sensitive field handling**: raw payload stored as `Prisma.InputJsonValue`
  on both `ToolLog.requestPayload` and `Message.rawPayload` — same
  raw-payload-at-rest pattern as the Next.js route; no additional redaction.
- **Test coverage**: `vapiWebhook.integration.test.ts` covers success path
  (all 4 related rows created), missing-fields (no rows created), unknown key
  (401, no rows anywhere), phone-reuse upsert (no duplicate customer,
  `totalReservations` increments), and explicit cross-tenant isolation (two
  restaurants, same `call_id`, no leakage). This is **stronger test coverage
  than the Next.js route has** (no automated tests were found for
  `src/app/api/vapi/*` during this read-only pass — none were in scope to
  search exhaustively, but none surfaced).

### 3.2–3.4 `modify-reservation-request` / `cancel-reservation-request` / `handoff-to-staff` (stubs)

All three are a single shared `notImplemented` handler returning
`501 { error: "Not implemented yet" }`. This is **not** Vapi-compatible: Vapi
expects either the `{ results: [{ toolCallId, result }] }` shape or a direct
JSON body depending on configuration — a raw `{ error }` at 501 will likely
surface to the assistant as a tool failure with no actionable `result`, rather
than a graceful "your request could not be processed" message. Cutover of any
of these three tools requires, at minimum, matching the existing
`sendVapiToolResponse`/`sendVapiToolErrorResponse` contract, even as a
placeholder.

## 4. Vapi Response Contract Risks

For each route, what exact response fields/shape must be preserved if/when a
backend route replaces the Next.js one. **Source of truth for these
expectations is the existing Next.js code's response shape and the Vapi tool
configuration that consumes it — no live Vapi tool payload/response sample
was captured in this phase** (see backlog item below; this is explicitly
flagged as unverified against a real Vapi assistant configuration).

| Route | Fields Vapi/assistant prompts may depend on | Confidence |
|---|---|---|
| check-availability | `available`, `reason`, `message`, `best_table_id`, `needs_approval`, `suggest_alternatives`, `missing_fields` | Medium — inferred from code only |
| create-reservation-request | `status`/`text`/`customer_message_*` (no `reservation_id` is returned today — if any prompt references one, it does not exist in the current contract) | Medium |
| modify-reservation-request | same generic `reservation_received` shape — no modify-specific fields exist today | Medium |
| cancel-reservation-request | same generic `reservation_received` shape — no cancel-specific fields exist today | Medium |
| handoff-to-staff | `status`/`text`/`customer_message_*` (per-tool route) vs. `{ success, message }` (legacy dispatcher) — **the two generations are not contract-compatible with each other**, so which one Vapi is actually configured to call must be confirmed before backend cutover | Low — depends on live Vapi tool config |
| get-menu-info / get-item-details | `menu_info`, `name`/`price`/`description`/`category`/`availability` | Medium |
| get-opening-hours | `opening_hours`, `holiday_closures` (strings, not structured data) | Medium |
| get-current-date | shape of `getCurrentDateInfo()` — not fully enumerated in this pass | Low — `current-date.ts` not read |
| get/create-customer-profile | `is_known`, `customer_id`, `full_name`, `phone_number`, `notes`, `total_reservations`, `instructions` | Medium |
| log-call-summary | `success`, `silent`, `assistant_instruction` | Medium |

**Explicit flag**: missing/format mismatches in `missing_fields`, exact
`reason` string values (`"Holiday/Closure"` vs `"Holiday"`, etc. — note the
legacy dispatcher and per-tool generation already use different `reason`
strings for the same condition), and whether Vapi's tool definitions parse
`result` as a JSON string vs. object are all things that should be confirmed
against the live Vapi assistant config, not just the code, before any cutover.

## 5. Parity matrix

| Production route | Current purpose | Supabase deps | Backend candidate | Status | Key differences | Cutover readiness | Required work before cutover | Risk |
|---|---|---|---|---|---|---|---|---|
| `check-availability` | Slot/holiday/hours/capacity check | `restaurant_settings`, `restaurant_rules`, `blackout_dates`, `tables`, `reservation_requests` | none (Phase 25 `availabilitySlotService` exists but is mounted only under JWT-authenticated `/restaurants/:id/availability/slots`, not a public webhook route) | **Missing** (no public Vapi route) | Backend slot service returns a list of `{time, available, capacity, availableTableIds, reason}` per interval, not a single yes/no decision for one requested time+date; needs an adapter to produce `{available, reason, message, best_table_id, needs_approval, suggest_alternatives}` | Not ready | Build a public webhook-key-authenticated adapter route; map slot-list result to old single-slot Vapi response shape; decide `needs_approval`/`manual_approval_threshold` equivalent (not present in Phase 25 settings model — `RestaurantSettings` has no manual-approval-threshold field) | Medium |
| `create-reservation-request` | Create reservation request, upsert customer, log call | `customers`, `reservation_requests`, `calls`, `tool_logs` | `POST /:publicWebhookKey/create-reservation-request` | **Complete** | Backend additionally creates Conversation/Message rows, increments `totalReservations`, has stronger error/test coverage; response contract matches | **Ready** | Confirm connection `status` check (currently unchecked) is intentional; capture a real Vapi payload sample to confirm field-name parity in production traffic | Low |
| `modify-reservation-request` | Per-tool: logs to `reservation_changes` (audit only, no reservation mutation). Legacy: not implemented inline at all (legacy dispatcher's `modify_reservation_request` *does* directly UPDATE `reservation_requests`) | `reservation_changes` (per-tool) or `reservation_requests` (legacy) | `POST /:publicWebhookKey/modify-reservation-request` | **Stub** (`501`) | Backend has no equivalent of either generation's behavior; also the two production generations disagree on whether modify is an audit-row insert or a direct update | Not ready | Decide canonical behavior (recommend: audit-style, matching per-tool generation + Phase 22's Conversation/Message direction) before writing the handler; needs a way to locate the target `ReservationRequest`/`Reservation` (no lookup-by-customer+date+time exists in current services) | Blocker (behavior undecided) |
| `cancel-reservation-request` | Per-tool: logs to `reservation_cancellations` (audit only). Legacy: hard-deletes `reservation_requests` row | `reservation_cancellations` (per-tool) or `reservation_requests` delete (legacy) | `POST /:publicWebhookKey/cancel-reservation-request` | **Stub** (`501`) | Same generation-disagreement problem as modify; backend has `setReservationRequestStatus`/status-transition logic in `reservationRequestService` (used by admin reject flow) that could be reused for a status-transition-based cancel, but it is not wired to any public/webhook entry point | Not ready | Decide canonical behavior (recommend: status transition to `cancelled` via existing `isValidStatusTransition`/`setReservationRequestStatus`, not a hard delete); needs lookup-by-phone+date+time or similar | Blocker (behavior undecided) |
| `handoff-to-staff` | Per-tool: inserts `staff_handoffs` row. Legacy: returns a canned response, persists nothing | `staff_handoffs` (per-tool) or none (legacy) | `POST /:publicWebhookKey/handoff-to-staff` | **Stub** (`501`) | Per AGENTS.md Phase 22 decision: live handoffs should become Conversation status + Message; historical/audit rows could be `IntegrationEvent`. Neither is implemented yet | Not ready | Implement per Phase 22 decision (Conversation status transition + Message + optional IntegrationEvent for audit) | Medium (decision already made, just not built) |
| `get-current-date` | Returns server date/time info | none | none | **Missing** | Pure function, no DB — could be ported in minutes, or simply left on the old route since it has zero data-migration relevance | Old route is fine to keep | Low-effort port if/when convenient; not urgent | Low |
| `get-customer-profile` | Read-only fuzzy customer lookup by phone | `customers` | none (Customer model exists; no public webhook route exposes it) | **Missing** | Backend `Customer` model has equivalent fields (`fullName`, `phoneNumber`, `notes`, `totalReservations`, `lastVisitAt`) plus `restaurantId` scoping the old table never had | Not ready (route missing) | New public route: tenant-scoped fuzzy/suffix phone lookup against `Customer`; decide on `notes`-in-response risk before exposing | Medium |
| `create-customer-profile` | Customer upsert (update-preserve-notes / insert) | `customers`, `calls` | none | **Missing** | Same model gap as above; `Conversation`/`Message` could absorb the old `calls` upsert side-effect | Not ready | New public route; reuse `Customer.upsert` pattern already proven in `vapiReservationService.ts` | Medium |
| `get-menu-info` | Formats active menu items | `menu_items` | none — **no Menu model in Prisma schema** | **Missing (model gap, not route gap)** | This is a data-model gap, not an implementation gap — there is nothing to "implement against" yet | Keep on old route | Requires an intentional decision to add a Menu/MenuItem model (out of scope for this phase and explicitly excluded by Phase 26 instructions: "do not add Prisma schema unless absolutely necessary") | Low (as long as old route stays up) |
| `get-item-details` | Per-item menu lookup | `menu_items` | none | **Missing (model gap)** | Same as above | Keep on old route | Same as above | Low |
| `get-opening-hours` | Formats weekly hours + upcoming blackouts | `restaurant_settings`, `blackout_dates` | none (data exists via `RestaurantSettings.openingHoursJson` + `BlackoutDate`, but no formatting route) | **Missing (route gap only — data ready)** | Backend data model is structurally richer (JSON per-weekday windows vs. flat day-of-week rows; explicit partial-day blackout windows vs. full-day-only) | Needs a small adapter route | Format `openingHoursJson` + active `BlackoutDate`s into the old `{opening_hours, holiday_closures}` string shape | Low |
| `log-call-summary` | Best-effort call summary logger, no validation | `calls` | none — closest analog is `ToolLog`/`Message`/`Conversation` | **Missing** | Backend has finer-grained models (`Message` for content, `Conversation` for thread state, `ToolLog` for tool audit) that together cover more than the flat old `calls` table, but nothing wires Vapi's `log_call_summary` tool call to them | Not ready | Decide which model(s) a "call summary" maps to (recommend: `Message` on the call's `Conversation`, not a new dedicated table) | Low |
| `webhook` (legacy dispatcher: `assistant-request`, `end-of-call-report`) | Dynamic prompt injection at call start; end-of-call logging | `customers` (read for greeting), `calls` (upsert) | none | **Missing** | `assistant-request` (dynamic system-prompt rewrite with caller recognition) has no backend analog at all and is architecturally different from the other tools (it's an assistant-config response, not a tool-result response) | Not ready, and likely **out of scope** for the webhook-route migration entirely — it may belong with Vapi assistant configuration rather than a per-restaurant backend route | Needs its own design decision: does multi-tenant Vapi assistant config live per-restaurant in the backend, and how does `assistant-request` resolve a restaurant before any `publicWebhookKey` path segment exists (assistant-request typically fires before any custom URL routing is configurable per-tool) | Medium — architecturally distinct problem, not just a missing CRUD route |

## 6. Route-by-route recommendations

| Route | Recommendation |
|---|---|
| check-availability | **B** — backend implementation (adapter over Phase 25 slot service) required first |
| create-reservation-request | **A** — ready to map to backend soon (already implemented + tested) |
| modify-reservation-request | **E** — needs a data/behavior decision (audit-row vs. direct update) before any implementation |
| cancel-reservation-request | **E** — needs a data/behavior decision (status transition vs. hard delete vs. audit-row) before any implementation |
| handoff-to-staff | **B** — backend implementation required first (Phase 22 decision already made; just needs building) |
| get-current-date | **C** — keep on old route for now (zero cutover value, near-zero risk either way) |
| get-customer-profile | **B** — backend implementation required first |
| create-customer-profile | **B** — backend implementation required first |
| get-menu-info | **C/E** — keep on old route; needs a Menu/MenuItem model decision first, deliberately deferred |
| get-item-details | **C/E** — same as get-menu-info |
| get-opening-hours | **B** — backend implementation required first, but it is the smallest of the "B" routes (data is ready, only formatting logic is missing) |
| log-call-summary | **E** — needs a data/model-mapping decision (Message vs. dedicated log) before implementation |
| webhook (assistant-request / end-of-call-report) | **E** — needs an architecture decision (how/whether per-restaurant assistant config and call-start tenant resolution work) before any implementation; do not bundle this into the same effort as the other tool routes |

Conservative summary: **1 of 13 routes is cutover-ready** today
(`create-reservation-request`). Three are pure stubs with an undecided
behavior contract (`modify`, `cancel`, `handoff`). The remainder are either
architecturally distinct (`webhook` dispatcher) or have no backend route at
all yet.

## 7. Required backend parity backlog

**Must implement before any Vapi backend cutover (beyond create-reservation-request):**

- Decide and implement `modify-reservation-request` behavior (recommend:
  audit-row insert against a new model or `IntegrationEvent`/`Message`,
  consistent with how `create-reservation-request` already tracks
  Conversation/Message — not a silent direct mutation of `Reservation`).
- Decide and implement `cancel-reservation-request` behavior (recommend:
  reuse `setReservationRequestStatus`/`isValidStatusTransition` to transition
  to `cancelled`, never a hard delete, matching the soft-delete/status-field
  convention already used for `BlackoutDate`, `Restaurant`, `Conversation`).
- Implement `handoff-to-staff` per the already-made Phase 22 decision
  (Conversation status + Message, optionally `IntegrationEvent` for history).
- Add the `check-availability` Vapi adapter (see Phase 27 recommendation
  below) — single biggest functional gap given Phase 25 already built the
  underlying slot logic.
- Add connection `status` enforcement to `create-reservation-request` (and any
  new routes) — currently an `inactive`/`error` `IntegrationConnection` still
  resolves successfully.

**Should implement before full backend Vapi cutover:**

- `get-opening-hours` adapter (data ready, low effort, low risk).
- `get-customer-profile` / `create-customer-profile` backend routes (needed
  for full inline-dispatcher parity and customer recognition flows).
- `log-call-summary` → `Message`/`Conversation` mapping.
- Capture real Vapi tool-call payload/response samples from the live
  assistant config (see "Vapi Response Contract Risks") — several response
  shapes in this document are inferred from code only, not confirmed against
  actual Vapi traffic.
- Decide whether the two production generations (legacy dispatcher vs.
  per-tool routes) are both still live in the current Vapi assistant config,
  or whether one is dead code — this materially changes what "parity" means
  for `modify`/`cancel`/`handoff`, which behave differently in each
  generation.
- Add automated tests for the Next.js routes (none were found) so behavior
  changes during migration can be regression-checked against documented
  current behavior, not just against the backend's own tests.

**Can defer:**

- `get-menu-info` / `get-item-details` — explicitly blocked on a Menu/MenuItem
  Prisma model decision that Phase 26 is told not to make.
- `get-current-date` — trivial, no urgency, no migration risk either way.
- `assistant-request` dynamic prompt injection / `end-of-call-report` — needs
  its own architecture decision about per-tenant Vapi assistant config and is
  not a simple route-parity item; treat as a separate phase entirely, not
  folded into the tool-by-tool backlog above.

## 8. Proposed Phase 27

**Phase 27: Backend Vapi Check-Availability Adapter**

Rationale: Phase 25 already built `calculateAvailabilitySlots()` with the
data (opening hours, blackout dates, tables, reservations) that
`check-availability` needs — the gap is purely a missing public,
webhook-key-authenticated adapter route that calls the existing slot service
for the requested date and translates its slot-list result into the
single-decision Vapi response shape (`available`, `reason`, `message`,
`best_table_id`, `needs_approval`, `suggest_alternatives`) documented in
Section 2.2/4. This is the smallest "B" item with the most existing
groundwork, and de-risks the most-frequently-called tool in the reservation
flow before tackling the higher-ambiguity `modify`/`cancel`/`handoff` routes
(Section 5/6 marked those **E** — needing a behavior decision — which makes
them a worse next step than an already-well-specified adapter).

Two open questions that Phase 27 should resolve as part of its own
assessment/design step before coding: (1) what `needs_approval`'s backend
equivalent is, since `RestaurantSettings` has no `manual_approval_threshold`-
style field today; (2) whether the adapter is a brand-new
`/:publicWebhookKey/check-availability` route reusing
`resolveVapiIntegrationConnection`, or a thin wrapper that also needs
`IntegrationConnection.status` enforcement (flagged as currently missing in
`create-reservation-request` too — worth fixing once, in shared code, rather
than per-route).

## 9. Checks performed

- No production data was touched — no Supabase queries were executed; this
  phase only read local TypeScript source files.
- No live Supabase connection was made.
- No Vapi dashboard URL was changed (none of this phase's actions touch any
  external service).
- No `src/app/api/vapi/*` production route file was modified — all 13 were
  opened with a read-only tool and none were edited.
- No `/admin/*` Supabase file was modified — none were opened or touched in
  this phase.
- No Prisma migration or schema change was added — `schema.prisma` was only
  read (via grep/Read) to inventory existing models.
- No backend route behavior was changed — `backend/src/routes/webhooks/vapi.ts`
  and related services were only read.
- Only new file created: this document,
  `docs/backend-vapi-webhook-parity-assessment.md`.

## 10. Phase 27 implementation status (update)

`check-availability` backend status is now **implemented (adapter added)** —
the route, parity matrix, and recommendation entries above describing it as
**Missing**/**Not ready** are historical context from the Phase 26 assessment
and no longer reflect the current state.

What was built:

- `POST /api/webhooks/vapi/:publicWebhookKey/check-availability` in
  `backend/src/routes/webhooks/vapi.ts`, inserted before the
  `modify-reservation-request`/`cancel-reservation-request`/`handoff-to-staff`
  stubs. Same tenant-resolution (`resolveVapiIntegrationConnection`), rate
  limiting (`webhookRateLimiter` at router level), and `ToolLog`
  create/success/failure pattern as `create-reservation-request`.
- `backend/src/utils/vapi/checkAvailabilityAdapter.ts` — pure functions
  (`extractCheckAvailabilityArgs`, `buildMissingArgsResponse`,
  `mapAvailabilityResultToVapiResponse`) that translate inbound Vapi
  payloads into a `calculateAvailabilitySlots()` query and translate the
  resulting `AvailabilitySlotResult` into the Vapi response shape. No
  database access — fully unit-testable.
- The route is **read-only**: it never creates a `ReservationRequest` or
  `Reservation`.

Response contract deviates intentionally from Section 2.2/4's speculated
`best_table_id`/`needs_approval`/`suggest_alternatives` shape (which was
inferred from the old Next.js route's code, not confirmed against live Vapi
traffic):

- `best_table_id` is **not** returned. Per this phase's explicit
  instructions, internal table IDs should not be exposed unless there is a
  clear reason — `available_slots`/`suggested_times` (plain `HH:mm` strings)
  serve the same "is X available / what else is open" purpose without
  leaking `RestaurantTable.id`.
- `needs_approval` is **not** returned — open question (1) from Section 8 is
  resolved as "not applicable yet": `RestaurantSettings` still has no
  `manual_approval_threshold`-style field, and this phase does not add one
  (no schema change was made, per phase constraints). Revisit if/when that
  field is added.
- `IntegrationConnection.status` enforcement (open question (2) from
  Section 8) was **not** added in this phase, matching
  `create-reservation-request`'s existing behavior — an `inactive`/`error`
  connection still resolves. This remains an open backlog item shared by
  both routes (Section 7), not something Phase 27 was asked to fix.

New response shape actually implemented (see
`VapiCheckAvailabilityResponse` in `checkAvailabilityAdapter.ts`):
`success`, `available`, `message`, `reason`(missing-fields only),
`missing_fields`, `date`, `time`, `partySize`, `available_slots`,
`suggested_times`, `blocked_reason`.

Tests added:

- `backend/src/tests/vapiCheckAvailabilityAdapter.test.ts` — pure
  argument-extraction and result-mapping checks, wired into `npm test`
  (`test:vapi-check-availability-adapter`).
- `backend/src/tests/vapiCheckAvailability.integration.test.ts` — DB-backed,
  **not** wired into `npm test` (same convention as
  `vapiWebhook.integration.test.ts`). Run via
  `npm run test:vapi-check-availability`.

No Vapi dashboard URL was changed and no production data was touched while
implementing or documenting Phase 27 — see
`docs/backend-production-cutover-plan.md` for the unchanged cutover status.

## 11. Phase 28 implementation status (update)

`create-reservation-request` is now marked **hardened** — Section 5/6's
**Ready**/**A** rating for it still holds, and this phase closes the
specific gaps Section 7 listed as backlog items for it:

- `IntegrationConnection.status !== "active"` is now rejected the same as an
  unknown key (previously only "not found" was checked — see Section 3.1's
  caveat, now resolved for this route only; `check-availability` still has
  the same open gap, intentionally not touched in this phase to keep scope
  to `create-reservation-request`).
- Payload alias coverage extended: camelCase aliases (`fullName`,
  `phoneNumber`, `callerNumber`, `customerPhone`, `reservationDate`,
  `reservationTime`, `numberOfGuests`, `specialRequests`), an optional
  `email` field (stored on `Customer.email`, never required), and a
  `callId` fallback chain (`call_id` → `conversation_id`/`conversationId` →
  Vapi `toolCallId`) for payload shapes that don't carry `message.call.id`.
- A conservative availability hard-block pre-check was added (reusing the
  Phase 25/27 `calculateAvailabilitySlots()` service) — blocks creation only
  for `restaurant_inactive`, `reservations_disabled`, `blackout_full_day`,
  `party_size_out_of_range`, `outside_booking_window`. Never blocks on
  `opening_hours_not_configured` and fails open (logs + proceeds) if the
  check itself throws.
- A best-effort idempotency guard was added: a repeated `callId` returns the
  existing `ReservationRequest`'s id instead of creating a duplicate. No
  schema change was made — there is still no unique constraint on
  `(restaurantId, sourceExternalId)`, so this is documented as a read-then-act
  check, not an atomic guarantee (see
  `backend/src/services/vapiReservationService.ts`'s
  `findExistingReservationRequestByCallId` docstring).
- The success response now additively includes `success: true`,
  `reservation_request_id`, `customer_id`, `next_step` alongside the
  existing byte-compatible `status`/`text`/`customer_message_*` fields — see
  `docs/vapi-create-reservation-request-contract.md` for the full contract
  and the explicit reasoning for this deviation from the old route.

New file: `backend/src/utils/vapi/createReservationRequestAdapter.ts` (pure,
no Prisma) — extraction, missing-fields, and response-builder helpers, same
pattern as `checkAvailabilityAdapter.ts`. Covered by
`backend/src/tests/vapiCreateReservationRequestAdapter.test.ts` (wired into
`npm test` as `test:vapi-create-reservation-request-adapter`).

New DB-backed test:
`backend/src/tests/vapiCreateReservationRequest.integration.test.ts` (not
wired into `npm test`, run via `npm run test:vapi-create-reservation-request`)
— covers camelCase/nested/JSON-string payloads, invalid date/time/party-size
handling, idempotent retries, inactive-connection rejection, no-confirmed-
-Reservation-created, and a sensitive-field grep over the response and
`ToolLog.responsePayload`.

Still not in scope for this phase (unchanged from Section 7/10):
`modify-reservation-request`, `cancel-reservation-request`,
`handoff-to-staff` remain stubs; `check-availability`'s connection-status
gap remains open; no Menu/MenuItem model exists; no live Vapi payload
sample was captured. The Vapi dashboard URL was not changed.

## 12. Phase 29 implementation status (update)

`get-customer-profile` and `create-customer-profile` backend status moves
from **Missing**/**B** (Section 5/6) to **implemented**. This closes the
"Should implement" backlog item from Section 7 covering these two routes.

What was built:

- `POST /api/webhooks/vapi/:publicWebhookKey/get-customer-profile` —
  read-only. Looks up a `Customer` scoped to `restaurantId`, preferring an
  exact `normalizedPhone` match, falling back to `email`. Never performs the
  legacy dispatcher's "silent registration" (Section 2.1/2.8) — a not-found
  lookup returns `success:true, found:false` and creates nothing.
- `POST /api/webhooks/vapi/:publicWebhookKey/create-customer-profile` —
  update-if-found / create-if-not, same restaurantId scoping. Existing
  non-empty fields are never overwritten by empty/null input (see
  `upsertVapiCustomer` in `vapiCustomerProfileService.ts`).
- `backend/src/utils/vapi/customerProfileAdapter.ts` — pure functions
  (`extractGetCustomerProfileArgs`, `extractCreateCustomerProfileArgs`,
  `computeGetCustomerProfileMissingFields`,
  `computeCreateCustomerProfileMissingFields`, `toSafeCustomerPayload`,
  response builders), same pattern as `checkAvailabilityAdapter.ts` /
  `createReservationRequestAdapter.ts`. No Prisma access — fully
  unit-testable.
- `backend/src/services/vapiCustomerProfileService.ts` — the only file in
  this phase that touches Prisma (`lookupVapiCustomer`, `upsertVapiCustomer`).

Intentional deviations from the old Next.js routes (Section 2.8/2.9):

- **Lookup is exact, not fuzzy.** The old `get-customer-profile` route does
  an `ilike` last-9-digits suffix scan with no tenant scoping at all
  (Supabase has no `restaurantId` column on `customers`). The backend route
  requires an exact `normalizedPhone` (digits-only) or `email` match, scoped
  to `restaurantId` — a deliberately stricter, tenant-safe replacement, not
  a bug. A caller dialing from a new number will get `found:false` even if
  an old fuzzy-matched row exists for them; this is the correct tradeoff for
  multi-tenant correctness.
- **Conflict handling is new.** Neither old generation has any concept of
  "phone and email belong to different customers" — they only ever look up
  by phone. The backend route adds a conservative conflict response
  (`success:false, conflict:true`) instead of guessing which record to use
  or silently merging them (AGENTS.md Phase 29 item 4).
- **At least one of phone/email is required** for both routes (plus `name`
  for create), returned as `missing_fields: ["phone_or_email"]` /
  `["name", "phone_or_email"]` rather than the old `create-customer-profile`
  route's behavior of defaulting an absent name to `'Unknown Customer'` and
  only hard-requiring phone.
- **No `calls`/`Conversation`/`Message` side effect.** The old
  `create-customer-profile` route also upserts a `calls` row keyed by
  `call_id`. The backend route does not create or touch `Conversation`/
  `Message` — customer-profile management is treated as a pure `Customer`
  CRUD operation, not a call-logging event. If call-thread tracking for
  these tools is needed later, it should reuse the `Conversation`/`Message`
  pattern already proven in `vapiReservationService.ts`, as its own
  decision, not bundled into this phase.
- **No `notes`-in-response change.** `notes` is still returned in
  `get-customer-profile`'s response when non-empty, matching both old
  generations' behavior (Section 2.8's standing risk note still applies —
  this phase does not add new exposure, but does not remove the existing
  one either, since the field is part of the established contract).
- **`IntegrationConnection.status` is enforced** (`!== "active"` rejected
  the same as an unknown key), matching Phase 28's hardening of
  `create-reservation-request`, not Phase 27's `check-availability` (which
  still has the open gap noted in Section 7).

ToolLog behavior: a `ToolLog` row is created in `"processing"` status before
the missing-fields check (not after, unlike `create-reservation-request`'s
pattern of skipping ToolLog entirely for missing fields) — see
`docs/vapi-customer-profile-contract.md` for the full status-transition
table, including why a missing-fields call is logged as `"failure"` while a
detected conflict is logged as `"success"` (the conflict response is the
*correct*, successfully-detected outcome, not an error).

Tests added:

- `backend/src/tests/vapiCustomerProfileAdapter.test.ts` — pure
  argument-extraction, missing-field, and response-shape checks, wired into
  `npm test` (`test:vapi-customer-profile-adapter`).
- `backend/src/tests/vapiCustomerProfile.integration.test.ts` — DB-backed,
  **not** wired into `npm test` (same convention as the other
  `*.integration.test.ts` files). Run via `npm run test:vapi-customer-profile`.

No Prisma schema or migration change was made — the existing `Customer`
model (`fullName`, `phoneNumber`, `normalizedPhone`, `email`, `notes`,
`restaurantId`) already had every field this phase needed. No Vapi dashboard
URL was changed and no production data was touched while implementing or
documenting Phase 29 — see `docs/backend-production-cutover-plan.md` for the
unchanged cutover status.

Still not in scope for this phase: `modify-reservation-request`,
`cancel-reservation-request`, `handoff-to-staff` remain stubs;
`check-availability`'s connection-status gap remains open; no Menu/MenuItem
model exists; `log-call-summary`/`get-opening-hours`/the legacy `webhook`
dispatcher remain unimplemented on the backend.

## 13. Phase 30 implementation status (update)

`get-current-date` and `get-opening-hours` backend status moves from
**Missing**/**C** and **Missing (route gap only)**/**B** (Section 5/6) to
**implemented**. This closes the Section 7/8 backlog item for `get-opening-hours`
("data ready, only formatting logic is missing") and the low-priority
`get-current-date` port noted in Section 6/8.

What was built:

- `POST /api/webhooks/vapi/:publicWebhookKey/get-current-date` — read-only.
  Reports the *restaurant's* local date/time (`Restaurant.timezone`, falling
  back to `Europe/Paris` only if blank) instead of the old route's
  hardcoded `Europe/Paris` constant (Section 2.7's `current-date.ts`). Adds
  a `day_of_week` localized via `Restaurant.defaultLanguage` (or a caller-
  supplied `language`/`lang`/`locale`), which the old route did not have
  (its Turkish-only spoken-date helpers are a separate concern not ported).
- `POST /api/webhooks/vapi/:publicWebhookKey/get-opening-hours` — read-only.
  Formats `RestaurantSettings.openingHoursJson` + active `BlackoutDate`s into
  a structured `opening_periods`/`weekly_hours` shape instead of the old
  route's pre-formatted `{ opening_hours, holiday_closures }` strings
  (Section 2.12). Supports an optional requested `date`; without one, returns
  today's status plus the full week. Never calls `calculateAvailabilitySlots`
  — slot math remains exclusively `check-availability`'s responsibility
  (AGENTS.md Phase 30 constraint).
- `backend/src/utils/vapi/dateOpeningHoursAdapter.ts` — pure functions
  (argument/date/language extraction and normalization, response-shape
  builders), same pattern as `checkAvailabilityAdapter.ts` /
  `customerProfileAdapter.ts`. No Prisma access — fully unit-testable. Reuses
  `getNowPartsInTimezone`/`getWeekdayFromLocalDate`/`isValidOpeningHoursJson`
  from `availabilitySlotHelpers.ts` (Phase 25) rather than re-implementing
  timezone/weekday math.
- No new service file — both routes read `Restaurant`,
  `getOrCreateAvailabilitySettings` (Phase 24/25), and `BlackoutDate`
  directly in `routes/webhooks/vapi.ts`, the same Prisma access pattern
  already used by `check-availability` for `calculateAvailabilitySlots`.

Timezone policy: `Restaurant.timezone` is authoritative; the
`RestaurantSettings` model has no timezone field, so the documented
"RestaurantSettings fallback" in AGENTS.md Phase 30 item 3 is a no-op in the
current schema (`Restaurant.timezone` always has a DB default of
`Europe/Paris`, so the final hardcoded fallback only triggers for a blank
string at the application layer, not a missing column).

Opening-hours "not configured" contract decision: returns
`{ success: true, configured: false, ... }`, not `success: false` — chosen
to match the existing `get-customer-profile` not-found precedent
(`success:true, found:false`) so the Vapi assistant treats "no hours on
file" as a normal, gracefully-handled outcome rather than a tool error worth
retrying. "Empty" is defined as `openingHoursJson` being `null`/invalid, **or**
a valid object where every weekday's window list is empty — both treated as
unconfigured per AGENTS.md Phase 30 item 4's "missing or empty" wording. See
`docs/vapi-date-opening-hours-contract.md` for the full contract.

Blackout handling: a full-day `BlackoutDate` for the resolved date overrides
the normal opening-hours computation entirely (`is_open: false,
closed_reason: "blackout_full_day"`, mirroring `check-availability`'s
`blackout_full_day` blocked reason). A partial-day blackout
(`isFullDay: false` with both `startsAtLocal`/`endsAtLocal` set) does **not**
flip `is_open` — it is surfaced as an additional `partial_blackout_note`
field plus inline text in `message`, since the restaurant is still genuinely
open outside that window and slot-level exclusion is `check-availability`'s
job, not this route's.

Restaurant-inactive / reservations-disabled policy: both return
`{ success: true, is_open: false, closed_reason: "restaurant_inactive" |
"reservations_disabled" }` — same safe-for-voice shape as the not-configured
case, reusing the message wording already established in
`checkAvailabilityAdapter.ts`'s `BLOCKED_REASON_MESSAGES` (kept as a
separate, smaller constant in the new adapter rather than importing across
adapter files, to keep each adapter independently testable).

Intentional deviations from the old Next.js routes (Section 2.7/2.12):

- **Structured response instead of pre-formatted strings.** The old
  `get-opening-hours` route builds `opening_hours`/`holiday_closures` as
  newline/comma-joined strings server-side. The backend route returns
  `opening_periods: [{opens, closes}]` and `weekly_hours` as a compact
  per-weekday object — the assistant prompt is expected to phrase this
  itself, consistent with the rest of this backend's structured-data
  philosophy (e.g. `check-availability`'s `available_slots`).
- **No day-of-week-only Supabase row format.** The old route's
  `restaurant_settings` is one row per weekday with `day_of_week` (int),
  `open_time`/`close_time`, `is_closed`. The backend's
  `RestaurantSettings.openingHoursJson` (Phase 25) is a single JSON document
  keyed by weekday name with an array of windows per day, supporting
  multiple opening windows per day (e.g. lunch + dinner) that the old flat
  row shape could not represent.
- **No Turkish-specific spoken-date helpers ported.** `current-date.ts`'s
  `numberToTurkishWords`/`formatDateForTurkishSpeech` (Section 2.7) are not
  reproduced — `day_of_week` is a plain localized label (English/Turkish/
  French), not a fully spoken-out date string. If the live assistant prompt
  depends on the exact Turkish spoken-date wording, that is a gap to close
  before any cutover, not an oversight.
- **`IntegrationConnection.status` is enforced** (`!== "active"` rejected
  the same as an unknown key), matching Phase 28/29's hardening, not Phase
  27's `check-availability` (open gap, Section 7).

ToolLog behavior: a `ToolLog` row (`toolName: "get_current_date"` /
`"get_opening_hours"`) is created in `"processing"` status (for
`get-opening-hours`, only after the date-format validation passes — an
invalid date is logged directly as a `"failure"` row, mirroring the
missing-fields-as-failure convention from Phase 29's `customerProfileAdapter.ts`
contract). Both routes log `responsePayload` with only safe scalar fields
(timezone/date/isOpen/configured/closedReason) — never the full response
body or `rawPayload`.

Tests added:

- `backend/src/tests/vapiDateOpeningHoursAdapter.test.ts` — pure
  argument-extraction, date-validation, and response-shape checks, wired
  into `npm test` (`test:vapi-date-opening-hours-adapter`).
- `backend/src/tests/vapiDateOpeningHours.integration.test.ts` — DB-backed,
  **not** wired into `npm test` (same convention as the other
  `*.integration.test.ts` files). Run via
  `npm run test:vapi-date-opening-hours`.

No Prisma schema or migration change was made — `Restaurant.timezone`/
`defaultLanguage`/`status`, `RestaurantSettings.openingHoursJson`/
`reservationsEnabled`, and `BlackoutDate` (all from Phase 24/25) already had
every field this phase needed. No Vapi dashboard URL was changed and no
production data was touched while implementing or documenting Phase 30 — see
`docs/backend-production-cutover-plan.md` for the unchanged cutover status.

Still not in scope for this phase: `modify-reservation-request`,
`cancel-reservation-request`, `handoff-to-staff` remain stubs;
`check-availability`'s connection-status gap remains open; no Menu/MenuItem
model exists; `log-call-summary`/the legacy `webhook` dispatcher remain
unimplemented on the backend.

## 14. Phase 31 implementation status (update)

`log-call-summary` backend status moves from **Missing**/**E** (Section
5/6 — "needs a data/model-mapping decision before implementation") to
**implemented (hardened, conservative)**. This closes the "Should
implement" backlog item from Section 7.

What was built:

- `POST /api/webhooks/vapi/:publicWebhookKey/log-call-summary` in
  `backend/src/routes/webhooks/vapi.ts`, inserted before the
  `modify-reservation-request`/`cancel-reservation-request`/`handoff-to-staff`
  stubs. Same tenant-resolution (`resolveVapiIntegrationConnection`),
  `IntegrationConnection.status === "active"` enforcement, rate limiting
  (`webhookRateLimiter` at router level), and `ToolLog` create/success/failure
  pattern as the other Phase 28-30 routes.
- `backend/src/utils/vapi/callSummaryAdapter.ts` — pure functions
  (`extractCallSummaryArgs`, `computeCallSummaryMissingFields`,
  `truncateSummary`, `buildSafeCallSummaryPayload`, response builders), same
  pattern as `checkAvailabilityAdapter.ts` / `customerProfileAdapter.ts` /
  `dateOpeningHoursAdapter.ts`. No Prisma access — fully unit-testable.

Model-mapping decision (Section 7's open item): the route stores a single
`IntegrationEvent` row (`channel: "voice"`, `provider: "vapi"`, `eventType:
"call_summary"`), not a `Message` on a `Conversation`. This is a deliberate
deviation from the Section 5 recommendation ("Message on the call's
Conversation") — a `log-call-summary` tool call frequently arrives without
enough information to safely resolve or create a `Conversation` row (no
`Customer`/thread linkage is guaranteed), and Phase 31's constraints
explicitly forbid creating a `Customer`/`ReservationRequest`/`Reservation`
from this route. `IntegrationEvent` was already the model AGENTS.md Phase 22
identified as the right home for historical/audit-style call data, and it
requires no new linkage decisions. Revisiting the `Message`/`Conversation`
mapping is left as a future decision if call-summary-to-thread linkage
becomes a requirement.

Intentional deviations from the old Next.js route (Section 2.13):

- **No raw payload or transcript stored.** The old route stores the entire
  `rawBody` as `raw_payload` on every `calls` upsert (caller phone numbers,
  names, and the full Vapi envelope land in the database either way — see
  Section 2.13's note). The backend route stores only a bounded, allowlisted
  `payload` (`callId`, truncated `summary`, `language`, `outcome`,
  `durationSeconds`, `endedReason`) on `IntegrationEvent` — phone/name are
  extracted by the adapter (for parity with other Vapi adapters' alias
  coverage) but are **not** persisted or returned, since AGENTS.md Phase 31
  item 5 explicitly excludes them from the storage/response allowlist.
  `transcript`/`transcriptText`/`fullTranscript` aliases are recognized by
  the adapter (so a payload carrying them is still accepted) but the value is
  never stored or returned anywhere.
- **Summary is bounded.** `truncateSummary()` caps stored summaries at 4,000
  characters (`MAX_SUMMARY_LENGTH`); the old route stores whatever length
  Vapi sends, unbounded.
- **Required-field policy is explicit.** The old route has **no field
  validation at all** (Section 2.13) — every field is optional and the only
  failure mode is a thrown Supabase error. The backend route requires at
  least `callId` OR `summary`; both missing returns
  `{ success: false, missing_fields: ["call_id_or_summary"] }` (logged as a
  `ToolLog` `"failure"`) rather than silently inserting an empty-ish row.
- **No `calls` table equivalent — `IntegrationEvent` instead.** No upsert-by-
  `call_id` semantics either: every accepted call creates a new
  `IntegrationEvent` row (no `vapi_call_id` unique constraint exists on this
  model, so repeated `log_call_summary` calls for the same `callId` create
  multiple rows, intentionally — this is an event log, not a mutable `calls`
  record).
- **No `silent`/`assistant_instruction` response fields.** The old route's
  response shape (`{ success, silent, assistant_instruction }`, Section 2.13)
  is not reproduced; the new contract is `{ success, message, logged,
  call_id, event_id, missing_fields }` per AGENTS.md Phase 31 item 5's
  required response shape. If the live Vapi assistant prompt depends on
  `assistant_instruction`'s specific wording to avoid a "please wait"
  utterance, that is a gap to close before any cutover, not an oversight.
- **`IntegrationConnection.status` is enforced**, matching Phase 28-30's
  hardening pattern, not the still-open `check-availability` gap (Section 7).
- **No Customer/ReservationRequest/Reservation creation.** Unlike the legacy
  dispatcher's `log_call_summary` tool (Section 2.1) and the
  `create_reservation_request` tool's `calls` upsert side effect, this route
  never touches `Customer`/`ReservationRequest`/`Reservation` — confirmed by
  the integration test's explicit zero-row-count assertions.

ToolLog behavior: a `ToolLog` row (`toolName: "log_call_summary"`) is
created in `"processing"` status before the missing-fields check (same
convention as `get-customer-profile`/`create-customer-profile`'s
`customerProfileAdapter.ts` contract — a missing-fields call is logged as
`"failure"`, not skipped). `responsePayload` on success contains only
`{ eventId, callId }` — never the full response body or `rawPayload`.

Tests added:

- `backend/src/tests/vapiCallSummaryAdapter.test.ts` — pure
  argument-extraction, missing-field, truncation, and response-shape checks,
  wired into `npm test` (`test:vapi-call-summary-adapter`).
- `backend/src/tests/vapiCallSummary.integration.test.ts` — DB-backed,
  **not** wired into `npm test` (same convention as the other
  `*.integration.test.ts` files). Run via `npm run test:vapi-call-summary`.

No Prisma schema or migration change was made — the existing `IntegrationEvent`
model (`restaurantId`, `integrationId`, `channel`, `provider`, `eventType`,
`status`, `payload`) already had every field this phase needed. No Vapi
dashboard URL was changed and no production data was touched while
implementing or documenting Phase 31 — see
`docs/backend-production-cutover-plan.md` for the unchanged cutover status.

Still not in scope for this phase: `modify-reservation-request`,
`cancel-reservation-request`, `handoff-to-staff` remain stubs;
`check-availability`'s connection-status gap remains open; no Menu/MenuItem
model exists; `get-menu-info`/`get-item-details`/the legacy `webhook`
dispatcher remain unimplemented on the backend.

## 15. Phase 32 decision status (update)

Phase 32 was a documentation/decision-only phase (no code, schema, or
Vapi/Supabase changes) that resolved the "Blocker (behavior undecided)"
status this assessment assigned to `modify-reservation-request`,
`cancel-reservation-request`, and `handoff-to-staff` in Sections 5–7 above.
Full behavior decisions, old-route inspection detail, backend model mapping,
and per-route acceptance criteria now live in
`docs/vapi-modify-cancel-handoff-decision-pack.md` — this section only
records the resulting status change.

- **modify-reservation-request**: **Decision-ready, not implemented.**
  Decided behavior: new `ReservationRequest` row (`requestType: "change"`),
  never an auto-applied mutation of an existing request/reservation. No
  schema change needed — `requestType` already documents `"change"` as a
  value. Recommended target phase: 35 (last of the three, due to matching
  complexity).
- **cancel-reservation-request**: **Decision-ready, not implemented.**
  Decided behavior: auto-cancel only an unambiguous match against a
  *pending* `ReservationRequest` (via the existing
  `setReservationRequestStatus`/`isValidStatusTransition`); anything
  touching a confirmed `Reservation`, or any ambiguous match, falls back to
  an audit-only `ReservationRequest` (`requestType: "cancel"`) for staff to
  action manually. No hard-delete in any case. Recommended target phase: 34.
- **handoff-to-staff**: **Decision-ready, not implemented.**
  Decided behavior: `IntegrationEvent` (`eventType: "handoff_requested"`),
  reusing the exact pattern Phase 31's `log-call-summary` already
  established, plus an optional `Conversation.status = "pending"` +
  `Message` when a `Conversation` resolves via `callId`. Explicitly no
  staff-notification channel exists or is implied by this design.
  Recommended target phase: 33 (first of the three — lowest risk, reuses an
  already-proven pattern).

This changes the Section 6 recommendation codes for these three routes from
**E** (needs a data/behavior decision) to **decision made, implementation
pending** — they remain unbuilt, but are no longer blocked on a product
question. `docs/backend-production-cutover-plan.md` has been updated to
reflect that Vapi dashboard cutover is still withheld pending
*implementation*, not pending *decision*, for these three tools.

## 16. Phase 33 implementation status (update)

`POST /api/webhooks/vapi/:publicWebhookKey/handoff-to-staff` is now
implemented in `backend/src/routes/webhooks/vapi.ts`, replacing its
`notImplemented` (501) stub. It follows the Phase 32 decision and reuses
Phase 31's `log-call-summary` pattern exactly: tenant resolved via
`resolveVapiIntegrationConnection`, `ToolLog` processing→success/failure
audit trail, and a single bounded `IntegrationEvent`
(`eventType: "handoff_to_staff"`, `payload`: callId/reason/message/urgency/
customerName/phone/email/language/requestedAt/source — never the raw Vapi
body or transcript). One intentional naming deviation from the decision
pack: `eventType` is `"handoff_to_staff"` rather than `"handoff_requested"`,
matching the route's own tool name; this was an allowed choice in the Phase
33 spec and does not change the storage policy. The optional
`Conversation`/`Message` write described as optional in the decision pack
was deferred — `IntegrationEvent` only, per the decision pack's own
fallback guidance ("if uncertain, defer Conversation changes").

The response never claims staff were notified — wording is "your request
has been recorded for the restaurant team. They will follow up with you as
soon as possible" (or the Turkish/French equivalents), consistent with the
documented absence of a staff notification channel. No `Customer`,
`ReservationRequest`, or `Reservation` row is created or mutated by this
route.

`modify-reservation-request` and `cancel-reservation-request` remain
`notImplemented` (501) stubs — out of scope for Phase 33. The old
Next.js/Supabase `handoff-to-staff` route and the legacy dispatcher's
`handoff_to_staff` no-op case are both untouched and continue to serve the
production Vapi assistant; the Vapi dashboard has not been switched.

## 17. Phase 34 implementation status (update)

`POST /api/webhooks/vapi/:publicWebhookKey/cancel-reservation-request` is
now implemented and hardened in `backend/src/routes/webhooks/vapi.ts`,
replacing its `notImplemented` (501) stub. It follows the Phase 32 decision
pack (Section 3B) and this phase's refinement of it: an unambiguous
**pending** `ReservationRequest` (status `new`/`pending_info`) matched
either by an explicit `reservationRequestId` or by an exact
phone+date+time match is cancelled through the existing
`setReservationRequestStatus`/`isValidStatusTransition` machinery — no new
transition logic was added. A confirmed `Reservation`, a confirmed/
terminal `ReservationRequest`, an ambiguous match, or no match at all is
**never mutated** — each of those cases logs a bounded
`IntegrationEvent` (`eventType: "reservation_cancellation_requested"`) for
staff review instead, and the voice response is the generic "your
cancellation request has been recorded for the restaurant team to review"
— it never claims a confirmed reservation was cancelled. Hard-delete is
never performed anywhere in this route.

New pure helper: `backend/src/utils/vapi/cancelReservationRequestAdapter.ts`
(payload normalization/aliasing, missing-field policy, response builders,
bounded safe-payload builder — same shape as Phase 33's
`handoffToStaffAdapter.ts`). New service helpers added to
`backend/src/services/vapiReservationService.ts`:
`findVapiReservationRequestById`, `findUnambiguousPendingMatch`,
`findVapiReservationById`, `isCancellablePendingStatus` — all tenant-scoped,
no schema change.

`modify-reservation-request` remains a `notImplemented` (501) stub — out of
scope for Phase 34, target Phase 35. The old Next.js/Supabase
`cancel-reservation-request` route (audit-only insert into
`reservation_cancellations`) and the legacy dispatcher's hard-delete
`cancel_reservation_request` case are both untouched and continue to serve
the production Vapi assistant; the Vapi dashboard has not been switched.

## 18. Phase 35 implementation status (update)

`POST /api/webhooks/vapi/:publicWebhookKey/modify-reservation-request` is
now implemented and hardened in `backend/src/routes/webhooks/vapi.ts`,
replacing its `notImplemented` (501) stub. It follows the Phase 32 decision
pack (Section 3A): a voice-initiated modification never directly mutates a
confirmed `Reservation` or an already-decided `ReservationRequest`'s
date/time/party/status. The intent is always logged as a bounded
`IntegrationEvent` (`eventType: "reservation_modification_requested"`), and
where an unambiguous *pending* target exists — an explicit
`reservationRequestId` that is still `new`/`pending_info`, an explicit
`reservationId` referencing a confirmed `Reservation`, or an exact
phone+currentDate+currentTime match against pending requests — a second,
separately-tracked `ReservationRequest` row with `requestType: "change"` is
additionally created for restaurant-team review, linked to the original
record only via a bounded `internalNote` (no FK exists between
`ReservationRequest` rows in this schema; none was added). The original
record's own date/time/party/status fields are never written to. Hard-delete
is never performed.

New pure helper: `backend/src/utils/vapi/modifyReservationRequestAdapter.ts`
(payload normalization/aliasing for identity fields, currentDate/currentTime,
and newDate/newTime/newPartySize/newNotes/reason; a two-part missing-field
policy requiring both an identifying field and a requested-change field;
invalid-date/time-format detection that is distinct from "not provided";
response builders; bounded safe-payload builder — same shape as Phase 34's
`cancelReservationRequestAdapter.ts`). New service helper added to
`backend/src/services/vapiReservationService.ts`:
`createVapiReservationChangeRequest` (tenant-scoped insert-only, reuses the
existing `requestType: "change"` schema value, no migration).

The voice response never claims a reservation was changed — wording is
"your modification request has been recorded for the restaurant team to
review" (or the Turkish/French equivalents) in every outcome, including the
cases where a change `ReservationRequest` was created.

This closes out the Phase 32 decision pack's modify/cancel/handoff trio —
all three are now implemented. Remaining blockers for full Vapi parity:
menu routes (still out of scope) and the legacy dispatcher cutover (still a
separate architectural decision, not bundled with this phase). The old
Next.js/Supabase `modify-reservation-request` route (audit-only insert into
`reservation_changes`) and the legacy dispatcher's direct-UPDATE
`modify_reservation_request` case are both untouched and continue to serve
the production Vapi assistant; the Vapi dashboard has not been switched.

## 19. Phase 36 decision status (update)

Phase 36 was a documentation/decision-only phase (no code, schema, or
Vapi/Supabase changes) that resolved the menu data-source question this
assessment flagged as a **model gap** for `get-menu-info` and
`get-item-details` in Sections 2.10–2.11, 5, and 6–7 above ("no Menu/MenuItem
Prisma model exists" / "explicitly blocked on a Menu/MenuItem Prisma model
decision"). Full old-route behavior inventory, backend capability mapping,
options analysis, a draft future schema, and a future route behavior spec
now live in `docs/vapi-menu-routes-decision-pack.md` — this section only
records the resulting status change.

- **get-menu-info / get-item-details**: **Decision-ready, not implemented.**
  Decided data-source direction: defer real menu routes until dedicated
  `MenuCategory`/`MenuItem` Prisma models exist (recommended as Phase 37:
  schema + admin/API foundation, Phase 38: Vapi menu adapters + Supabase
  data migration). Storing menu data in an existing `Json?` column
  (`RestaurantSettings`/`IntegrationConnection.configJson`) was explicitly
  considered and rejected for this domain — see the decision pack's Option C
  for the full reasoning, including a new finding that menu data also has
  an active staff-facing admin UI today (`src/app/[lang]/admin/menu/actions.ts`),
  not just Vapi-read usage, which raises the bar against an unstructured-JSON
  shortcut.
- Both old per-tool routes were confirmed to be live, non-trivial,
  currently-serving tools (not legacy dead code) — `get-menu-info` returns
  the full active-item list as a formatted string with a static VAT footer;
  `get-item-details` does an ILIKE substring name match with a curated
  response shape. The legacy dispatcher's equivalents were also inspected
  and found to disagree on response shape (raw, unfiltered DB row for
  `get_item_details`) — explicitly rejected as a pattern for any future
  backend route.
- This changes nothing about Section 5/6's **Missing (model gap)**/**C/E**
  rating for these two routes other than confirming, via direct inspection,
  that the gap is real and recommending the specific resolution path
  (Phase 37/38) rather than leaving it open-ended.
- `docs/backend-production-cutover-plan.md` has been updated with an
  explicit menu-route cutover blocker, independent of (and not blocking)
  the cutover status of every other already-implemented Vapi tool.

## 20. Phase 37 status update

Phase 37 (Backend Menu Schema + Admin/API Foundation) implemented the
`MenuCategory`/`MenuItem` Prisma models, tenant-scoped CRUD routes/services,
and a `/backend-admin/menu` beta UI recommended above — see
`docs/backend-menu-foundation.md`. This closes the **model gap** itself (a
real schema now exists), but **does not change the route status**:
`get-menu-info`/`get-item-details` remain **Missing (no Vapi adapter
implemented)** — Phase 37 was schema/admin scope only, per its own
instructions, and explicitly did not implement either Vapi route or migrate
any Supabase `menu_items`/`menu_categories` data. The still-pending Phase 38
(Vapi menu adapters + data migration) is what would actually change these
two rows' status in Sections 5/6 above.

## 21. Phase 38 status update

Phase 38 (Backend Vapi Menu Adapters) implemented both routes:

- `POST /api/webhooks/vapi/:publicWebhookKey/get-menu-info` —
  `backend/src/utils/vapi/menuInfoAdapter.ts` + the route in
  `backend/src/routes/webhooks/vapi.ts`. Read-only over active
  `MenuCategory`/active+available `MenuItem` rows; returns a capped,
  voice-friendly summary (no filter), a category-filtered list, or a
  search-filtered list, with `menu_available:false`/`items_found:false`
  safe fallbacks. Never dumps the full menu unbounded (capped at
  `MAX_MENU_ITEMS_LIMIT` = 12).
- `POST /api/webhooks/vapi/:publicWebhookKey/get-item-details` —
  `backend/src/utils/vapi/itemDetailsAdapter.ts` + the same route file.
  Tiered restaurant-scoped name search (exact -> alias -> substring contains,
  see `findActiveMenuItemsByNameForVoice` in `menuService.ts`) — explicitly
  never picks a "first match" the way the old Supabase ILIKE route did
  (Section 2.11's documented limitation). Supports an explicit `itemId`
  lookup. An unavailable item is found but never presented as available; an
  inactive item or cross-tenant id is treated as not found.

This **updates the status for both rows** in Sections 5/6 above from
**Missing (no Vapi adapter implemented)** to **Implemented (backend
adapter), not yet cut over** — the distinction matters: a real backend
adapter now exists and is covered by pure-adapter unit tests
(`vapiMenuInfoAdapter.test.ts`, `vapiItemDetailsAdapter.test.ts`) and a
DB-backed integration test (`vapiMenu.integration.test.ts`), but:

- No Supabase `menu_items`/`menu_categories` data was migrated — the new
  backend tables only contain whatever a future migration or an admin
  creates through `/backend-admin/menu`.
- No Vapi dashboard URL was changed — the old
  `src/app/api/vapi/get-menu-info`/`get-item-details` routes are untouched
  and still serve the production Vapi assistant.
- Per `docs/vapi-menu-routes-decision-pack.md` Section 7, menu tool cutover
  remains explicitly blocked until a real Supabase -> backend menu data
  migration happens — implementing the adapter is a precondition for
  cutover, not cutover itself. See
  `docs/backend-production-cutover-plan.md` for the updated blocker note.

## 22. Phase 39 status update

A read-only menu data migration/import **dry-run** tool now exists —
`scripts/migration/menu-import-dry-run.ts` (see
`docs/menu-data-migration-plan.md` for the full plan). It reads local JSON
exports of the old Supabase `menu_categories`/`menu_items` tables,
normalizes/validates/maps them against the Phase 37 `MenuCategory`/
`MenuItem` models, and produces a JSON report (duplicate names, invalid/
missing prices, orphan category references, proposed mappings) — it never
connects to Supabase and **never writes to any database**.

This does not change Section 21's conclusion. The Phase 38 adapters are
unaffected; their cutover-blocked status is unchanged until a real write
import (Phase 40, not yet built) actually populates the backend menu tables
for the target restaurant and the adapter passes the same real-payload
parity comparison required of every other tool.
