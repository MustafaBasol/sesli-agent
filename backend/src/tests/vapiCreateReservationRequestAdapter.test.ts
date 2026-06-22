/**
 * vapiCreateReservationRequestAdapter.test.ts — pure-logic checks for the
 * Phase 28 create-reservation-request adapter (no Prisma, no DB).
 *
 * Run: npx tsx src/tests/vapiCreateReservationRequestAdapter.test.ts
 */
import assert from "node:assert/strict";
import {
  buildAvailabilityBlockedResponse,
  buildCreateMissingFieldsResponse,
  CREATE_BLOCKING_AVAILABILITY_REASONS,
  computeMissingFields,
  extractCreateReservationRequestArgs,
} from "../utils/vapi/createReservationRequestAdapter";
import { parseVapiPayload } from "../utils/vapi/parser";

async function main() {
  const currentYear = 2026;

  // Flat snake_case payload.
  {
    const rawBody = {
      customer_name: "Ada Lovelace",
      phone_number: "+33 6 12 34 56 78",
      reservation_date: "2027-05-20",
      reservation_time: "20:30",
      party_size: 4,
      language: "en",
      special_request: "window seat",
      call_id: "call-flat-1",
    };
    const body = parseVapiPayload(rawBody);
    const args = extractCreateReservationRequestArgs([body, rawBody], rawBody, currentYear);
    assert.equal(args.customerName, "Ada Lovelace");
    assert.equal(args.phoneNumber, "+33 6 12 34 56 78");
    assert.equal(args.normalizedPhone, "33612345678");
    assert.equal(args.reservationDate, "2027-05-20");
    assert.equal(args.reservationTime, "20:30");
    assert.equal(args.partySize, 4);
    assert.equal(args.language, "en");
    assert.equal(args.specialRequest, "window seat");
    assert.equal(args.callId, "call-flat-1");
    assert.equal(computeMissingFields(args).length, 0);
  }

  // camelCase aliases.
  {
    const rawBody = {
      fullName: "Grace Hopper",
      phoneNumber: "+1 212 555 0100",
      reservationDate: "2027-06-01",
      reservationTime: "19:00",
      numberOfGuests: 2,
      specialRequests: "highchair needed",
    };
    const body = parseVapiPayload(rawBody);
    const args = extractCreateReservationRequestArgs([body, rawBody], rawBody, currentYear);
    assert.equal(args.customerName, "Grace Hopper");
    assert.equal(args.phoneNumber, "+1 212 555 0100");
    assert.equal(args.reservationDate, "2027-06-01");
    assert.equal(args.reservationTime, "19:00");
    assert.equal(args.partySize, 2);
    assert.equal(args.specialRequest, "highchair needed");
  }

  // Nested Vapi tool-call envelope (message.toolCalls[].function.arguments as object).
  {
    const rawBody = {
      message: {
        call: { id: "call-nested-1" },
        toolCalls: [
          {
            id: "tc-1",
            function: {
              arguments: {
                customer_name: "Alan Turing",
                phone_number: "+44 20 7946 0958",
                reservation_date: "2027-07-15",
                reservation_time: "18:45",
                party_size: 3,
              },
            },
          },
        ],
      },
    };
    const body = parseVapiPayload(rawBody);
    const args = extractCreateReservationRequestArgs([body, rawBody], rawBody, currentYear);
    assert.equal(args.customerName, "Alan Turing");
    assert.equal(args.reservationDate, "2027-07-15");
    assert.equal(args.partySize, 3);
    assert.equal(args.callId, "call-nested-1", "call_id from message.call.id wins over toolCallId fallback");
  }

  // Nested tool-call envelope with JSON-string arguments.
  {
    const rawBody = {
      message: {
        call: { id: "call-nested-2" },
        toolCallList: [
          {
            id: "tc-2",
            function: {
              arguments: JSON.stringify({
                customer_name: "Margaret Hamilton",
                phone_number: "+1 650 555 0100",
                reservation_date: "2027-08-01",
                reservation_time: "12:00",
                party_size: 5,
              }),
            },
          },
        ],
      },
    };
    const body = parseVapiPayload(rawBody);
    const args = extractCreateReservationRequestArgs([body, rawBody], rawBody, currentYear);
    assert.equal(args.customerName, "Margaret Hamilton");
    assert.equal(args.partySize, 5);
  }

  // callId falls back to toolCallId when no call.id is present.
  {
    const rawBody = {
      toolCall: {
        id: "tc-only-3",
        function: {
          arguments: {
            customer_name: "Tim",
            phone_number: "+1 555 0000",
            reservation_date: "2027-09-01",
            reservation_time: "20:00",
            party_size: 2,
          },
        },
      },
    };
    const body = parseVapiPayload(rawBody);
    const args = extractCreateReservationRequestArgs([body, rawBody], rawBody, currentYear);
    assert.equal(args.callId, "tc-only-3");
  }

  // Caller-number fallback chain (no explicit phone alias provided).
  {
    const rawBody = {
      customer_name: "No Alias Phone",
      reservation_date: "2027-10-01",
      reservation_time: "20:00",
      party_size: 2,
      message: { call: { customer: { number: "+1 555 9999" } } },
    };
    const body = parseVapiPayload(rawBody);
    const args = extractCreateReservationRequestArgs([body, rawBody], rawBody, currentYear);
    assert.equal(args.phoneNumber, "+1 555 9999");
  }

  // Missing fields.
  {
    const rawBody = { customer_name: "No Phone" };
    const body = parseVapiPayload(rawBody);
    const args = extractCreateReservationRequestArgs([body, rawBody], rawBody, currentYear);
    const missing = computeMissingFields(args);
    assert.deepEqual(missing, ["phone_number", "reservation_date", "reservation_time", "party_size"]);

    const response = buildCreateMissingFieldsResponse(missing);
    assert.equal(response.success, false);
    assert.equal(response.available, false);
    assert.deepEqual(response.missing_fields, missing);
  }

  // Invalid date/time/partySize never throw — they normalize to null/missing.
  {
    const rawBody = {
      customer_name: "Bad Input",
      phone_number: "+1 555 1111",
      reservation_date: "not-a-date",
      reservation_time: "25:99",
      party_size: "a lot",
    };
    const body = parseVapiPayload(rawBody);
    const args = extractCreateReservationRequestArgs([body, rawBody], rawBody, currentYear);
    assert.equal(args.reservationDate, null);
    assert.equal(args.reservationTime, null);
    assert.equal(args.partySize, null);
    assert.deepEqual(computeMissingFields(args), ["reservation_date", "reservation_time", "party_size"]);
  }

  // Availability-blocked response shape and the blocking-reason allowlist.
  {
    assert.ok(CREATE_BLOCKING_AVAILABILITY_REASONS.has("reservations_disabled"));
    assert.ok(CREATE_BLOCKING_AVAILABILITY_REASONS.has("blackout_full_day"));
    assert.ok(CREATE_BLOCKING_AVAILABILITY_REASONS.has("party_size_out_of_range"));
    assert.ok(CREATE_BLOCKING_AVAILABILITY_REASONS.has("outside_booking_window"));
    assert.ok(CREATE_BLOCKING_AVAILABILITY_REASONS.has("restaurant_inactive"));
    assert.ok(
      !CREATE_BLOCKING_AVAILABILITY_REASONS.has("opening_hours_not_configured"),
      "missing-config state must never block creation"
    );
    assert.ok(!CREATE_BLOCKING_AVAILABILITY_REASONS.has("invalid_date"));
    assert.ok(!CREATE_BLOCKING_AVAILABILITY_REASONS.has("restaurant_not_found"));

    const blocked = buildAvailabilityBlockedResponse("blackout_full_day");
    assert.equal(blocked.success, false);
    assert.equal(blocked.blocked_reason, "blackout_full_day");
    assert.match(blocked.message, /closed/i);
  }

  console.log("vapiCreateReservationRequestAdapter.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("vapiCreateReservationRequestAdapter.test.ts failed:", err);
  process.exitCode = 1;
});
