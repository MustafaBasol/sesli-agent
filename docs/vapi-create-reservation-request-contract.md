# Vapi `create-reservation-request` backend contract (Phase 28)

Endpoint: `POST /api/webhooks/vapi/:publicWebhookKey/create-reservation-request`

Status: **hardened, not cut over.** The live Vapi dashboard still points at
`src/app/api/vapi/create-reservation-request/route.ts` (Next.js/Supabase).
This document describes the backend adapter only — see
`docs/backend-production-cutover-plan.md` Section E for cutover status.

## Tenant resolution

The restaurant is resolved exclusively from
`IntegrationConnection.publicWebhookKey` (`channel: "vapi"`). As of Phase 28,
a connection that resolves but has `status !== "active"` is rejected with the
same 401 as an unknown key — this closes the gap noted in
`docs/backend-vapi-webhook-parity-assessment.md` Section 7 (previously an
`inactive`/`error` connection still worked).

## Supported payload shapes

All of the following are accepted, in this lookup order: parsed
tool-call envelope first, then the raw body, so a field can come from either:

- Flat JSON body (root-level keys).
- `message.toolCalls[0].function.arguments`
- `message.toolCallList[0].function.arguments`
- `toolCall.function.arguments`
- Arguments as a JSON object or a JSON-encoded string (auto-parsed).

## Field aliases

| Field | Aliases checked (in order) |
|---|---|
| customer name | `customer_name`, `full_name`, `name`, `customerName`, `fullName` |
| phone | `phone_number`, `phone`, `caller_phone`, `customer_phone`, `phoneNumber`, `callerNumber`, `customerPhone`, then `customer.number` / `message.customer.number` / `message.call.customer.number` / `call.customer.number` |
| email (optional) | `email`, `customer_email`, `customerEmail` |
| date | `reservation_date`, `date`, `requested_date`, `reservationDate`, `localDate` |
| time | `reservation_time`, `time`, `requested_time`, `reservationTime`, `preferredTime` |
| party size | `party_size`, `partySize`, `guests`, `guest_count`, `number_of_people`, `people`, `numberOfGuests` |
| language | `language`, `lang` (defaults to `tr`) |
| notes | `special_request`, `notes`, `request`, `special_notes`, `specialRequests` |
| call id | parsed `call_id` (from `message.call.id` inside the tool-call envelope), then `conversation_id`/`conversationId`, then the Vapi `toolCallId` |

Date/time accept the same flexible formats as the old Next.js route
(`DD/MM/YYYY`, `DD-MM-YYYY`, bare hour like `"21"` or `"21h"`, etc. — see
`backend/src/utils/vapi/normalizers.ts`). A past year in the date is silently
corrected to the current year, same as before. Unparseable input normalizes
to `null` rather than throwing.

## Required-field policy

Required: customer name, phone, date, time, party size. Email is optional
and never required. If any required field is missing or fails to normalize
(invalid date format, invalid time format, non-positive/non-integer party
size), the endpoint returns `success:false` with `missing_fields` — **it
never creates a ReservationRequest with partial data and never returns a
500 for a malformed-but-well-formed-JSON payload.**

## Availability hard-block (new in Phase 28)

After required fields pass validation, the endpoint calls the Phase 25
`calculateAvailabilitySlots()` service as a conservative pre-check. Creation
is blocked **only** for:

- `restaurant_inactive`
- `reservations_disabled`
- `blackout_full_day`
- `party_size_out_of_range`
- `outside_booking_window`

Creation is **never** blocked for `opening_hours_not_configured` (a missing
admin-configuration state, not a booking rule), `invalid_date` /
`invalid_preferred_time` (this route already validated those itself), or
`restaurant_not_found` (the restaurant was already confirmed to exist via
the webhook-key lookup). If the availability check itself throws for any
reason, the failure is logged and creation proceeds — this safety net is
explicitly designed to never make the endpoint brittle.

This still creates only a **ReservationRequest** (pending), never a
confirmed **Reservation** — see AGENTS.md Phase 28 constraints.

## Idempotency / duplicate-retry behavior

If a `callId` is resolved and a `ReservationRequest` already exists for
`{restaurantId, sourceExternalId: callId, channel: "voice", provider: "vapi", requestType: "create"}`,
the endpoint short-circuits: it logs a `ToolLog` (`status: "success"`,
`responsePayload: { duplicateRetry: true, ... }`) and returns the same
`reservation_request_id`/`customer_id` as the original call, without
creating a second `ReservationRequest`, `Customer`, `Conversation`, or
`Message`.

**Known limitation**: there is no unique database constraint on
`(restaurantId, sourceExternalId)` — `callId` is optional and not guaranteed
unique by Vapi. This is a best-effort, read-then-act check, not an
atomic guarantee; a genuinely concurrent retry within the same request
window could still race past it. Closing this gap would require a schema
change (a unique index), which Phase 28 explicitly defers (see AGENTS.md
item 7) rather than adding speculatively.

If no `callId` is present at all (no `message.call.id`, no
`conversation_id`, no Vapi `toolCallId`), no idempotency check is performed
— this matches the old route's behavior, which also had no de-duplication
key in that case.

## Response contract

### Missing fields (unchanged from the old Next.js route)

```json
{
  "success": false,
  "available": false,
  "reason": "Missing Required Information",
  "message": "I need the following information before continuing: phone_number, reservation_date.",
  "missing_fields": ["phone_number", "reservation_date"]
}
```

### Availability-blocked (new in Phase 28)

```json
{
  "success": false,
  "message": "Sorry, we're closed on that date.",
  "blocked_reason": "blackout_full_day"
}
```

### Success — intentional additive deviation from the old route

The old Next.js route's success response never included `success`,
`reservation_request_id`, or `customer_id` — it returned only
`getVapiResponse("reservation_received", language)`:

```json
{
  "status": "received",
  "message": "reservation received successfully.",
  "customer_message_fr": "...",
  "customer_message_tr": "...",
  "customer_message_en": "...",
  "text": "..."
}
```

The backend keeps all of those fields byte-compatible (any Vapi assistant
prompt reading `text`/`customer_message_*` keeps working unchanged) and
**additively** includes:

```json
{
  "success": true,
  "reservation_request_id": "<uuid>",
  "customer_id": "<uuid>",
  "next_step": "awaiting_restaurant_confirmation"
}
```

This is a deliberate, documented deviation: it is purely additive (no field
removed or renamed), and it gives a future Vapi tool-call/voice-flow design a
stable way to reference the created request without a second lookup.
`reservation_request_id`/`customer_id` are internal database UUIDs, not
sensitive — they identify rows the same tenant's own staff already see in
the admin UI; no table IDs, raw payloads, or credentials are ever included.

### Internal error

Unchanged: `sendVapiToolErrorResponse` with a generic message
("Internal error while creating reservation request"); the real error is
only logged server-side via `logger.error`, never returned to Vapi.

### Unknown/inactive webhook key

Unchanged shape, extended condition (Phase 28): HTTP 401,
`{ "error": "Unknown or inactive webhook key" }` (or the `results[]`-wrapped
equivalent if Vapi sent a `toolCallId`) — now also returned when the
resolved `IntegrationConnection.status !== "active"`.

## Fields never returned

Per AGENTS.md Phase 28 constraints, the response never includes:
`rawPayload`, `stateJson`, `passwordHash`, session/JWT tokens, provider
credentials/webhook secrets, `availableTableIds`/`tableIds`, or any full
Prisma relation object. Only the two plain UUIDs above are returned, and
only on a successful create/duplicate-retry path.

## Rollback note

No Vapi dashboard URL was changed by this phase. If this endpoint needs to
be disabled, no action is required on the production Vapi side — it was
never pointed at this URL. Reverting the code change (this commit) restores
the Phase 27 behavior described in
`docs/backend-vapi-webhook-parity-assessment.md` Section 3.1.
