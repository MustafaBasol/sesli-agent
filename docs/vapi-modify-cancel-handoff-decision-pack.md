# Phase 32 — Vapi Modify / Cancel / Handoff Behavior Decision Pack

Status: decision/design only. No `src/app/api/vapi/*`, no `/admin/*`, no
Prisma schema/migration, no Supabase connection, and no production data were
touched while producing this document. See "Checks performed" at the end.

This document exists to make the **behavior decision** for the three
remaining stubbed backend Vapi routes
(`modify-reservation-request`, `cancel-reservation-request`,
`handoff-to-staff`) explicit enough that Phase 33+ can implement them without
re-litigating product questions mid-implementation. It builds directly on
the Phase 26 parity assessment (`docs/backend-vapi-webhook-parity-assessment.md`,
sections 2.4–2.6, 3.2–3.4, 5, 6, 7), which already flagged all three as
**Blocker (behavior undecided)**. This phase resolves that blocker.

## 1. Old-route behavior (production, Supabase)

### 1.1 `POST /api/vapi/modify-reservation-request` (per-tool generation)

```
Route: src/app/api/vapi/modify-reservation-request/route.ts
Payload shapes accepted: customer_name|full_name|name; phone via
  phone_number|phone|caller_phone|customer_phone or Vapi envelope
  customer/call number; original_reservation_date|original_date;
  original_reservation_time|original_time; new_reservation_date|new_date|
  reservation_date|date; new_reservation_time|new_time|reservation_time|time;
  party_size|new_party_size|partySize|guests; language|lang; note|notes|
  special_request.
Required fields: (customer_name OR phone_number) AND new_reservation_date
  AND new_reservation_time. original_reservation_date/time, party_size, and
  note are optional.
Old response shape: missing fields -> buildMissingFieldsResponse(...);
  success -> getVapiResponse('reservation_received', language) — the exact
  same generic "received" message used by create-reservation-request. No
  modify-specific field, no resolved reservation id, no old-vs-new diff.
DB writes: tool_logs (insert "processing" -> update "success"/id);
  reservation_changes (insert only, status "new"). Does NOT touch
  reservation_requests or any reservation/table record.
Side effects: none beyond the two inserts above.
Failure behavior: any thrown error (including the Supabase insert error) is
  caught and returned via createVapiToolErrorResponse(rawBody, error.message)
  — note this leaks the raw Postgres/Supabase error message to the Vapi
  response, unlike the backend's pattern of a generic message + server-side
  logger.error.
Security/privacy notes: customer_name/phone_number/note all stored in
  reservation_changes.raw_payload (full request body) with no redaction.
Known inconsistencies: no existence check against any real reservation —
  any caller can submit a "modification" with no matching original booking,
  and the row is created regardless. Disagrees with the legacy dispatcher
  (1.4 below), which performs a real UPDATE rather than an audit insert.
```

### 1.2 `POST /api/vapi/cancel-reservation-request` (per-tool generation)

```
Route: src/app/api/vapi/cancel-reservation-request/route.ts
Payload shapes accepted: customer_name|full_name|name; phone aliases (same
  as 1.1); reservation_date|date|original_date; reservation_time|time|
  original_time; language|lang; reason|cancellation_reason|notes.
Required fields: (customer_name OR phone_number) AND reservation_date AND
  reservation_time.
Old response shape: missing fields -> standard shape; success ->
  getVapiResponse('reservation_received', language) — again the generic
  "received" message, not cancellation-specific.
DB writes: tool_logs (insert/update); reservation_cancellations (insert
  only, status "new"). Does NOT delete or status-transition
  reservation_requests.
Side effects: none beyond the two inserts.
Failure behavior: same pattern as 1.1 (raw error.message returned to Vapi).
Security/privacy notes: same raw_payload-at-rest pattern as 1.1.
Known inconsistencies: no existence check against the reservation being
  cancelled. Disagrees sharply with the legacy dispatcher (1.4 below), which
  performs a hard DELETE on reservation_requests.
```

### 1.3 `POST /api/vapi/handoff-to-staff` (per-tool generation)

```
Route: src/app/api/vapi/handoff-to-staff/route.ts
Payload shapes accepted: customer_name|full_name|name; phone aliases (same
  as 1.1); language|lang; reason|handoff_reason|request;
  conversation_summary|summary|notes; urgency|priority (default "normal").
Required fields: none. There is no missingFields block in this route at
  all — every field is optional, including reason and phone_number.
Old response shape: getVapiResponse('staff_handoff', language) — a
  handoff-specific message (e.g. "staff handoff successfully." +
  customer_message_fr/tr/en + text), distinct from the generic
  reservation_received shape used by 1.1/1.2.
DB writes: tool_logs (insert/update); staff_handoffs (insert only, status
  "new"). No Customer/Conversation/Message row is touched.
Side effects: none — no notification of any kind is sent to staff. The row
  sits in staff_handoffs until a human checks the admin UI.
Failure behavior: same pattern as 1.1/1.2.
Security/privacy notes: conversation_summary and reason stored verbatim in
  both staff_handoffs columns and raw_payload.
Known inconsistencies: disagrees completely with the legacy dispatcher's
  handoff_to_staff (1.4 below), which persists nothing at all.
```

### 1.4 Legacy dispatcher (`src/app/api/vapi/webhook/route.ts`) — conflicting behavior

The legacy `tool-calls` switch (lines ~434–467) implements the same three
tool names with **incompatible** behavior versus the per-tool routes above:

```
case 'modify_reservation_request':
  -> supabase.from('reservation_requests').update({ reservation_date,
     reservation_time, party_size }).eq('id', args.reservation_id)
  Directly UPDATEs the existing reservation_requests row by id. Requires
  the caller to already know args.reservation_id — there is no
  phone/name/date/time lookup fallback in this code path. If
  args.reservation_id is missing or doesn't match, Supabase's .single()
  errors and result becomes { success: false, message: error.message }.

case 'cancel_reservation_request':
  -> supabase.from('reservation_requests').delete().eq('id', args.reservation_id)
  Hard-deletes the row by id. Same args.reservation_id requirement as above,
  same missing-id failure mode. This is destructive and unrecoverable
  (no soft-delete, no audit trail beyond tool_logs.request_payload).

case 'handoff_to_staff':
  -> result = { success: true, message: "Transferring to staff..." }
  Pure canned response. No DB write of any kind, no staff_handoffs row.
```

**Conclusion:** the two production generations do not agree on what
"modify", "cancel", or "handoff" mean. Per Phase 26's note on route
maturity, this decision pack treats the **per-tool generation as the
behavior to extend** (audit-row pattern, no destructive mutation, no
required-but-undiscoverable `reservation_id`) and treats the legacy
dispatcher's direct-UPDATE/hard-DELETE/no-op behavior as **explicitly
rejected** for the backend, not as a second target to support. Whether the
legacy dispatcher is even still receiving live Vapi traffic for these three
tools is unconfirmed (Phase 26 backlog item, still open) — this remains a
prerequisite to check before final cutover, but does not block the behavior
decision itself.

## 2. Current backend model mapping

| Route | Can implement now with existing schema | Recommended storage model | Requires new model/migration | Privacy risk | Business-decision risk | Suggested implementation phase |
|---|---|---|---|---|---|---|
| modify-reservation-request | **Yes** | New `ReservationRequest` row, `requestType: "change"` (already a documented value in the Prisma schema's `requestType` comment — `create, change, cancel, question, handoff`) | No | Low | Medium (matching ambiguity — see 3A) | 33 |
| cancel-reservation-request | **Yes, partially** — only the "cancel a pending request" path; cancelling a *confirmed* `Reservation` is not recommended this phase (see 3B) | Existing pending `ReservationRequest` transitioned to `status: "cancelled"` via `setReservationRequestStatus`/`isValidStatusTransition` (already supports `new -> cancelled` and `pending_info -> cancelled`); fallback to a new `ReservationRequest` row with `requestType: "cancel"` when no unambiguous pending match exists | No | Low | Medium-High (false-positive cancellation if matching is wrong) | 34 |
| handoff-to-staff | **Yes** | `IntegrationEvent` (`eventType: "handoff_requested"`), same convention Phase 31 already established for `log-call-summary`; optionally bump `Conversation.status` to `"pending"` + create a `Message` if a `Conversation` can be resolved via `callId` | No | Low | Low (no notification claim made; matches already-decided Phase 22 direction) | 33 (recommended first — see Section 5) |

None of the three routes require a Prisma migration. This materially changes Phase 26's framing: Phase 26 listed all three as "Blocker (behavior undecided)" partly because it wasn't yet confirmed whether the existing schema could express the needed states — it can, via `ReservationRequest.requestType`/`status`, `Reservation.status`, and `IntegrationEvent`. The blocker was a product decision, not a schema gap, and this document resolves that decision.

## 3. Target behavior recommendations

### A. modify-reservation-request

**Recommendation: create a new `ReservationRequest` row with `requestType: "change"`, `status: "new"`.** Do not directly mutate any confirmed `Reservation` or existing `ReservationRequest`.

Rationale:

- Matches the per-tool generation's existing audit-only behavior (Section 1.1), which is the safer of the two production behaviors.
- `ReservationRequest.requestType` already documents `"change"` as an intended value in the Prisma schema comment — using it requires zero migration.
- Voice-call-originated change requests should be treated as **pending, human-confirmed** requests, not direct mutations, per the explicit instruction for this phase. A caller's voice claim of "move my booking to Friday" is not sufficient authority to silently change a paying customer's confirmed table without staff review.

Concretely, for Phase 33:

- Populate the new `ReservationRequest` with the *new* requested date/time/party size as the row's own `reservationDate`/`reservationTime`/`partySize` fields (so it sorts and displays alongside other pending requests in the existing admin UI without new columns).
- Store the *original* date/time (if the caller provided one) inside `rawPayload`, not as new dedicated columns — this avoids a schema change while still preserving the information for staff.
- Attempt a **best-effort, non-binding** match against existing `ReservationRequest`/`Reservation` rows by `normalizedPhone` (+ original date/time if given), and if exactly one candidate is found, reference its id inside `rawPayload` (e.g. `{ matchedReservationId, matchedReservationRequestId }`) purely as a hint for staff — **never auto-apply it**. If zero or multiple candidates are found, leave the hint empty; do not guess.
- Response to Vapi: reuse the existing `reservation_received`-style generic acknowledgment (matching the per-tool route's current contract so no Vapi-side prompt changes are forced), but internally distinguishable via `requestType: "change"` so the admin UI can label it correctly.

Explicitly out of scope for Phase 33 (deferred until there is a real need): an explicit `ReservationChange` model with `originalReservationId`/`newReservationId` foreign keys. If/when staff workflows need to query "all pending changes for reservation X" efficiently, that's the trigger to add it — not before.

### B. cancel-reservation-request

**Recommendation: split by match confidence.**

1. If the caller's (phone + date + time) matches **exactly one** non-terminal `ReservationRequest` (`status` in `new`/`pending_info`), transition it to `status: "cancelled"` via the existing `setReservationRequestStatus` + `isValidStatusTransition` (both already support this transition — no new code path needed, just a new caller).
2. If the caller's (phone + date + time) matches **exactly one** confirmed `Reservation`, **do not auto-cancel it this phase.** Create an audit `ReservationRequest` row (`requestType: "cancel"`, `status: "new"`) referencing the matched reservation id inside `rawPayload`, for staff to action manually — the same conservative pattern as today's per-tool route, just schema-aware instead of a dead-end audit table.
3. If there is no unambiguous match (zero or multiple candidates), fall back to the same audit-row creation as (2), with no match hint.

Rationale:

- **Never hard-delete** — this phase explicitly forbids it, and the legacy dispatcher's hard-DELETE behavior (1.4) is the behavior this decision pack is designed to retire, not extend.
- Cancelling a *pending* request (case 1) carries low blast radius: nothing has been confirmed to the customer yet, and the existing status-transition machinery already treats `cancelled` as a valid terminal state from `new`/`pending_info`. This is safe to automate.
- Cancelling a *confirmed* `Reservation` (case 2) carries real business risk if the phone/date/time match is wrong (a different customer with a similar name, a misheard date) — a restaurant could lose a paying table booking from a voice-recognition error with no human in the loop. This phase recommends keeping a human in the loop for that case specifically, consistent with "Prefer auditable cancellation intent over destructive deletion" and the instruction not to recommend hard-delete or silent destructive behavior.
- This recommendation reuses 100% existing schema and existing service functions (`setReservationRequestStatus`, `isValidStatusTransition`) for the safe case, and the same audit-row pattern already proven by `create-reservation-request`/`modify-reservation-request` for the risky case.

A confirmed-`Reservation` auto-cancel path *could* be added in a later phase once there's a deliberate decision (and likely a confirmation step — e.g. SMS/WhatsApp confirmation back to the customer) — that is out of scope here and should not be implemented speculatively.

### C. handoff-to-staff

**Recommendation: store as `IntegrationEvent` (`eventType: "handoff_requested"`), reusing Phase 31's `log-call-summary` convention exactly** (`prisma.integrationEvent.create({ restaurantId, integrationId: connection.id, channel: "voice", provider: "vapi", eventType: ..., status: "received", payload: <bounded, safe payload> })`). If a `Conversation` can be resolved via `callId` (same `{ restaurantId, channel: "voice", provider: "vapi", externalThreadId: callId }` key `create-reservation-request` already uses), additionally:

- create a `Message` (inbound, channel "voice", provider "vapi") carrying the handoff reason/summary, and
- set that `Conversation.status` to `"pending"` (an existing, already-modeled status value) so it surfaces in a future central-inbox "needs attention" view.

This is exactly the direction Phase 26 (section 5, handoff-to-staff row) already attributed to "AGENTS.md Phase 22" — this decision pack confirms and operationalizes it rather than re-deciding it.

**Critical documentation requirement, restated per this phase's instructions:** there is no staff notification channel (SMS/push/email/Slack) implemented anywhere in this codebase today. The Phase 33 implementation of this route must return a safe, generic "team will follow up" message to the voice assistant while the accompanying code comment and any contract doc **explicitly state that no notification is sent** — mirroring this decision pack's own wording, so a future reader doesn't assume staff are paged. This must not be allowed to silently regress into an implied promise the system doesn't keep.

## 4. Risk and sequencing recommendation

Validated against the code inspection in Sections 1–3:

1. **handoff-to-staff** — lowest risk. It is pure logging (`IntegrationEvent` + optional `Message`/`Conversation.status`) with zero mutation of reservation/customer state and zero matching-ambiguity risk; it directly reuses an already-proven Phase 31 pattern. Implement first.
2. **cancel-reservation-request** — medium risk, but bounded by the split in Section 3B: the safe (pending-request) path is mechanical reuse of existing service functions; the risky (confirmed-reservation) path is deliberately deferred to an audit row rather than implemented as an auto-cancel. Implement second.
3. **modify-reservation-request** — highest risk of the three, because matching a caller's claimed original booking against existing rows is inherently fuzzy (name/phone/date/time voice transcription errors), and any wrong auto-match-and-apply would mutate someone else's reservation. The Section 3A recommendation avoids ever auto-applying a match, which keeps the risk bounded to "an audit row plus a wrong hint" rather than "a wrong mutation" — but it still requires more new logic (the best-effort matching itself) than 1 or 2. Implement third.
4. **menu routes** — blocked by the absence of any `Menu`/`MenuItem` Prisma model (confirmed gap, Phase 26 section 2.10–2.11, 5, 6); out of scope for Phase 32/33+ until that model decision is made separately.
5. **legacy dispatcher cutover** — last, and explicitly not bundled with 1–3 above. Section 1.4 establishes that the legacy dispatcher's modify/cancel/handoff behavior is being *retired*, not matched, so "cutover" for this dispatcher is really "confirm it is safe to stop routing Vapi traffic to it" — a separate architectural question (per Phase 26 section 6/7) from implementing the three per-tool backend routes.

This ranking matches the order suggested in the Phase 32 prompt and is confirmed, not just assumed, by the code-level risk analysis above.

## 5. Acceptance criteria for future implementation phases

### handoff-to-staff (target: Phase 33) — IMPLEMENTED in Phase 33

- Vapi-compatible payload normalization (reuse `getValueFromAliases` aliasing already used by the old route: `customer_name|full_name|name`, phone aliases, `reason|handoff_reason|request`, `conversation_summary|summary|notes`, `urgency|priority`). Implemented in `backend/src/utils/vapi/handoffToStaffAdapter.ts`.
- `IntegrationEvent` created with `eventType` (implemented as `"handoff_to_staff"` — a Phase 33 naming choice, the spec allowed either `"handoff_to_staff"` or `"staff_handoff_requested"`), bounded/safe payload (no raw transcript, consistent with Phase 31's data-minimization stance).
- `ToolLog` success/failure recorded (processing -> success/failure, matching the Phase 27–31 pattern).
- No `Customer`/`ReservationRequest`/`Reservation` mutation — verified by the integration test.
- The optional `Conversation`/`Message` write was **deferred** in Phase 33, per this section's own fallback guidance ("if it does not resolve, skip — do not error") interpreted conservatively: `IntegrationEvent` only. Revisit if/when a `Conversation`-aware staff inbox view needs it.
- Response is safe for a voice assistant to read aloud (no internal ids, no raw error text) and does **not** claim staff have been notified — verified by an explicit `assert.ok(!/notified/i.test(...))` check in both the pure adapter test and the DB-backed integration test.
- DB-backed integration test added: `backend/src/tests/vapiHandoffToStaff.integration.test.ts` (success path, callId-only path, unknown/inactive webhook key -> 401, no Customer/ReservationRequest/Reservation created, nested tool-call envelope, truncation, sensitive-field leak check). Not wired into `npm test` (needs `DATABASE_URL`), run via `npm run test:vapi-handoff-to-staff`.
- Pure adapter test added: `backend/src/tests/vapiHandoffToStaffAdapter.test.ts`, wired into `npm test` via `npm run test:vapi-handoff-to-staff-adapter`.
- Gated by the existing `SMOKE_RUN_WRITE_CHECKS` convention — added to `scripts/smoke-backend-beta.sh`.

### cancel-reservation-request (target: Phase 34) — IMPLEMENTED in Phase 34

- No hard-delete, ever — confirmed against both the pending-request and confirmed-reservation code paths.
- Matching rule, as implemented: an explicit `reservationRequestId` (preferred, tenant-scoped lookup) or an exact normalizedPhone + reservationDate + reservationTime match against pending requests only — no fuzzy/partial matching. (One refinement versus this section's original wording: a confirmed `Reservation` can also be referenced directly via `reservationId`, in which case it is always logged for review, never matched/cancelled by phone+date+time.)
- Pending-request match -> `setReservationRequestStatus(..., "cancelled")`, reusing `isValidStatusTransition`/`STATUS_TRANSITIONS` as-is — no new transition logic was added. Confirmed/rejected/cancelled/done requests are never force-transitioned even though the map technically permits `confirmed -> cancelled`; Phase 34 deliberately excludes that case from auto-cancel.
- Confirmed-`Reservation` match (via `reservationId`), confirmed/terminal `ReservationRequest` match, ambiguous match, or no match -> a single bounded `IntegrationEvent` (`eventType: "reservation_cancellation_requested"`) only; nothing is silently cancelled by any of these paths.
- Conflict (multiple candidate matches) is handled by falling through to the audit-event path, not by guessing or erroring 500.
- `ToolLog` + response contract consistent with the other implemented routes; response wording never claims a confirmed reservation was cancelled unless it actually was.
- DB-backed integration test added: `backend/src/tests/vapiCancelReservationRequest.integration.test.ts`, covering successful pending-cancel (by id and by phone+date+time match), non-existing id, confirmed-request audit fallback, ambiguous-match audit fallback, confirmed-Reservation audit fallback, unknown/inactive webhook key, cross-tenant isolation, alias normalization, nested tool-call envelope, reason truncation, and the sensitive-field leak check. Not wired into `npm test` (needs `DATABASE_URL`), run via `npm run test:vapi-cancel-reservation-request`.
- Pure adapter test added: `backend/src/tests/vapiCancelReservationRequestAdapter.test.ts`, wired into `npm test` via `npm run test:vapi-cancel-reservation-request-adapter`.
- Gated by the existing `SMOKE_RUN_WRITE_CHECKS` convention — added to `scripts/smoke-backend-beta.sh`, using a fake/non-existing `reservationRequestId` so the smoke command only ever exercises the audit-intent-logging path.

### modify-reservation-request (target: Phase 35) — IMPLEMENTED in Phase 35

- No direct mutation of any confirmed `Reservation` or existing `ReservationRequest` — verified by integration tests asserting the matched row(s), if any, are unchanged after the call (status, date/time/party all untouched).
- Matching rule, as implemented: an explicit `reservationRequestId` (preferred, tenant-scoped lookup) or an exact normalizedPhone + currentDate + currentTime match against pending requests only — no fuzzy/partial matching. A confirmed `Reservation` can also be referenced directly via `reservationId`, in which case it is always logged for review (and, where the schema supports it, paired with a new change request) rather than matched/updated by phone+date+time.
- A second, separately-tracked `ReservationRequest` row is created with `requestType: "change"` only when an unambiguous pending target was found (matched pending request, confirmed Reservation by id). Unmatched, ambiguous, or confirmed/terminal `ReservationRequest` matches log an `IntegrationEvent` only — no change request is fabricated without a target to link it to. The new row carries the *requested* new values (so staff see what's being asked for) and references the original record only via a bounded `internalNote` — there is no FK between `ReservationRequest` rows in this schema, and none was added.
- Validation policy implemented as a two-part check: at least one identifying field AND at least one requested-change field must be present, otherwise `success:false` with `missing_fields`. A provided-but-unparseable date/time is detected separately from "not provided" and also returns a safe `success:false`, HTTP 200 — never silently treated as absent.
- Safe response for the voice assistant: generic "recorded for the restaurant team to review" acknowledgment in every outcome; never claims a reservation was changed.
- DB-backed integration test added: `backend/src/tests/vapiModifyReservationRequest.integration.test.ts`, covering missing-identity/missing-change/both-missing validation, pending-request change-request creation (by id and by phone+date+time match), non-existing id, confirmed-request audit fallback, confirmed-Reservation change-request creation, ambiguous-match audit fallback, unknown/inactive webhook key, cross-tenant isolation, alias normalization, nested tool-call envelope, invalid date/time format, reason/newNotes truncation, and the sensitive-field leak check. Not wired into `npm test` (needs `DATABASE_URL`), run via `npm run test:vapi-modify-reservation-request`.
- Pure adapter test added: `backend/src/tests/vapiModifyReservationRequestAdapter.test.ts`, wired into `npm test` via `npm run test:vapi-modify-reservation-request-adapter`.
- Gated by the existing `SMOKE_RUN_WRITE_CHECKS` convention — added to `scripts/smoke-backend-beta.sh`, using a fake/non-existing `reservationRequestId` so the smoke command only ever exercises the audit-intent-logging path.

## 6. Documentation created/updated

Created:

- `docs/vapi-modify-cancel-handoff-decision-pack.md` (this file).

Updated:

- `docs/backend-vapi-webhook-parity-assessment.md` — added a "Phase 32" status section recording that modify/cancel/handoff are now decision-ready (not implemented), pointing at this document.
- `docs/backend-production-cutover-plan.md` — added an explicit remaining-blocker note stating Vapi dashboard cutover is still not allowed until modify/cancel/handoff are both decided (now true, by this document) and implemented (still not true).

`docs/backend-beta-smoke-tests.md` was not modified — it already documents that only currently-implemented write paths are smoke-tested, and the acceptance criteria above (Section 5) already specify when each new route should be added to that list, which is sufficient without editing the file speculatively ahead of implementation.

## 7. Checks performed

- `git diff --name-only` shows documentation files only (this file, plus the two updates listed in Section 6).
- No file under `src/app/api/vapi/*` was modified.
- No file under `/admin/*` (or any Next.js `[lang]/admin` route) was modified.
- No Prisma schema or migration file was modified.
- No connection was made to Supabase or any live/production database.
- No production data was read, written, or touched.
- No Vapi dashboard URL or tool configuration was changed.
- Menu routes and legacy dispatcher cutover were not implemented (out of scope, per Section 4 sequencing).

If any non-doc file changed during this phase, that would be a mistake requiring explanation and review before proceeding — none did.

## 8. Report summary

- **Files inspected**: `src/app/api/vapi/modify-reservation-request/route.ts`, `src/app/api/vapi/cancel-reservation-request/route.ts`, `src/app/api/vapi/handoff-to-staff/route.ts`, `src/app/api/vapi/webhook/route.ts` (tool-calls switch, lines ~434–490), `backend/src/prisma/schema.prisma` (`ReservationRequest`, `Reservation`, `Conversation`, `Message`, `IntegrationEvent`, `ToolLog` models), `backend/src/services/reservationRequestQuery.ts` (`STATUS_TRANSITIONS`, `isValidStatusTransition`), `backend/src/services/reservationRequestService.ts` (`setReservationRequestStatus`, `confirmReservationRequestWithReservation`), `backend/src/routes/webhooks/vapi.ts` (log-call-summary implementation as the `IntegrationEvent` precedent; modify/cancel/handoff stub handlers), `docs/backend-vapi-webhook-parity-assessment.md` (sections 1–8, 14), `docs/backend-production-cutover-plan.md`.
- **Old behavior**: modify and cancel are audit-only inserts in the per-tool routes (`reservation_changes`/`reservation_cancellations`) but a direct UPDATE / hard DELETE in the legacy dispatcher — the two generations disagree. Handoff is a persisted `staff_handoffs` row in the per-tool route but a no-op canned response in the legacy dispatcher.
- **Backend model mapping**: all three are implementable today without any schema change — `ReservationRequest.requestType` already anticipates `"change"`/`"cancel"`/`"handoff"`, `Reservation.status` already supports `"cancelled"`, and `IntegrationEvent` already has a proven usage pattern from Phase 31.
- **Recommended behavior**: modify -> new audit `ReservationRequest` (`requestType: "change"`), never auto-applied; cancel -> auto-cancel only unambiguous *pending* requests via existing status transitions, audit-only for anything touching a confirmed reservation or any ambiguous match; handoff -> `IntegrationEvent` + optional `Conversation`/`Message`, explicitly no staff notification claim.
- **Recommended order**: handoff-to-staff (Phase 33) -> cancel-reservation-request (Phase 34) -> modify-reservation-request (Phase 35), with menu routes and legacy dispatcher cutover deferred separately.
- **Acceptance criteria**: defined per-route in Section 5.
- **Docs created/updated**: this file (new); `docs/backend-vapi-webhook-parity-assessment.md` and `docs/backend-production-cutover-plan.md` (status notes appended).
- **No code/runtime files were changed.** No `src/app/api/vapi/*`, `/admin/*`, Prisma schema/migration, Supabase connection, production data, or Vapi dashboard URL was touched.

Do not start Phase 33 until this Phase 32 decision pack is accepted.
