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

# --- Vapi get-customer-profile webhook (Phase 29) ---
# Public, publicWebhookKey-authenticated route, read-only: never
# creates/updates a Customer. Uses a fake phone number so a real customer
# record is never required for this check to pass; success:false/found:false
# is the expected, non-failing result.
vapi_get_customer_profile_file="$TMP_DIR/vapi-get-customer-profile.json"
vapi_get_customer_code=$(curl -s -o "$vapi_get_customer_profile_file" -w "%{http_code}" \
  -X POST "$api/api/webhooks/vapi/$vapi_key/get-customer-profile" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+10000000000"}')
if [ "$vapi_get_customer_code" = "200" ] && grep -q '"success"' "$vapi_get_customer_profile_file"; then
  log_pass "POST /api/webhooks/vapi/$vapi_key/get-customer-profile -> 200 (success field present)"
else
  log_fail "POST /api/webhooks/vapi/$vapi_key/get-customer-profile -> $vapi_get_customer_code"
fi

# --- Vapi get-current-date webhook (Phase 30) ---
# Public, publicWebhookKey-authenticated route, read-only: never touches the
# database beyond the Restaurant lookup. Always expected to succeed.
vapi_get_current_date_file="$TMP_DIR/vapi-get-current-date.json"
vapi_get_current_date_code=$(curl -s -o "$vapi_get_current_date_file" -w "%{http_code}" \
  -X POST "$api/api/webhooks/vapi/$vapi_key/get-current-date" \
  -H "Content-Type: application/json" \
  -d '{}')
if [ "$vapi_get_current_date_code" = "200" ] && grep -q '"success"' "$vapi_get_current_date_file"; then
  log_pass "POST /api/webhooks/vapi/$vapi_key/get-current-date -> 200 (success field present)"
else
  log_fail "POST /api/webhooks/vapi/$vapi_key/get-current-date -> $vapi_get_current_date_code"
fi

# --- Vapi get-opening-hours webhook (Phase 30) ---
# Public, publicWebhookKey-authenticated route, read-only: never creates or
# updates a DB row. Succeeds whether or not RestaurantSettings.openingHoursJson
# is configured (success:true with configured:false is the documented safe
# response for an unconfigured restaurant — see
# docs/vapi-date-opening-hours-contract.md).
vapi_get_opening_hours_file="$TMP_DIR/vapi-get-opening-hours.json"
vapi_get_opening_hours_code=$(curl -s -o "$vapi_get_opening_hours_file" -w "%{http_code}" \
  -X POST "$api/api/webhooks/vapi/$vapi_key/get-opening-hours" \
  -H "Content-Type: application/json" \
  -d '{}')
if [ "$vapi_get_opening_hours_code" = "200" ] && grep -q '"success"' "$vapi_get_opening_hours_file"; then
  log_pass "POST /api/webhooks/vapi/$vapi_key/get-opening-hours -> 200 (success field present)"
else
  log_fail "POST /api/webhooks/vapi/$vapi_key/get-opening-hours -> $vapi_get_opening_hours_code"
fi

# --- sensitive field leak check across all captured responses ---
sensitive_patterns=(
  passwordHash resetToken session refreshToken jwt JWT credentials
  credentialsEncrypted webhookVerifyTokenHash accessToken apiKey
  providerSecret clientSecret tokenValue rawPayload stateJson
  availableTableIds tableIds transcript fullTranscript
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

# --- Vapi create-customer-profile webhook (Phase 29) ---
# WRITES/updates a Customer row, so this is gated behind
# SMOKE_RUN_WRITE_CHECKS=true and is skipped by default. Only enable against
# a disposable test/beta database — never production. Uses clearly fake data
# tagged SMOKE_TEST_DO_NOT_USE so any leaked row is obviously identifiable.
# This creates the Customer on first run and updates the same tagged row on
# any repeat run (same phone number reused on purpose).
if [ "${SMOKE_RUN_WRITE_CHECKS:-false}" = "true" ]; then
  vapi_create_customer_file="$TMP_DIR/vapi-create-customer-profile.json"
  vapi_create_customer_code=$(curl -s -o "$vapi_create_customer_file" -w "%{http_code}" \
    -X POST "$api/api/webhooks/vapi/$vapi_key/create-customer-profile" \
    -H "Content-Type: application/json" \
    -d '{"name":"Smoke Test Customer","phone":"+33000000001","email":"smoke-customer@example.test","notes":"SMOKE_TEST_DO_NOT_USE"}')
  if [ "$vapi_create_customer_code" = "200" ] && grep -q '"success":true' "$vapi_create_customer_file"; then
    log_pass "POST /api/webhooks/vapi/$vapi_key/create-customer-profile -> 200 (success:true)"
  else
    log_fail "POST /api/webhooks/vapi/$vapi_key/create-customer-profile -> $vapi_create_customer_code"
  fi
else
  echo "SKIPPED: POST /api/webhooks/vapi/.../create-customer-profile (set SMOKE_RUN_WRITE_CHECKS=true on a disposable test DB to enable)"
fi

# --- Vapi log-call-summary webhook (Phase 31) ---
# WRITES an IntegrationEvent + ToolLog row, so this is gated behind
# SMOKE_RUN_WRITE_CHECKS=true and is skipped by default. Only enable against
# a disposable test/beta database — never production. Uses clearly fake data
# tagged SMOKE_TEST_DO_NOT_USE so any leaked row is obviously identifiable.
if [ "${SMOKE_RUN_WRITE_CHECKS:-false}" = "true" ]; then
  vapi_call_summary_file="$TMP_DIR/vapi-log-call-summary.json"
  smoke_call_id="smoke-call-summary-$(date +%s)"
  vapi_call_summary_code=$(curl -s -o "$vapi_call_summary_file" -w "%{http_code}" \
    -X POST "$api/api/webhooks/vapi/$vapi_key/log-call-summary" \
    -H "Content-Type: application/json" \
    -d "{\"callId\":\"$smoke_call_id\",\"summary\":\"SMOKE_TEST_DO_NOT_USE call summary logging check\",\"phone\":\"+33000000002\",\"language\":\"en\",\"durationSeconds\":30}")
  if [ "$vapi_call_summary_code" = "200" ] && grep -q '"success":true' "$vapi_call_summary_file"; then
    log_pass "POST /api/webhooks/vapi/$vapi_key/log-call-summary -> 200 (success:true)"
  else
    log_fail "POST /api/webhooks/vapi/$vapi_key/log-call-summary -> $vapi_call_summary_code"
  fi
else
  echo "SKIPPED: POST /api/webhooks/vapi/.../log-call-summary (set SMOKE_RUN_WRITE_CHECKS=true on a disposable test DB to enable)"
fi

# --- Vapi handoff-to-staff webhook (Phase 33) ---
# WRITES an IntegrationEvent + ToolLog row, so this is gated behind
# SMOKE_RUN_WRITE_CHECKS=true and is skipped by default. Only enable against
# a disposable test/beta database — never production. Uses clearly fake data
# tagged SMOKE_TEST_DO_NOT_USE so any leaked row is obviously identifiable.
if [ "${SMOKE_RUN_WRITE_CHECKS:-false}" = "true" ]; then
  vapi_handoff_file="$TMP_DIR/vapi-handoff-to-staff.json"
  smoke_handoff_call_id="smoke-handoff-$(date +%s)"
  vapi_handoff_code=$(curl -s -o "$vapi_handoff_file" -w "%{http_code}" \
    -X POST "$api/api/webhooks/vapi/$vapi_key/handoff-to-staff" \
    -H "Content-Type: application/json" \
    -d "{\"callId\":\"$smoke_handoff_call_id\",\"reason\":\"SMOKE_TEST_DO_NOT_USE handoff request\",\"customerName\":\"Smoke Handoff Customer\",\"phone\":\"+33000000003\",\"language\":\"en\"}")
  if [ "$vapi_handoff_code" = "200" ] && grep -q '"success":true' "$vapi_handoff_file"; then
    log_pass "POST /api/webhooks/vapi/$vapi_key/handoff-to-staff -> 200 (success:true)"
  else
    log_fail "POST /api/webhooks/vapi/$vapi_key/handoff-to-staff -> $vapi_handoff_code"
  fi
else
  echo "SKIPPED: POST /api/webhooks/vapi/.../handoff-to-staff (set SMOKE_RUN_WRITE_CHECKS=true on a disposable test DB to enable)"
fi

# --- Vapi cancel-reservation-request webhook (Phase 34) ---
# WRITES an IntegrationEvent + ToolLog row (and may transition a pending
# ReservationRequest to "cancelled" if it matches), so this is gated behind
# SMOKE_RUN_WRITE_CHECKS=true and is skipped by default. Only enable against
# a disposable test/beta database — never production. Uses a clearly
# fake/non-existing reservationRequestId so this always exercises the
# audit-intent-logging path only — it never cancels a real pending request
# or reservation. Tagged SMOKE_TEST_DO_NOT_USE so any leaked row is
# obviously identifiable.
if [ "${SMOKE_RUN_WRITE_CHECKS:-false}" = "true" ]; then
  vapi_cancel_file="$TMP_DIR/vapi-cancel-reservation-request.json"
  smoke_cancel_call_id="smoke-cancel-$(date +%s)"
  smoke_cancel_request_id="smoke-non-existing-request-$(date +%s)"
  vapi_cancel_code=$(curl -s -o "$vapi_cancel_file" -w "%{http_code}" \
    -X POST "$api/api/webhooks/vapi/$vapi_key/cancel-reservation-request" \
    -H "Content-Type: application/json" \
    -d "{\"callId\":\"$smoke_cancel_call_id\",\"reservationRequestId\":\"$smoke_cancel_request_id\",\"reason\":\"SMOKE_TEST_DO_NOT_USE cancellation request\",\"customerName\":\"Smoke Cancel Customer\",\"phone\":\"+33000000004\",\"language\":\"en\"}")
  if [ "$vapi_cancel_code" = "200" ] && grep -q '"success":true' "$vapi_cancel_file" \
    && { grep -q '"cancellation_logged":true' "$vapi_cancel_file" || grep -q '"requires_review":true' "$vapi_cancel_file"; }; then
    log_pass "POST /api/webhooks/vapi/$vapi_key/cancel-reservation-request -> 200 (success:true, cancellation_logged or requires_review)"
  else
    log_fail "POST /api/webhooks/vapi/$vapi_key/cancel-reservation-request -> $vapi_cancel_code"
  fi
else
  echo "SKIPPED: POST /api/webhooks/vapi/.../cancel-reservation-request (set SMOKE_RUN_WRITE_CHECKS=true on a disposable test DB to enable)"
fi

# --- Vapi modify-reservation-request webhook (Phase 35) ---
# WRITES an IntegrationEvent + ToolLog row (and may additionally create a new
# pending "change" ReservationRequest if it matches), so this is gated behind
# SMOKE_RUN_WRITE_CHECKS=true and is skipped by default. Only enable against
# a disposable test/beta database — never production. Uses a clearly
# fake/non-existing reservationRequestId so this always exercises the
# audit-intent-logging path only — it never modifies a real pending request
# or reservation. Tagged SMOKE_TEST_DO_NOT_USE so any leaked row is
# obviously identifiable.
if [ "${SMOKE_RUN_WRITE_CHECKS:-false}" = "true" ]; then
  vapi_modify_file="$TMP_DIR/vapi-modify-reservation-request.json"
  smoke_modify_call_id="smoke-modify-$(date +%s)"
  smoke_modify_request_id="smoke-non-existing-request-$(date +%s)"
  smoke_modify_future_date=$(date -u -d "+7 days" +%F 2>/dev/null || date -u -v+7d +%F)
  vapi_modify_code=$(curl -s -o "$vapi_modify_file" -w "%{http_code}" \
    -X POST "$api/api/webhooks/vapi/$vapi_key/modify-reservation-request" \
    -H "Content-Type: application/json" \
    -d "{\"callId\":\"$smoke_modify_call_id\",\"reservationRequestId\":\"$smoke_modify_request_id\",\"newDate\":\"$smoke_modify_future_date\",\"newTime\":\"20:00\",\"newPartySize\":3,\"reason\":\"SMOKE_TEST_DO_NOT_USE modification request\",\"customerName\":\"Smoke Modify Customer\",\"phone\":\"+33000000005\",\"language\":\"en\"}")
  if [ "$vapi_modify_code" = "200" ] && grep -q '"success":true' "$vapi_modify_file" \
    && { grep -q '"modification_logged":true' "$vapi_modify_file" || grep -q '"requires_review":true' "$vapi_modify_file" || grep -q '"change_request_created":true' "$vapi_modify_file"; }; then
    log_pass "POST /api/webhooks/vapi/$vapi_key/modify-reservation-request -> 200 (success:true, modification_logged/requires_review/change_request_created)"
  else
    log_fail "POST /api/webhooks/vapi/$vapi_key/modify-reservation-request -> $vapi_modify_code"
  fi
else
  echo "SKIPPED: POST /api/webhooks/vapi/.../modify-reservation-request (set SMOKE_RUN_WRITE_CHECKS=true on a disposable test DB to enable)"
fi

# --- sensitive field leak check across all captured responses ---
leaked_files="$(grep -ril "${grep_args[@]}" "$TMP_DIR"/*.json 2>/dev/null || true)"
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
