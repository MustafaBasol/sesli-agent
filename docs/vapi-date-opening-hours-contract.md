# Vapi current-date / opening-hours webhook contract (Phase 30)

Covers `POST /api/webhooks/vapi/:publicWebhookKey/get-current-date` and
`POST /api/webhooks/vapi/:publicWebhookKey/get-opening-hours` in
`backend/src/routes/webhooks/vapi.ts`. The live Vapi dashboard URL is
**unchanged** — it still serves `src/app/api/vapi/get-current-date/route.ts`
and `src/app/api/vapi/get-opening-hours/route.ts`. These backend routes are
available for controlled test calls only.

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

### Field aliases

| Field | Aliases |
|---|---|
| `date` (opening-hours only) | `date`, `localDate`, `local_date`, `requestedDate`, `requested_date` |
| `language` | `language`, `lang`, `locale` |
| `callId` | `call_id`, `callId`, `conversation_id`, `conversationId`, `toolCallId`, then the Vapi tool-call id |

`get-current-date` takes no required arguments — `language` is the only
optional input.

## Timezone policy

`Restaurant.timezone` is authoritative (it has a `Europe/Paris` DB default,
so it is effectively always set). A blank/empty string falls back to
`Europe/Paris` at the application layer as a final defensive fallback.
`RestaurantSettings` has no timezone field in the current schema, so there is
no intermediate fallback layer to apply.

## Language / localization policy

`day_of_week` is localized to one of `en`/`tr`/`fr`:

1. A caller-supplied `language`/`lang`/`locale` if it is one of the three
   supported codes (case-insensitive).
2. Otherwise `Restaurant.defaultLanguage` if it is one of the three.
3. Otherwise `"en"`.

`get-current-date`'s `message` field is fully localized per the same
resolved language. `get-opening-hours`' `message` field is English-only in
this phase (deviation noted below) — `day_of_week` is still localized.

## `get-current-date` response shape

```json
{
  "success": true,
  "message": "Today is Saturday, 2026-07-04. The current local time is 20:30 (Europe/Paris).",
  "timezone": "Europe/Paris",
  "current_date": "2026-07-04",
  "current_time": "20:30",
  "day_of_week": "Saturday",
  "iso_datetime": "2026-07-04T18:30:00.000Z"
}
```

- `current_date`: `YYYY-MM-DD`, restaurant-local.
- `current_time`: `HH:mm`, restaurant-local, 24-hour.
- `iso_datetime`: the real UTC instant (`Date.toISOString()`) — distinct from
  `current_date`/`current_time`, which are local-calendar values, not an
  instant. Included for callers that want an unambiguous machine-readable
  timestamp alongside the human-readable local fields.
- Always `success: true` — there is no failure mode for this route short of
  an internal exception (no required input, no validation).

## `get-opening-hours` request behavior

- If `date` is provided (after alias resolution) and it doesn't parse via the
  same `normalizeDate` rules used by every other Vapi adapter in this backend
  (ISO `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, with a past year corrected
  forward to the current year), the route returns:

  ```json
  { "success": false, "message": "Sorry, I couldn't understand that date. Please use the YYYY-MM-DD format." }
  ```

  Always `200`, never a `500`.

- If `date` is provided and valid, the response describes **that date only**
  and omits `weekly_hours`.
- If `date` is omitted, the response describes **today** (restaurant-local)
  and includes `weekly_hours` for the full week.

## "Not configured" contract

If `RestaurantSettings.openingHoursJson` is `null`, structurally invalid, or
a valid object where every weekday's window list is empty (i.e. "missing or
empty" per the task brief), the route returns:

```json
{ "success": true, "configured": false, "timezone": "Europe/Paris", "message": "Opening hours have not been configured yet for this restaurant." }
```

**Decision: `success: true` with `configured: false`, not `success: false`.**
This mirrors the existing `get-customer-profile` not-found precedent
(`success: true, found: false`) — the Vapi assistant should treat "no hours
on file" as a normal, gracefully-handled outcome, not a tool error worth
retrying or escalating.

## Restaurant-inactive / reservations-disabled policy

Checked before opening-hours configuration, in this order:

1. `Restaurant.status !== "active"` →
   `{ "success": true, "is_open": false, "closed_reason": "restaurant_inactive", "message": "Sorry, this restaurant isn't accepting reservations right now." }`
2. `RestaurantSettings.reservationsEnabled === false` →
   `{ "success": true, "is_open": false, "closed_reason": "reservations_disabled", "message": "Sorry, online reservations are currently disabled." }`

Same message wording as `checkAvailabilityAdapter.ts`'s
`BLOCKED_REASON_MESSAGES` for these two reasons, kept as an independent,
smaller constant in `dateOpeningHoursAdapter.ts` so neither adapter file
depends on the other.

## `get-opening-hours` response shape (configured, no blocking condition)

```json
{
  "success": true,
  "timezone": "Europe/Paris",
  "date": "2026-08-01",
  "day_of_week": "Saturday",
  "is_open": true,
  "opening_periods": [{ "opens": "10:00", "closes": "23:00" }],
  "weekly_hours": {
    "sunday": [],
    "monday": [{ "opens": "10:00", "closes": "22:00" }],
    "tuesday": [],
    "wednesday": [],
    "thursday": [],
    "friday": [],
    "saturday": [{ "opens": "10:00", "closes": "23:00" }]
  },
  "message": "On Saturday, 2026-08-01, we are open 10:00-23:00."
}
```

`weekly_hours` (when present — only for a no-`date` request) always has all
seven weekday keys, each an array (possibly empty) of `{opens, closes}` —
this is a deliberate re-keying of `OpeningHoursWindow`'s internal `{start,
end}` shape, not a passthrough of the raw `RestaurantSettings` row.

If the requested/today's weekday has no configured windows, `is_open: false`
and `opening_periods: []` — no `closed_reason` is set in this case (it is a
normal weekly closure, not a blocking condition).

## Blackout handling

- **Full-day blackout** (`BlackoutDate.isFullDay: true`, `status: "active"`,
  matching `localDate`) overrides the normal opening-hours computation
  entirely:

  ```json
  { "success": true, "timezone": "...", "date": "2026-08-01", "day_of_week": "Saturday", "is_open": false, "closed_reason": "blackout_full_day", "message": "We are closed on 2026-08-01 (Private event)." }
  ```

  `opening_periods` is omitted in this case (the day's normal hours are
  irrelevant — the restaurant is closed regardless of what they would have
  been).

- **Partial-day blackout** (`isFullDay: false` with both `startsAtLocal` and
  `endsAtLocal` set) does **not** flip `is_open` to `false` — the restaurant
  is still genuinely open outside that window. It is surfaced as an
  additional `partial_blackout_note` field plus inline text appended to
  `message`:

  ```json
  { "is_open": true, "opening_periods": [...], "partial_blackout_note": "Closed between 14:00 and 16:00 (Maintenance).", "message": "On Saturday, 2026-08-01, we are open 10:00-23:00. Closed between 14:00 and 16:00 (Maintenance)." }
  ```

  This route never calculates per-slot availability around the partial
  window (e.g. "open 10:00-14:00 and 16:00-23:00" as discrete slots) — that
  level of detail is `check-availability`'s job, not this route's.

## ToolLog behavior

| Outcome | `ToolLog.toolName` | `ToolLog.status` | Notes |
|---|---|---|---|
| `get-current-date` success | `get_current_date` | `success` | `responsePayload: { timezone, localDate, localTime }` |
| `get-current-date` internal exception | `get_current_date` | `failure` | `errorMessage` set; generic error returned to Vapi |
| `get-opening-hours` invalid date format | `get_opening_hours` | `failure` | Logged directly as `failure` (no `processing` row first) — same convention as a missing-fields `create-customer-profile` call |
| `get-opening-hours` restaurant inactive / reservations disabled / not configured | `get_opening_hours` | `success` | These are correctly-handled outcomes, not system failures — `responsePayload` records only `{ closedReason }` or `{ configured: false }` |
| `get-opening-hours` normal response | `get_opening_hours` | `success` | `responsePayload: { date, isOpen }` |
| `get-opening-hours` internal exception | `get_opening_hours` | `failure` | `errorMessage` set; generic error returned to Vapi |

`ToolLog.requestPayload` stores the raw inbound body, same as the other Vapi
adapters — read by internal tooling only, never echoed back in any API
response.

## Sensitive/internal field policy

Neither route ever returns: `passwordHash`, `resetToken`, `session`,
`refreshToken`, `jwt`/`JWT`, `credentials`, `credentialsEncrypted`,
`webhookVerifyTokenHash`, `accessToken`, `apiKey`, `providerSecret`,
`clientSecret`, `tokenValue`, `rawPayload`, `stateJson`,
`availableTableIds`, `tableIds`, internal provider/table ids, or full DB
relation objects. Verified by `assertNoSensitiveFields(...)` in
`backend/src/tests/vapiDateOpeningHours.integration.test.ts`.

## Intentional deviations from the old Next.js routes

See `docs/backend-vapi-webhook-parity-assessment.md` Section 13 for the full
list and rationale: structured response instead of pre-formatted strings,
no day-of-week-only flat row format, no Turkish-specific spoken-date helpers
ported, `IntegrationConnection.status` enforcement.

## Cutover status

Not performed. The Vapi dashboard URL still points at the Next.js routes.
See `docs/backend-production-cutover-plan.md` Section E, "Vapi dashboard
cutover not performed (Phase 30)", for the rollback note — reverting (if
these routes were ever cut over) is a single dashboard URL change back to
the old Next.js routes, no code deploy required.
