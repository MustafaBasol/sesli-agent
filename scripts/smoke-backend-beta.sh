#!/usr/bin/env bash
# Non-destructive smoke test for the backend beta API (Phase 20).
# See docs/backend-beta-smoke-tests.md for the manual command-by-command
# version this script automates. Reads all config from env vars; never
# hardcodes secrets. Does not mutate data by default.
#
# Required env:
#   API_BASE_URL          e.g. http://localhost:4000
#   SMOKE_OWNER_EMAIL
#   SMOKE_OWNER_PASSWORD
#   SMOKE_RESTAURANT_ID
#
# Usage:
#   API_BASE_URL=http://localhost:4000 \
#   SMOKE_OWNER_EMAIL=owner@example.com \
#   SMOKE_OWNER_PASSWORD=*** \
#   SMOKE_RESTAURANT_ID=<restaurant-id> \
#   ./scripts/smoke-backend-beta.sh

set -euo pipefail

PASS=true
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log_pass() { echo "PASS: $1"; }
log_fail() { echo "FAIL: $1"; PASS=false; }

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "FAIL: required env var $name is not set" >&2
    exit 1
  fi
}

require_env API_BASE_URL
require_env SMOKE_OWNER_EMAIL
require_env SMOKE_OWNER_PASSWORD
require_env SMOKE_RESTAURANT_ID

api="${API_BASE_URL%/}"
# Accept either http://host:4000 or http://host:4000/api — paths below always
# add their own /api prefix, so a trailing /api in the input must be dropped
# to avoid a duplicate /api/api/... mistake.
api="${api%/api}"

# --- health ---
health_code=$(curl -s -o /dev/null -w "%{http_code}" "$api/api/health" || echo "000")
if [ "$health_code" = "200" ]; then
  log_pass "GET /api/health -> 200"
else
  log_fail "GET /api/health -> $health_code"
fi

# --- login ---
login_file="$TMP_DIR/login.json"
login_code=$(curl -s -o "$login_file" -w "%{http_code}" -X POST "$api/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SMOKE_OWNER_EMAIL\",\"password\":\"$SMOKE_OWNER_PASSWORD\"}")

if [ "$login_code" != "200" ]; then
  log_fail "POST /api/auth/login -> $login_code"
  echo "Cannot continue without a valid login; stopping here."
  echo
  echo "Overall: FAIL"
  exit 1
fi
log_pass "POST /api/auth/login -> 200"

token=$(grep -o '"token":"[^"]*"' "$login_file" | head -1 | cut -d'"' -f4)
if [ -z "$token" ]; then
  log_fail "could not extract token from login response"
  echo "Overall: FAIL"
  exit 1
fi

# --- representative authenticated endpoints ---
check_endpoint() {
  local label="$1" path="$2" outfile="$3"
  local code
  code=$(curl -s -o "$outfile" -w "%{http_code}" "$api$path" -H "Authorization: Bearer $token")
  if [ "$code" = "200" ]; then
    log_pass "GET $path -> 200"
  else
    log_fail "GET $path -> $code"
  fi
}

restaurant_path="/api/restaurants/$SMOKE_RESTAURANT_ID"
check_endpoint "dashboard" "$restaurant_path/dashboard/summary" "$TMP_DIR/dashboard.json"
check_endpoint "reservation-requests" "$restaurant_path/reservation-requests" "$TMP_DIR/reservation-requests.json"
check_endpoint "reservations" "$restaurant_path/reservations" "$TMP_DIR/reservations.json"
check_endpoint "tables" "$restaurant_path/tables" "$TMP_DIR/tables.json"
check_endpoint "customers" "$restaurant_path/customers" "$TMP_DIR/customers.json"
check_endpoint "conversations" "$restaurant_path/conversations" "$TMP_DIR/conversations.json"
check_endpoint "integrations" "$restaurant_path/integrations" "$TMP_DIR/integrations.json"
check_endpoint "team" "$restaurant_path/team" "$TMP_DIR/team.json"
check_endpoint "settings" "$restaurant_path/settings" "$TMP_DIR/settings.json"
check_endpoint "availability-settings" "$restaurant_path/availability/settings" "$TMP_DIR/availability-settings.json"
check_endpoint "availability-blackouts" "$restaurant_path/availability/blackouts" "$TMP_DIR/availability-blackouts.json"

# Future date avoids minAdvanceMinutes/bookingWindowDays failures regardless
# of restaurant settings. GNU date (-d) and BSD/macOS date (-v) both handled.
future_date=$(date -u -d "+7 days" +%F 2>/dev/null || date -u -v+7d +%F)
check_endpoint "availability-slots" "$restaurant_path/availability/slots?date=$future_date&partySize=2" "$TMP_DIR/availability-slots.json"

# --- Vapi check-availability webhook (Phase 27) ---
# Public, publicWebhookKey-authenticated route, not a JWT-protected one —
# uses the seeded dev integration connection's key by default. Read-only:
# never creates a ReservationRequest/Reservation. Does not require
# available:true since the target restaurant may have no opening hours or
# tables configured; only success + 200 are checked here.
vapi_key="${SMOKE_VAPI_PUBLIC_WEBHOOK_KEY:-dev_vapi_golden_meat}"
vapi_check_availability_file="$TMP_DIR/vapi-check-availability.json"
vapi_code=$(curl -s -o "$vapi_check_availability_file" -w "%{http_code}" \
  -X POST "$api/api/webhooks/vapi/$vapi_key/check-availability" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$future_date\",\"partySize\":2}")
if [ "$vapi_code" = "200" ] && grep -q '"success"' "$vapi_check_availability_file"; then
  log_pass "POST /api/webhooks/vapi/$vapi_key/check-availability -> 200 (success field present)"
else
  log_fail "POST /api/webhooks/vapi/$vapi_key/check-availability -> $vapi_code"
fi

# --- sensitive field leak check across all captured responses ---
sensitive_patterns=(
  passwordHash resetToken session refreshToken jwt JWT credentials
  credentialsEncrypted webhookVerifyTokenHash accessToken apiKey
  providerSecret clientSecret tokenValue rawPayload stateJson
  availableTableIds tableIds
)

grep_args=()
for p in "${sensitive_patterns[@]}"; do
  grep_args+=(-e "$p")
done

# --- Vapi create-reservation-request webhook (Phase 28) ---
# WRITES a ReservationRequest/Customer/ToolLog row, so this is gated behind
# SMOKE_RUN_WRITE_CHECKS=true and is skipped by default. Only enable against
# a disposable test/beta database — never production. Uses clearly fake data
# tagged SMOKE_TEST_DO_NOT_USE so any leaked row is obviously identifiable.
if [ "${SMOKE_RUN_WRITE_CHECKS:-false}" = "true" ]; then
  vapi_create_file="$TMP_DIR/vapi-create-reservation-request.json"
  future_booking_date=$(date -u -d "+8 days" +%F 2>/dev/null || date -u -v+8d +%F)
  vapi_create_code=$(curl -s -o "$vapi_create_file" -w "%{http_code}" \
    -X POST "$api/api/webhooks/vapi/$vapi_key/create-reservation-request" \
    -H "Content-Type: application/json" \
    -d "{\"customer_name\":\"Smoke Test Guest\",\"phone_number\":\"+33000000000\",\"reservation_date\":\"$future_booking_date\",\"reservation_time\":\"20:00\",\"party_size\":2,\"special_request\":\"SMOKE_TEST_DO_NOT_USE\"}")
  if [ "$vapi_create_code" = "200" ] && grep -q '"success":true' "$vapi_create_file"; then
    log_pass "POST /api/webhooks/vapi/$vapi_key/create-reservation-request -> 200 (success:true)"
  else
    log_fail "POST /api/webhooks/vapi/$vapi_key/create-reservation-request -> $vapi_create_code"
  fi
else
  echo "SKIPPED: POST /api/webhooks/vapi/.../create-reservation-request (set SMOKE_RUN_WRITE_CHECKS=true on a disposable test DB to enable)"
fi

# --- sensitive field leak check across all captured responses ---
if [ -n "$leaked_files" ]; then
  log_fail "sensitive field pattern found in: $leaked_files"
else
  log_pass "no sensitive field patterns found in captured responses"
fi

echo
if [ "$PASS" = true ]; then
  echo "Overall: PASS"
  exit 0
else
  echo "Overall: FAIL"
  exit 1
fi
