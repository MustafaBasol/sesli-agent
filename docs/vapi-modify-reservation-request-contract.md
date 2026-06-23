# Vapi modify-reservation-request webhook contract (Phase 35)

Covers `POST /api/webhooks/vapi/:publicWebhookKey/modify-reservation-request`
in `backend/src/routes/webhooks/vapi.ts`. The live Vapi dashboard URL is
**unchanged** — it still serves
`src/app/api/vapi/modify-reservation-request/route.ts`. This backend route
is available for controlled test calls only.

Implements the Phase 32 decision recorded in
`docs/vapi-modify-cancel-handoff-decision-pack.md` Section 3A and Section 5
("modify-reservation-request" acceptance criteria), refined by this phase's
explicit instructions.

## Tenant resolution

`restaurantId` is resolved from `IntegrationConnection.publicWebhookKey`
(`channel: "vapi"`). An unknown key, or a connection whose `status !== "active"`,
is rejected with `401` (never a 500, never a leaked restaurantId guess).

## Accepted payload shapes

Same shapes the other Vapi adapters in this backend accept
(`parseVapiPayload` + `getValueFromAliases`):

- Flat JSON body (arguments at the root).
- Nested Vapi tool-call envelope: `message.toolCalls[0].function.arguments`,
  `message.toolCallList[0].function.arguments`, or `toolCall.function.arguments`
  — as either a JSON string or an object.
- camelCase or snake_case field names, interchangeably.

### Field aliases

| Field | Aliases |
|---|---|
| reservationRequestId | `reservationRequestId`, `reservation_request_id`, `requestId`, `request_id` |
| reservationId | `reservationId`, `reservation_id` |
| callId | `call_id` on the parsed payload, then `callId`/`call_id`/`conversationId`/`vapiCallId`/`id`, then `message.call.id`/`call.id`, then the Vapi tool-call id |
| customerName | `customerName`, `name`, `fullName` |
| phone | `phone`, `phoneNumber`, `callerNumber`, `customerPhone` (+ Vapi envelope caller-number fallback) |
| email | `email`, `customerEmail` |
| currentDate | `currentDate`, `current_date`, `originalDate`, `original_date`, `existingDate` |
| currentTime | `currentTime`, `current_time`, `originalTime`, `original_time`, `existingTime` |
| newDate | `newDate`, `new_date`, `requestedDate`, `requested_date`, `reservationDate`, `reservation_date`, `date` |
| newTime | `newTime`, `new_time`, `requestedTime`, `requested_time`, `reservationTime`, `reservation_time`, `time` |
| newPartySize | `newPartySize`, `new_party_size`, `requestedPartySize`, `requested_party_size`, `partySize`, `numberOfGuests`, `guests`, `guestCount` |
| newNotes | `newNotes`, `new_notes`, `specialRequests`, `special_requests`, `notes` |
| reason | `reason`, `modificationReason`, `modification_reason`, `changeReason`, `change_reason` |
| language | `language`, `lang`, `locale` |

`currentDate`/`newDate` and `currentTime`/`newTime` are normalized with the
same `normalizeDate`/`normalizeTime` helpers used by the other adapters. A
provided-but-unrecognizable value normalizes to `null` **and** is flagged
internally as "provided but invalid" — this is distinct from "not provided"
and produces its own safe response (see "Required fields" below), rather
than silently being treated as absent.

## Required fields

This route needs **both** an identifying field **and** a requested-change
field — either category alone is not enough to act on or even log
meaningfully:

- Identity: `reservationRequestId`, `reservationId`, `phone`, `customerName`,
  `currentDate`, `currentTime`, or `callId`.
- Requested change: `newDate`, `newTime`, `newPartySize`, `newNotes`, or
  `reason`.

Missing either (or both) returns, listing whichever category is missing:

```json
{ "success": false, "message": "...", "missing_fields": ["reservationRequestId_or_reservationId_or_phone_or_customerName_or_currentDate_or_currentTime_or_callId", "newDate_or_newTime_or_newPartySize_or_newNotes_or_reason"] }
```

This always returns `success:false` with `200`, never a `500`, and is
logged as a `ToolLog` `"failure"`.

A `currentDate`/`currentTime`/`newDate`/`newTime` value that was supplied but
could not be parsed also returns a safe `success:false`, `200` (no
`missing_fields`, since something *was* supplied — just unparseable):

```json
{ "success": false, "message": "I didn't understand the date or time you mentioned. Could you say it again?" }
```

## Matching and mutation policy

Evaluated in this order. **No branch ever writes to an existing
`ReservationRequest`'s or `Reservation`'s date/time/party/status fields.**

**A. Explicit `reservationRequestId`** — looked up scoped to the resolved
`restaurantId` (a cross-tenant id is indistinguishable from "not found").

- Not found -> logged only (`match_status: "unmatched"`).
- Found, status `new` or `pending_info` -> a new, separate
  `ReservationRequest` row is created with `requestType: "change"`,
  carrying the requested new values and an `internalNote` referencing the
  original id (`match_status: "exact"`, `change_request_created: true`).
  The original row is **never** written to.
- Found, any other status (`confirmed`, `rejected`, `cancelled`, `done`) ->
  **never force-mutated and no change request is created** — logged only
  (`match_status: "confirmed_reservation_review_required"`).

**B. No `reservationRequestId`, but `reservationId` present** — references a
confirmed `Reservation` directly. **This phase never updates a confirmed
`Reservation`.**

- Found -> a new `ReservationRequest` (`requestType: "change"`) is created
  for human review, referencing the Reservation id in `internalNote`
  (`match_status: "confirmed_reservation_review_required"`,
  `change_request_created: true`). The `Reservation` itself is untouched.
- Not found -> logged only (`match_status: "unmatched"`).

**C. No explicit id, but `phone` + `currentDate` + `currentTime` present** —
an exact (no fuzzy matching) lookup against pending (`new`/`pending_info`)
`ReservationRequest` rows by `normalizedPhone` + `reservationDate` +
`reservationTime` (the same `findUnambiguousPendingMatch` helper used by
`cancel-reservation-request`).

- Exactly one match -> a new change `ReservationRequest` is created the same
  way as A (`match_status: "exact"`).
- Zero matches -> logged only (`match_status: "unmatched"`).
- More than one match -> logged only, **never guessed**
  (`match_status: "ambiguous"`).

**D. General fallback** — none of A/B/C applied (e.g. only a `customerName`
or `reason` was given) -> logged only (`match_status: "unmatched"`).

**Hard-delete is never performed.** No code path in this route calls
`delete`/`deleteMany` on any model.

## Response shape

```ts
{
  success: boolean;
  message: string;
  modification_requested?: boolean;
  modification_logged?: boolean;
  change_request_created?: boolean;
  requires_review?: boolean;
  match_status?: string;
  event_id?: string;
  change_request_id?: string;
  reservation_request_id?: string;
  missing_fields?: string[];
}
```

Change request created (branches A-exact, B-found, C-exact):

```json
{ "success": true, "message": "Your modification request has been recorded for the restaurant team to review.", "modification_requested": true, "requires_review": true, "change_request_created": true, "match_status": "exact", "event_id": "<uuid>", "change_request_id": "<uuid>", "reservation_request_id": "<uuid>" }
```

`reservation_request_id` (the *original* record's id) is only included
alongside `change_request_id` when an original `ReservationRequest` row was
actually matched (A-exact, C-exact) — not for B, where the original is a
`Reservation`, not a `ReservationRequest`.

Anything else (unmatched, ambiguous, or confirmed/terminal request):

```json
{ "success": true, "message": "Your modification request has been recorded for the restaurant team to review.", "modification_requested": true, "requires_review": true, "modification_logged": true, "match_status": "...", "event_id": "<uuid>" }
```

Voice-friendly text is provided in English, Turkish, and French, selected
by the resolved `language`, falling back to English. **No response wording
ever claims a reservation was changed** — verified by an explicit
`assert.ok(!/\bchanged\b/i.test(...))` check in both the pure adapter test
and the DB-backed integration test for every outcome.

## Storage policy

Every accepted call creates exactly one `IntegrationEvent` row, regardless
of which branch (A/B/C/D) was taken — this is the route's primary audit
trail:

| Field | Value |
|---|---|
| `restaurantId` | resolved tenant |
| `integrationId` | `IntegrationConnection.id` |
| `channel` | `"voice"` |
| `provider` | `"vapi"` |
| `eventType` | `"reservation_modification_requested"` |
| `status` | `"received"` |
| `payload` | bounded/safe object — see below |

`payload` only ever contains: `callId`, `reservationRequestId`,
`reservationId`, `customerName`, `phone`, `email`, `currentDate`,
`currentTime`, `newDate`, `newTime`, `newPartySize`, `newNotes` (truncated
to 2,000 chars), `reason` (truncated to 2,000 chars), `language`,
`matchStatus`, `actionTaken` (`change_request_created` / `intent_logged` /
`review_required`), `requestedAt` (ISO timestamp), `source: "vapi"`. It
never contains the raw inbound body, a transcript, or headers/secrets.

When a change request is created, a second `ReservationRequest` row is
inserted with `requestType: "change"`, `status: "new"` (pending/
review-required, never confirmed), the *requested* new values
(`reservationDate`/`reservationTime`/`partySize`/`specialRequest`), and an
`internalNote` referencing the original `ReservationRequest`/`Reservation`
id and the caller's stated reason — there is no foreign-key relation
between `ReservationRequest` rows in this schema, so `internalNote` is the
only link, and none was added. This route never creates a `Customer`, never
creates/deletes a `Reservation`, and never mutates an existing
`ReservationRequest` or `Reservation` in place.

## ToolLog behavior

A `ToolLog` row (`toolName: "modify_reservation_request"`, `channel:
"voice"`, `provider: "vapi"`) is created in `"processing"` status as soon as
tenant resolution and payload parsing succeed — before the missing-fields
and invalid-format checks, same convention as the other Vapi adapters.

| Outcome | `ToolLog.status` | Notes |
|---|---|---|
| Missing identity and/or requested change | `failure` | `errorMessage` lists the missing-fields code(s) |
| Invalid date/time format | `failure` | `errorMessage: "Invalid date/time format"` |
| Handled (change request created or logged-only) | `success` | `responsePayload: { eventId, matchStatus, actionTaken, changeRequestId }` — never the full event payload or `rawPayload` |
| Internal exception | `failure` | `errorMessage` set; generic error returned to Vapi, real error only in server logs (`logger.error`) |

## Sensitive/internal field policy

This route never returns: `passwordHash`, `resetToken`, `session`,
`refreshToken`, `jwt`/`JWT`, `credentials`, `credentialsEncrypted`,
`webhookVerifyTokenHash`, `accessToken`, `apiKey`, `providerSecret`,
`clientSecret`, `tokenValue`, `rawPayload`, `stateJson`,
`availableTableIds`, `tableIds`, `transcript`, `fullTranscript`, internal
provider ids, or full DB relation objects. Verified by
`assertNoSensitiveFields(...)` in
`backend/src/tests/vapiModifyReservationRequest.integration.test.ts`.

## Intentional deviations from the old Next.js route

- The old route (`src/app/api/vapi/modify-reservation-request/route.ts`)
  inserted into `reservation_changes` unconditionally, with no resolved
  reservation id and no old-vs-new diff; this route only ever creates a
  change `ReservationRequest` when an unambiguous target was actually
  matched, and otherwise logs via `IntegrationEvent` alone.
- The legacy dispatcher's `modify_reservation_request` case directly
  `UPDATE`s `reservation_requests` by id. This backend route intentionally
  never updates an existing `ReservationRequest`/`Reservation` in place —
  that legacy behavior is being retired, not extended (see the decision
  pack, Section 1.4).
- The old route leaked the raw Postgres/Supabase error message on failure;
  this route returns a generic error and logs the real error server-side
  only (`logger.error`).

## Rollback note

This is a net-new backend route; nothing existing depends on it. Disabling
it (if ever needed) requires no code rollback for the live Vapi integration,
because the Vapi dashboard was never pointed at it — see "Cutover status"
below.

## Cutover status

Not performed. The Vapi dashboard URL still points at the Next.js route.
See `docs/backend-production-cutover-plan.md`, "Remaining blocker: modify
now built but never directly modifies a confirmed reservation (Phase 35
update)".
