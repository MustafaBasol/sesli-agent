# Backend beta smoke test pack (Phase 20)

Manual VPS smoke test commands for the backend beta platform, used before
any cutover step described in `docs/backend-production-cutover-plan.md`.
All commands are read-mostly; none mutate production data by default. Run
against a beta/staging environment first.

Conventions used below:

- `$API` — backend base URL, e.g. `http://localhost:4000`
- `$APP` — frontend base URL, e.g. `http://localhost:3000`
- `$RESTAURANT_ID` — a restaurant id accessible to the logged-in user

## A) Required env

### Backend (`backend/.env`)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Required for any DB-backed route. |
| `JWT_SECRET` | Required in production. |
| `JWT_EXPIRES_IN` | Default `8h`. |
| `PORT` | Default `4000`. |
| `NODE_ENV` | `production` enables the stricter boot checks below. |
| `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` | 64 hex chars; required to store integration credentials. |
| `CORS_ALLOWED_ORIGINS` | Required in production; comma-separated. |
| `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX` | Optional, login rate limiting. |
| `WEBHOOK_RATE_LIMIT_WINDOW_MS`, `WEBHOOK_RATE_LIMIT_MAX` | Optional, Vapi webhook rate limiting. |
| `SEED_OWNER_PASSWORD` | Required to seed a non-production/beta environment. |
| `ALLOW_PROD_SEED` | Required (plus `SEED_OWNER_PASSWORD`) only for an explicit, controlled production seed — do not set otherwise. |

See `docs/backend-env.md` for full detail.

### Frontend

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA` | Must be `true` to reach `/backend-admin/*` during these tests. |
| `NEXT_PUBLIC_BACKEND_API_URL` | e.g. `http://localhost:4000/api`. |

See `docs/frontend-env.md`.

## B) Backend install/build/check commands

```bash
cd backend
npm ci
npm run prisma:migrate:deploy
npm run prisma:seed        # test/beta environments only — never production
                            # without ALLOW_PROD_SEED=true + SEED_OWNER_PASSWORD
npm run typecheck
npm run build
npm run test
```

Optional, only with a real `DATABASE_URL` configured and pointed at a
disposable test/beta database (these mutate that database):

```bash
npm run test:vapi-webhook-integration
npm run test:vapi-check-availability
npm run test:reservation-requests-integration
npm run test:customers-integration
npm run test:conversations-integration
npm run test:integrations-integration
npm run test:dashboard-integration
npm run test:restaurant-availability
npm run test:availability-slots
```

## C) Backend restart commands

Targeted port kill only — do not broadly kill node processes:

```bash
fuser -k 4000/tcp || true
cd backend
nohup npm start > /tmp/sesli-agent-backend.log 2>&1 &
sleep 2
curl -sf http://localhost:4000/api/health && echo "backend healthy"
```

## D) Login smoke command

```bash
TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SMOKE_OWNER_EMAIL\",\"password\":\"$SMOKE_OWNER_PASSWORD\"}" \
  | tee /tmp/login-response.json \
  | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "token acquired: ${TOKEN:+yes}${TOKEN:-no}"
```

`/tmp/login-response.json` is reused by the sensitive-field check in
section F — do not commit or share it, and delete it once smoke testing is
done (`rm -f /tmp/login-response.json /tmp/*-response.json`).

## E) API smoke checks

```bash
curl -sf "$API/api/health"

curl -s -o /tmp/dashboard-summary-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/dashboard/summary" \
  -H "Authorization: Bearer $TOKEN"

curl -s -o /tmp/reservation-requests-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/reservation-requests" \
  -H "Authorization: Bearer $TOKEN"

curl -s -o /tmp/reservations-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/reservations" \
  -H "Authorization: Bearer $TOKEN"

curl -s -o /tmp/tables-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/tables" \
  -H "Authorization: Bearer $TOKEN"

curl -s -o /tmp/customers-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/customers" \
  -H "Authorization: Bearer $TOKEN"

curl -s -o /tmp/conversations-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/conversations" \
  -H "Authorization: Bearer $TOKEN"

curl -s -o /tmp/integrations-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/integrations" \
  -H "Authorization: Bearer $TOKEN"

curl -s -o /tmp/team-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/team" \
  -H "Authorization: Bearer $TOKEN"

curl -s -o /tmp/settings-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/settings" \
  -H "Authorization: Bearer $TOKEN"

curl -s -o /tmp/availability-settings-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/availability/settings" \
  -H "Authorization: Bearer $TOKEN"

curl -s -o /tmp/availability-blackouts-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/availability/blackouts" \
  -H "Authorization: Bearer $TOKEN"

# Phase 25 — use a future date so minAdvanceMinutes/bookingWindowDays never
# fail the check regardless of restaurant settings.
FUTURE_DATE=$(date -u -d "+7 days" +%F 2>/dev/null || date -u -v+7d +%F)
curl -s -o /tmp/availability-slots-response.json -w "%{http_code}\n" \
  "$API/api/restaurants/$RESTAURANT_ID/availability/slots?date=$FUTURE_DATE&partySize=2" \
  -H "Authorization: Bearer $TOKEN"
```

The availability settings endpoint creates a default `RestaurantSettings` row on first read if
none exists yet (idempotent) — this is a read-triggered upsert with default values, not a
destructive write, and is safe to run repeatedly.

The availability slots endpoint (Phase 25) is read-only and always returns `200` with a safe
allowlisted body, even when the restaurant has no opening hours configured or reservations are
blocked — check the response's `blockedReason`/`availableSlots` fields, not the HTTP status, to
judge whether slots came back.

```bash
# Phase 27 — backend Vapi check-availability webhook adapter. Public,
# key-authenticated route (publicWebhookKey, not a JWT). Read-only: never
# creates a ReservationRequest/Reservation. Uses the seeded dev connection's
# key by default; override with SMOKE_VAPI_PUBLIC_WEBHOOK_KEY if needed.
VAPI_KEY="${SMOKE_VAPI_PUBLIC_WEBHOOK_KEY:-dev_vapi_golden_meat}"
FUTURE_DATE=$(date -u -d "+7 days" +%F 2>/dev/null || date -u -v+7d +%F)
curl -s -o /tmp/vapi-check-availability-response.json -w "%{http_code}\n" \
  -X POST "$API/api/webhooks/vapi/$VAPI_KEY/check-availability" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$FUTURE_DATE\",\"partySize\":2}"
```

Expect `200` and a `success` field in the JSON body. Do not assert
`available:true` — the restaurant under test may have no opening hours or
tables configured, in which case `success:true, available:false` with a
`blocked_reason` is the correct, non-failing response.

Each command should print `200`. A `401`/`403` usually means an expired or
missing token; a `404` on a restaurant-scoped route usually means the
account does not have access to `$RESTAURANT_ID` (tenant isolation working
as intended, not necessarily a bug — confirm against the expected tester
account).

## F) Sensitive field leak check

Run after section D and E so `/tmp/*-response.json` files exist:

```bash
grep -ril \
  -e 'passwordHash' \
  -e 'resetToken' \
  -e 'session' \
  -e 'refreshToken' \
  -e 'jwt' \
  -e 'JWT' \
  -e 'credentials' \
  -e 'credentialsEncrypted' \
  -e 'webhookVerifyTokenHash' \
  -e 'accessToken' \
  -e 'apiKey' \
  -e 'providerSecret' \
  -e 'clientSecret' \
  -e 'tokenValue' \
  -e 'rawPayload' \
  -e 'stateJson' \
  -e 'availableTableIds' \
  -e 'tableIds' \
  /tmp/*-response.json && echo "FAIL: sensitive field found above" \
  || echo "PASS: no sensitive fields found"
```

`PASS` means none of the listed field names appear in any captured
response body. A `FAIL` line followed by filenames pinpoints which response
needs investigation before any cutover proceeds — treat this as a release
blocker, not a warning.

Clean up afterward:

```bash
rm -f /tmp/*-response.json /tmp/login-response.json
```

## G) CORS smoke check

```bash
curl -s -i -X OPTIONS "$API/api/auth/login" \
  -H "Origin: https://allowed-frontend.example.com" \
  -H "Access-Control-Request-Method: POST" \
  | grep -i "access-control-allow-origin"
```

Expect `Access-Control-Allow-Origin: https://allowed-frontend.example.com`
when that origin is in `CORS_ALLOWED_ORIGINS`. Repeat with an origin that is
*not* in the allow-list and confirm the header is absent (the browser, not
curl, enforces the block — curl will still show the response body, but the
missing header is the signal).

## H) Rate limit smoke check

Non-destructive — uses an intentionally wrong password so it never
succeeds, just to observe headers (do not loop this past a couple of
requests against a shared environment):

```bash
curl -s -i -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@example.com","password":"wrong"}' \
  | grep -i "ratelimit"
```

Expect `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`
headers (from `standardHeaders: true` in `backend/src/middleware/rateLimit.ts`).
To actually observe a 429, repeat the request `AUTH_RATE_LIMIT_MAX + 1`
times in a short window in a disposable test environment only — not against
shared beta/production infrastructure.

## I) Frontend build/restart checks

```bash
npm ci
npm run build
fuser -k 3000/tcp || true
nohup npm start > /tmp/sesli-agent-frontend.log 2>&1 &
sleep 3
curl -sf http://localhost:3000/en/admin/dashboard > /dev/null \
  && echo "frontend responding"
```

## J) Frontend route checks

With `NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA=true`:

```bash
for route in \
  "/en/backend-admin" \
  "/en/backend-admin/reservation-requests" \
  "/en/backend-admin/reservations" \
  "/en/backend-admin/tables" \
  "/en/backend-admin/customers" \
  "/en/backend-admin/conversations" \
  "/en/backend-admin/integrations" \
  "/en/backend-admin/team" \
  "/en/backend-admin/settings" \
  "/en/backend-admin/availability" \
  "/en/admin/dashboard"
do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$APP$route")
  echo "$route -> $code"
done
```

Backend-admin routes should return `200` (or `307`/`302` to login if not
authenticated client-side — confirm in a browser, since this is a
client-rendered redirect, not a server status for most of these pages).
`/en/admin/dashboard` should return its normal Supabase-admin
login/redirect behavior, unchanged from before this phase.

Representative Vapi route presence (built, not necessarily invoked with a
real payload — these expect a Vapi-shaped POST body, so a bare GET/empty
POST returning `404`/`405`/`400` rather than a server crash is the signal
that the route exists and is wired up):

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$APP/api/vapi/webhook"
curl -s -o /dev/null -w "%{http_code}\n" "$APP/api/vapi/create-reservation-request"
```

## K) Beta flag off check

```bash
# In .env / deployment config:
# NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA=false
npm run build
fuser -k 3000/tcp || true
nohup npm start > /tmp/sesli-agent-frontend.log 2>&1 &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" "$APP/en/backend-admin"
```

Expect `404`. Confirms every `backend-admin/*` page's `notFound()` guard
(`NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA` check) is effective at build time,
not just hidden from navigation.
