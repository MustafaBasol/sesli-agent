# Vapi cancel-reservation-request webhook contract (Phase 34)

Covers `POST /api/webhooks/vapi/:publicWebhookKey/cancel-reservation-request`
in `backend/src/routes/webhooks/vapi.ts`. The live Vapi dashboard URL is
**unchanged** — it still serves
`src/app/api/vapi/cancel-reservation-request/route.ts`. This backend route
is available for controlled test calls only.

Implements the Phase 32 decision recorded in
`docs/vapi-modify-cancel-handoff-decision-pack.md` Section 3B and Section 5
("cancel-reservation-request" acceptance criteria), refined by this phase's
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
| callId | `call_id` on the parsed payload, then `call_id`/`callId`/`conversation_id`/`conversationId`/`vapiCallId`/`id`, then `message.call.id`/`call.id`, then the Vapi tool-call id |
| customerName | `customerName`, `name`, `fullName`, `customer_name`, `full_name` |
| phone | `phone`, `phoneNumber`, `callerNumber`, `customerPhone` (+ Vapi envelope caller-number fallback) |
| email | `email`, `customerEmail` |
| date | `date`, `reservationDate`, `reservation_date`, `localDate` |
| time | `time`, `reservationTime`, `reservation_time`, `preferredTime` |
| partySize | `partySize`, `party_size`, `numberOfGuests`, `guests`, `guestCount`, `guest_count` |
| reason | `reason`, `cancellationReason`, `cancellation_reason` |
| language | `language`, `lang`, `locale` |

`date`/`time` are normalized with the same `normalizeDate`/`normalizeTime`
helpers used by `create-reservation-request`; an unrecognizable date/time
normalizes to `null` rather than throwing — an invalid date/time never
surfaces as a 500.

## Required fields

No single field is strictly required. At least one of
`reservationRequestId`, `reservationId`, `phone`, `customerName`, `date`,
`time`, `callId`, or `reason` must be present — a completely empty payload
has nothing to act on or even log:

```json
{ "success": false, "message": "...", "missing_fields": ["reservationRequestId_or_reservationId_or_phone_or_customerName_or_date_or_time_or_callId_or_reason"] }
```

This always returns `success:false` with `200`, never a `500` or a thrown
error, and is logged as a `ToolLog` `"failure"`.

## Matching and mutation policy

Evaluated in this order:

**A. Explicit `reservationRequestId`** — looked up scoped to the resolved
`restaurantId` (a cross-tenant id is indistinguishable from "not found").

- Not found -> logged only (`match_status: "unmatched"`).
- Found, status `new` or `pending_info` -> cancelled via the existing
  `setReservationRequestStatus`/`isValidStatusTransition` machinery
  (`match_status: "exact"`, `reservation_request_cancelled: true`).
- Found, any other status (`confirmed`, `rejected`, `cancelled`, `done`) ->
  **never force-mutated** — logged only
  (`match_status: "confirmed_reservation_review_required"`).

**B. No `reservationRequestId`, but `phone` + `date` + `time` present** —
an exact (no fuzzy matching) lookup against pending (`new`/`pending_info`)
`ReservationRequest` rows by `normalizedPhone` + `reservationDate` +
`reservationTime`.

- Exactly one match -> cancelled the same way as A (`match_status: "exact"`).
- Zero matches -> logged only (`match_status: "unmatched"`).
- More than one match -> logged only, **never guessed**
  (`match_status: "ambiguous"`).

**C. Explicit `reservationId`** (only reached if neither A nor B applied) —
references a confirmed `Reservation` directly. **This phase never cancels a
confirmed `Reservation`, regardless of whether it is found.** Found ->
`match_status: "confirmed_reservation_review_required"`; not found ->
`match_status: "unmatched"`. Either way, only an `IntegrationEvent` is
created.

**D. General fallback** — none of A/B/C applied (e.g. only a `reason` or
`callId` was given) -> logged only (`match_status: "unmatched"`).

**Hard-delete is never performed.** No code path in this route calls
`delete`/`deleteMany` on any model.

## Response shape

```ts
{
  success: boolean;
  message: string;
  cancellation_requested?: boolean;
  cancellation_logged?: boolean;
  reservation_request_cancelled?: boolean;
  requires_review?: boolean;
  match_status?: string;
  event_id?: string;
  reservation_request_id?: string;
  missing_fields?: string[];
}
```

Pending-request cancelled:

```json
{ "success": true, "message": "Your pending reservation request has been cancelled.", "cancellation_requested": true, "reservation_request_cancelled": true, "match_status": "exact", "reservation_request_id": "<uuid>" }
```

Anything else (confirmed reservation, ambiguous, no match, terminal request):

```json
{ "success": true, "message": "Your cancellation request has been recorded for the restaurant team to review.", "cancellation_requested": true, "cancellation_logged": true, "requires_review": true, "match_status": "...", "event_id": "<uuid>" }
```

Voice-friendly text is provided in English, Turkish, and French, selected
by the resolved `language`, falling back to English. **The "review"
response wording never claims a confirmed reservation was cancelled** —
verified by an explicit `assert.ok(!/cancelled/i.test(...))` check in both
the pure adapter test and the DB-backed integration test for every
review-required case.

## Storage policy

Every accepted call creates exactly one `IntegrationEvent` row, regardless
of which branch (A/B/C/D) was taken — this is the route's single audit
trail:

| Field | Value |
|---|---|
| `restaurantId` | resolved tenant |
| `integrationId` | `IntegrationConnection.id` |
| `channel` | `"voice"` |
| `provider` | `"vapi"` |
| `eventType` | `"reservation_cancellation_requested"` |
| `status` | `"received"` |
| `payload` | bounded/safe object — see below |

`payload` only ever contains: `callId`, `reservationRequestId`,
`reservationId`, `customerName`, `phone`, `email`, `date`, `time`,
`partySize`, `reason` (truncated to 2,000 chars), `language`, `matchStatus`,
`actionTaken` (`pending_request_cancelled` / `intent_logged` /
`review_required`), `requestedAt` (ISO timestamp), `source: "vapi"`. It
never contains the raw inbound body, a transcript, or headers/secrets.

This route never creates a `Customer` or a `Reservation`, and never
deletes anything. The only mutation it ever performs is a single
`ReservationRequest.status` update (`-> "cancelled"`), and only for an
unambiguous pending match.

## ToolLog behavior

A `ToolLog` row (`toolName: "cancel_reservation_request"`, `channel:
"voice"`, `provider: "vapi"`) is created in `"processing"` status as soon as
tenant resolution and payload parsing succeed — before the missing-fields
check, same convention as the other Vapi adapters.

| Outcome | `ToolLog.status` | Notes |
|---|---|---|
| No identifying field present | `failure` | `errorMessage` lists the missing-fields code |
| Handled (cancelled or logged-only) | `success` | `responsePayload: { eventId, matchStatus, actionTaken, reservationRequestId }` — never the full event payload or `rawPayload` |
| Internal exception | `failure` | `errorMessage` set; generic error returned to Vapi, real error only in server logs (`logger.error`) |

## Sensitive/internal field policy

This route never returns: `passwordHash`, `resetToken`, `session`,
`refreshToken`, `jwt`/`JWT`, `credentials`, `credentialsEncrypted`,
`webhookVerifyTokenHash`, `accessToken`, `apiKey`, `providerSecret`,
`clientSecret`, `tokenValue`, `rawPayload`, `stateJson`,
`availableTableIds`, `tableIds`, `transcript`, `fullTranscript`, internal
provider ids, or full DB relation objects. Verified by
`assertNoSensitiveFields(...)` in
`backend/src/tests/vapiCancelReservationRequest.integration.test.ts`.

## Intentional deviations from the old Next.js route

- The old route (`src/app/api/vapi/cancel-reservation-request/route.ts`)
  required `(customer_name OR phone_number) AND reservation_date AND
  reservation_time`; this route's required-field policy is looser (any one
  of eight identifying fields) since `reservationRequestId`/`reservationId`
  alone are sufficient to act on.
- The old route always inserted into `reservation_cancellations`
  unconditionally, with no existence check against any real reservation;
  this route only ever mutates a `ReservationRequest` when the match is
  unambiguous and pending, and otherwise logs via `IntegrationEvent`
  instead of a dedicated cancellations table.
- The old route leaked the raw Postgres/Supabase error message on failure;
  this route returns a generic error and logs the real error server-side
  only (`logger.error`).
- The legacy dispatcher's `cancel_reservation_request` case performs a hard
  `DELETE` on `reservation_requests` by `args.reservation_id`. This backend
  route intentionally never deletes anything — that legacy behavior is
  being retired, not extended (see the decision pack, Section 1.4).

## Rollback note

This is a net-new backend route; nothing existing depends on it. Disabling
it (if ever needed) requires no code rollback for the live Vapi integration,
because the Vapi dashboard was never pointed at it — see "Cutover status"
below.

## Cutover status

Not performed. The Vapi dashboard URL still points at the Next.js route.
See `docs/backend-production-cutover-plan.md`, "Remaining blocker: modify
still unimplemented; cancel now built but never auto-cancels a confirmed
reservation (Phase 34 update)".
