# Vapi log-call-summary webhook contract (Phase 31)

Covers `POST /api/webhooks/vapi/:publicWebhookKey/log-call-summary` in
`backend/src/routes/webhooks/vapi.ts`. The live Vapi dashboard URL is
**unchanged** — it still serves `src/app/api/vapi/log-call-summary/route.ts`.
This backend route is available for controlled test calls only.

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
| summary | `summary`, `callSummary`, `call_summary` |
| transcript | `transcript`, `transcriptText`, `fullTranscript` — extracted but **never stored or returned** (see privacy policy below) |
| phone | `phone`, `phoneNumber`, `callerNumber`, `customerPhone` (+ Vapi envelope caller-number fallback) — extracted but **never stored or returned** |
| customerName | `customerName`, `name`, `fullName` — extracted but **never stored or returned** |
| language | `language`, `lang`, `locale` |
| durationSeconds | `durationSeconds`, `duration_seconds`, `duration` |
| endedReason | `endedReason`, `ended_reason`, `endReason` |
| outcome | `outcome`, `status` |

## Required fields

At least one of `callId` or `summary` must be present. Missing both:

```json
{ "success": false, "message": "I need either a call id or a call summary before logging this call.", "missing_fields": ["call_id_or_summary"] }
```

This always returns `success:false` with `200`, never a `500` or a thrown
error, and is logged as a `ToolLog` `"failure"`.

- If only `callId` is present, the call is accepted and a minimal
  `IntegrationEvent` is stored (`payload: { callId }`).
- If only `summary` is present, the call is accepted; the response omits
  `call_id` entirely (not `null`) since none was supplied.

## Response shape

```ts
{
  success: boolean;
  message: string;
  logged?: boolean;
  call_id?: string;
  event_id?: string;
  missing_fields?: string[];
}
```

Success example:

```json
{ "success": true, "message": "Call summary logged successfully.", "logged": true, "call_id": "call-123", "event_id": "<uuid>" }
```

`call_id` is included only when one was resolved from the payload —
omitted (not `null`) otherwise.

## Storage policy

Each accepted call creates one `IntegrationEvent` row:

| Field | Value |
|---|---|
| `restaurantId` | resolved tenant |
| `integrationId` | `IntegrationConnection.id` |
| `channel` | `"voice"` |
| `provider` | `"vapi"` |
| `eventType` | `"call_summary"` |
| `status` | `"received"` |
| `payload` | bounded/safe object — see below |

`payload` only ever contains: `callId`, `summary` (truncated, see below),
`language`, `outcome`, `durationSeconds`, `endedReason`. It never contains
`phone`, `customerName`, `transcript`, or the raw inbound body.

No `vapi_call_id`-keyed upsert semantics exist on `IntegrationEvent` — a
repeated `callId` creates a **new** event row each time (this is an event
log, not a mutable `calls` record, unlike the old Next.js route's upsert
behavior).

This route never creates or updates a `Customer`, `ReservationRequest`, or
`Reservation`.

## Privacy / data minimization policy

- `transcript`/`transcriptText`/`fullTranscript` aliases are recognized so a
  payload carrying them is still accepted, but the value is **never stored
  or returned** anywhere (not in `IntegrationEvent.payload`, not in
  `ToolLog`, not in the API response).
- The raw inbound Vapi body is **not** stored in `IntegrationEvent.payload`
  (only `ToolLog.requestPayload` retains it, same as every other Vapi
  adapter in this backend, and that field is never returned in any API
  response).
- `summary` is truncated to `MAX_SUMMARY_LENGTH` (4,000 characters) before
  storage via `truncateSummary()` in `callSummaryAdapter.ts`.
- `phone`/`customerName` are extracted by the adapter (for alias-coverage
  parity with the other Vapi adapters) but are excluded from both storage
  and the response — see `buildSafeCallSummaryPayload()`.

## ToolLog behavior

A `ToolLog` row (`toolName: "log_call_summary"`, `channel: "voice"`,
`provider: "vapi"`) is created in `"processing"` status as soon as tenant
resolution and payload parsing succeed — before the missing-fields check,
same convention as `get-customer-profile`/`create-customer-profile`.

| Outcome | `ToolLog.status` | Notes |
|---|---|---|
| Missing `callId` and `summary` | `failure` | `errorMessage` lists the missing fields |
| Logged successfully (full, callId-only, or summary-only) | `success` | `responsePayload: { eventId, callId }` — never the full event payload or `rawPayload` |
| Internal exception | `failure` | `errorMessage` set; generic error returned to Vapi, real error only in server logs (`logger.error`) |

## Sensitive/internal field policy

This route never returns: `passwordHash`, `resetToken`, `session`,
`refreshToken`, `jwt`/`JWT`, `credentials`, `credentialsEncrypted`,
`webhookVerifyTokenHash`, `accessToken`, `apiKey`, `providerSecret`,
`clientSecret`, `tokenValue`, `rawPayload`, `stateJson`,
`availableTableIds`, `tableIds`, `transcript`, `fullTranscript`, internal
provider ids, or full DB relation objects. Verified by
`assertNoSensitiveFields(...)` in
`backend/src/tests/vapiCallSummary.integration.test.ts`.

## Intentional deviations from the old Next.js route

See `docs/backend-vapi-webhook-parity-assessment.md` Section 14 for the full
list and rationale (no raw payload/transcript storage, bounded summary, an
explicit required-field policy where the old route had none, `IntegrationEvent`
instead of a `calls` upsert, a new response contract, connection-status
enforcement, and the `IntegrationEvent`-vs-`Message` model-mapping decision).

## Cutover status

Not performed. The Vapi dashboard URL still points at the Next.js route.
See `docs/backend-production-cutover-plan.md` Section E,
"Vapi dashboard cutover not performed (Phase 31)", for the rollback note —
reverting (if this route were ever cut over) is a single dashboard URL
change back to the old Next.js route, no code deploy required.
