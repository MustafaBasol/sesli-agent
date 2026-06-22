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
