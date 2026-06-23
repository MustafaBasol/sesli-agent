# Vapi customer-profile webhook contract (Phase 29)

Covers `POST /api/webhooks/vapi/:publicWebhookKey/get-customer-profile` and
`POST /api/webhooks/vapi/:publicWebhookKey/create-customer-profile` in
`backend/src/routes/webhooks/vapi.ts`. The live Vapi dashboard URL is
**unchanged** — it still serves `src/app/api/vapi/get-customer-profile/route.ts`
and `src/app/api/vapi/create-customer-profile/route.ts`. These backend routes
are available for controlled test calls only.

## Tenant resolution

Both routes resolve `restaurantId` from `IntegrationConnection.publicWebhookKey`
(`channel: "vapi"`). An unknown key, or a connection whose `status !== "active"`,
is rejected with `401` (never a 500, never a leaked restaurantId guess).

## Accepted payload shapes

Both routes accept the same shapes the other Vapi adapters in this backend
accept (`parseVapiPayload` + `getValueFromAliases`):

- Flat JSON body (arguments at the root).
- Nested Vapi tool-call envelope: `message.toolCalls[0].function.arguments`,
  `message.toolCallList[0].function.arguments`, or `toolCall.function.arguments`
  — as either a JSON string or an object.
- camelCase or snake_case field names, interchangeably.
- Caller phone number fallback to `customer.number` /
  `message.customer.number` / `message.call.customer.number` /
  `call.customer.number` if no aliased field matched.

### `get-customer-profile` field aliases

| Field | Aliases |
|---|---|
| phone | `phone`, `phone_number`, `phoneNumber`, `caller_phone`, `callerNumber`, `customer_phone`, `customerPhone` (+ Vapi envelope caller-number fallback) |
| email | `email`, `customer_email`, `customerEmail` |
| name | `name`, `full_name`, `fullName`, `customer_name`, `customerName` (informational only — not used for lookup) |
| callId | `call_id` on the parsed payload, then `conversation_id`/`conversationId`/`call_id`/`callId`, then the Vapi tool-call id |

### `create-customer-profile` field aliases

Same `phone`/`email`/`callId` aliases as above, plus:

| Field | Aliases |
|---|---|
| name | `name`, `full_name`, `fullName`, `customer_name`, `customerName` |
| notes | `notes`, `customer_notes`, `customerNotes` |
| language | `language`, `lang` (default `"tr"`) |

## Required fields

- `get-customer-profile`: at least one of `phone` or `email`. Missing both →
  `missing_fields: ["phone_or_email"]`.
- `create-customer-profile`: `name`, plus at least one of `phone`/`email`.
  Missing `name` → `missing_fields` includes `"name"`. Missing both contact
  fields → `missing_fields` includes `"phone_or_email"`. Both can be missing
  at once.

Missing required fields always return `success:false` with `200`, never a
`500` or a thrown error.

## Lookup policy

`phone` is normalized to digits-only (`normalizedPhone`) for lookup;
`email` is lowercased and trimmed. Lookup order, always scoped to the
resolved `restaurantId`:

1. Exact `normalizedPhone` match, if `phone` was supplied.
2. Exact `email` match, if `email` was supplied and no phone match was found
   (or to cross-check against the phone match — see conflict policy below).

No fuzzy/suffix matching is performed (unlike the old Next.js
`get-customer-profile` route's `ilike` last-9-digits scan) and no row from a
different restaurant is ever considered.

## Conflict policy

If both `phone` and `email` are supplied and they resolve to **two different**
`Customer` rows, the routes do **not** guess which one to use and do **not**
merge them. Both routes return:

```json
{ "success": false, "conflict": true, "message": "The phone number and email provided belong to different customer records. Please confirm which one to use." }
```

This is logged as a `ToolLog` **success** (the conflict was correctly
detected, not a system failure) with `responsePayload: { conflict: true }`.

## `get-customer-profile` response shape

Not found:

```json
{ "success": true, "found": false, "message": "Customer not found." }
```

Found:

```json
{
  "success": true,
  "found": true,
  "message": "Customer found.",
  "customer_id": "<uuid>",
  "customer": { "name": "...", "phone": "...", "email": "...", "notes": "..." }
}
```

`customer` only includes keys with a non-empty value — no `null`/`undefined`
keys, no full `Customer` row, no internal fields (`restaurantId`,
`createdAt`, `updatedAt`, `totalReservations`, `lastVisitAt`,
`instagramHandle`, `whatsappId` are never returned).

## `create-customer-profile` behavior and response shape

- If a matching `Customer` exists (by phone or email, per the lookup
  policy), it is **updated**: only fields present and non-empty in the
  request are written. An existing non-empty field is never cleared by an
  absent or empty-string input (e.g. sending `notes: ""` does not erase an
  existing `notes` value).
- If no matching `Customer` exists, one is **created**, scoped to
  `restaurantId`.
- Never creates a `ReservationRequest`, `Reservation`, `Conversation`, or
  `Message` — this is a pure `Customer` CRUD operation.

```json
{
  "success": true,
  "action": "created",
  "message": "Customer profile created.",
  "customer_id": "<uuid>",
  "customer": { "name": "...", "phone": "...", "email": "...", "notes": "..." }
}
```

`action` is `"created"` or `"updated"`. Same `customer` allowlist as
`get-customer-profile`.

## ToolLog behavior

A `ToolLog` row (`toolName: "get_customer_profile"` /
`"create_customer_profile"`, `channel: "voice"`, `provider: "vapi"`) is
created in `"processing"` status as soon as tenant resolution and payload
parsing succeed — **before** the missing-fields check, unlike
`create-reservation-request`'s pattern of skipping `ToolLog` entirely for a
missing-fields response.

| Outcome | `ToolLog.status` | Notes |
|---|---|---|
| Missing required fields | `failure` | `errorMessage` lists the missing fields |
| Conflict detected | `success` | `responsePayload: { conflict: true }` — correctly-handled, not an error |
| Not found (`get-customer-profile`) | `success` | `responsePayload: { found: false }` |
| Found / created / updated | `success` | `responsePayload` includes `customerId` and (`found`/`action`) but never the full customer object or `rawPayload` |
| Internal exception | `failure` | `errorMessage` set; generic error returned to Vapi, real error only in server logs (`logger.error`) |

`ToolLog.requestPayload` stores the raw inbound body, same as the other Vapi
adapters — this is read by internal tooling only, never echoed back in any
API response.

## Sensitive/internal field policy

Neither route ever returns: `passwordHash`, `resetToken`, `session`,
`refreshToken`, `jwt`/`JWT`, `credentials`, `credentialsEncrypted`,
`webhookVerifyTokenHash`, `accessToken`, `apiKey`, `providerSecret`,
`clientSecret`, `tokenValue`, `rawPayload`, `stateJson`,
`availableTableIds`, `tableIds`, internal provider ids, or full DB relation
objects. Verified by `assertNoSensitiveFields(...)` in
`backend/src/tests/vapiCustomerProfile.integration.test.ts`.

## Intentional deviations from the old Next.js routes

See `docs/backend-vapi-webhook-parity-assessment.md` Section 12 for the full
list and rationale (exact vs. fuzzy lookup, new conflict response, stricter
required-field policy, no `calls`/`Conversation`/`Message` side effect,
`IntegrationConnection.status` enforcement).

## Cutover status

Not performed. The Vapi dashboard URL still points at the Next.js routes.
See `docs/backend-production-cutover-plan.md` Section E,
"Vapi dashboard cutover not performed (Phase 29)", for the rollback note —
reverting (if these routes were ever cut over) is a single dashboard URL
change back to the old Next.js routes, no code deploy required.
