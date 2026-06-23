# Vapi handoff-to-staff webhook contract (Phase 33)

Covers `POST /api/webhooks/vapi/:publicWebhookKey/handoff-to-staff` in
`backend/src/routes/webhooks/vapi.ts`. The live Vapi dashboard URL is
**unchanged** — it still serves `src/app/api/vapi/handoff-to-staff/route.ts`.
This backend route is available for controlled test calls only.

Implements the Phase 32 decision recorded in
`docs/vapi-modify-cancel-handoff-decision-pack.md` Section 3C and Section 5
("handoff-to-staff" acceptance criteria).

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
| callId | `call_id` on the parsed payload, then `call_id`/`callId`/`conversation_id`/`conversationId`/`vapiCallId`/`id`, then `message.call.id`/`call.id`, then the Vapi tool-call id |
| reason | `reason`, `handoffReason`, `handoff_reason` |
| message | `message`, `customerMessage`, `customer_message` |
| urgency | `urgency`, `priority` |
| customerName | `customerName`, `name`, `fullName` |
| phone | `phone`, `phoneNumber`, `callerNumber`, `customerPhone` (+ Vapi envelope caller-number fallback) |
| email | `email`, `customerEmail` |
| language | `language`, `lang`, `locale` |

## Required fields

No single field is strictly required. At least one of `reason`, `message`,
`callId`, `phone`, or `customerName` must be present — a completely empty
payload (no fields, no call metadata) has nothing to hand off:

```json
{ "success": false, "message": "...", "missing_fields": ["reason_or_message_or_callId_or_phone_or_customerName"] }
```

This always returns `success:false` with `200`, never a `500` or a thrown
error, and is logged as a `ToolLog` `"failure"`.

## Response shape

```ts
{
  success: boolean;
  message: string;
  handoff_logged?: boolean;
  event_id?: string;
  next_step?: string;
  missing_fields?: string[];
}
```

Success example:

```json
{ "success": true, "message": "Thank you, your request has been recorded for the restaurant team. They will follow up with you as soon as possible.", "handoff_logged": true, "event_id": "<uuid>", "next_step": "awaiting_restaurant_team_followup" }
```

Voice-friendly success/missing-fields text is provided in English, Turkish,
and French (`handoffToStaffAdapter.ts`'s `SUCCESS_TEXT`/`MISSING_FIELDS_TEXT`
tables), selected by the resolved `language`, falling back to English.

## Notification policy — read this before touching this route

**No staff notification channel (SMS/push/email/Slack) exists anywhere in
this codebase today.** This route only logs an auditable handoff intent. It
does not page, email, SMS, or otherwise alert any human. The response
wording is deliberately generic ("recorded for the restaurant team... will
follow up") and must never be changed to imply staff were actively notified
unless a real notification mechanism is built and wired in. Both the pure
adapter test and the DB-backed integration test assert the response text
does not contain "notified".

## Storage policy

Each accepted call creates one `IntegrationEvent` row:

| Field | Value |
|---|---|
| `restaurantId` | resolved tenant |
| `integrationId` | `IntegrationConnection.id` |
| `channel` | `"voice"` |
| `provider` | `"vapi"` |
| `eventType` | `"handoff_to_staff"` |
| `status` | `"received"` |
| `payload` | bounded/safe object — see below |

`payload` only ever contains: `callId`, `reason` (truncated to 2,000 chars),
`message` (truncated to 2,000 chars), `urgency`, `customerName`, `phone`,
`email`, `language`, `requestedAt` (ISO timestamp), `source: "vapi"`. It
never contains the raw inbound body, a transcript, or headers/secrets.

This route never creates or updates a `Customer`, `ReservationRequest`, or
`Reservation`. The optional `Conversation`/`Message` write described in the
Phase 32 decision pack as acceptable-if-safe was **deferred** in Phase 33 —
`IntegrationEvent` only, for now.

## ToolLog behavior

A `ToolLog` row (`toolName: "handoff_to_staff"`, `channel: "voice"`,
`provider: "vapi"`) is created in `"processing"` status as soon as tenant
resolution and payload parsing succeed — before the missing-fields check,
same convention as the other Vapi adapters.

| Outcome | `ToolLog.status` | Notes |
|---|---|---|
| No reason/message/callId/phone/customerName present | `failure` | `errorMessage` lists the missing-fields code |
| Logged successfully | `success` | `responsePayload: { eventId, callId }` — never the full event payload or `rawPayload` |
| Internal exception | `failure` | `errorMessage` set; generic error returned to Vapi, real error only in server logs (`logger.error`) |

## Sensitive/internal field policy

This route never returns: `passwordHash`, `resetToken`, `session`,
`refreshToken`, `jwt`/`JWT`, `credentials`, `credentialsEncrypted`,
`webhookVerifyTokenHash`, `accessToken`, `apiKey`, `providerSecret`,
`clientSecret`, `tokenValue`, `rawPayload`, `stateJson`,
`availableTableIds`, `tableIds`, `transcript`, `fullTranscript`, internal
provider ids, or full DB relation objects. Verified by
`assertNoSensitiveFields(...)` in
`backend/src/tests/vapiHandoffToStaff.integration.test.ts`.

## Intentional deviations from the old Next.js route

- The old route (`src/app/api/vapi/handoff-to-staff/route.ts`) had **no
  required-field validation at all** and always wrote a `staff_handoffs` row
  regardless of payload contents; this route requires at least one
  meaningful signal field and returns a controlled `missing_fields` response
  otherwise.
- The old route stored the full `raw_payload` on `staff_handoffs`; this route
  stores only the bounded, named fields listed above — no raw payload.
- The old route's response (`getVapiResponse('staff_handoff', language)`) and
  this route's response share the same intent (generic "team will follow
  up") but are not byte-for-byte identical contracts — see
  `docs/backend-vapi-webhook-parity-assessment.md` Section 5 for why the two
  generations were never contract-compatible to begin with.
- The legacy dispatcher's inline `handoff_to_staff` case
  (`src/app/api/vapi/webhook/route.ts`) is a complete no-op — no DB write at
  all, just a canned `{ success: true, message: "Transferring to staff..." }`.
  This backend route intentionally does **not** replicate that no-op; it
  always attempts to log, consistent with the Phase 32 decision to treat
  handoffs as auditable.
- `IntegrationEvent` is used instead of the old `staff_handoffs` table —
  see `docs/vapi-modify-cancel-handoff-decision-pack.md` Section 2 for the
  schema-mapping rationale.

## Rollback note

This is a net-new backend route; nothing existing depends on it. Disabling
it (if ever needed) requires no code rollback for the live Vapi integration,
because the Vapi dashboard was never pointed at it — see "Cutover status"
below.

## Cutover status

Not performed. The Vapi dashboard URL still points at the Next.js route.
See `docs/backend-production-cutover-plan.md` Section E, "Remaining blocker:
modify / cancel still unimplemented; handoff now built but no staff
notification channel (Phase 33 update)" — cutover additionally requires a
product decision on whether logging-only (no notification) is acceptable as
the live behavior, which has not been made.
