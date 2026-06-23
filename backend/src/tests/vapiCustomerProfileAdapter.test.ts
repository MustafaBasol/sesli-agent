/**
 * vapiCustomerProfileAdapter.test.ts — pure-logic checks for the Phase 29
 * Vapi get-customer-profile / create-customer-profile adapters (argument
 * extraction, missing-field computation, response-shape builders). No
 * Prisma/DB involved, so this is wired into `npm test`.
 *
 * Run: npx tsx src/tests/vapiCustomerProfileAdapter.test.ts
 */
import assert from "node:assert/strict";
import {
  buildCustomerProfileConflictResponse,
  buildCustomerProfileMissingFieldsResponse,
  computeCreateCustomerProfileMissingFields,
  computeGetCustomerProfileMissingFields,
  extractCreateCustomerProfileArgs,
  extractGetCustomerProfileArgs,
  toSafeCustomerPayload,
} from "../utils/vapi/customerProfileAdapter";

async function main() {
  // extractGetCustomerProfileArgs — flat snake_case.
  assert.deepEqual(
    extractGetCustomerProfileArgs([{ phone_number: "+1 555 0100", email: "Jane@Example.com" }], {}),
    { phone: "+1 555 0100", normalizedPhone: "15550100", email: "jane@example.com", name: null, callId: null },
    "flat snake_case phone_number/email"
  );

  // camelCase aliases.
  assert.deepEqual(
    extractGetCustomerProfileArgs([{ phoneNumber: "+1 555 0200", fullName: "Grace Hopper" }], {}),
    { phone: "+1 555 0200", normalizedPhone: "15550200", email: null, name: "Grace Hopper", callId: null },
    "camelCase phoneNumber/fullName"
  );

  // Vapi envelope caller-number fallback when no alias matches.
  assert.deepEqual(
    extractGetCustomerProfileArgs([{}], { message: { call: { customer: { number: "+1 555 0300" } } } }),
    { phone: "+1 555 0300", normalizedPhone: "15550300", email: null, name: null, callId: null },
    "message.call.customer.number fallback"
  );

  // Nested Vapi tool-call envelope with JSON-string arguments + call id passthrough.
  const nestedArgs = { phone: "+1 555 0400", call_id: "call-123" };
  assert.deepEqual(
    extractGetCustomerProfileArgs([nestedArgs, { message: { toolCalls: [{ id: "tc-1" }] } }], {
      message: { toolCalls: [{ id: "tc-1" }] },
    }),
    { phone: "+1 555 0400", normalizedPhone: "15550400", email: null, name: null, callId: "call-123" },
    "call_id on parsed payload takes priority"
  );

  // Empty payload -> all null.
  assert.deepEqual(
    extractGetCustomerProfileArgs([{}], {}),
    { phone: null, normalizedPhone: null, email: null, name: null, callId: null },
    "empty payload -> all null"
  );

  // computeGetCustomerProfileMissingFields — at least one of phone/email required.
  assert.deepEqual(
    computeGetCustomerProfileMissingFields({ phone: null, normalizedPhone: null, email: null, name: null, callId: null }),
    ["phone_or_email"],
    "missing both phone and email"
  );
  assert.deepEqual(
    computeGetCustomerProfileMissingFields({
      phone: "+1 555 0100",
      normalizedPhone: "15550100",
      email: null,
      name: null,
      callId: null,
    }),
    [],
    "phone alone satisfies the requirement"
  );
  assert.deepEqual(
    computeGetCustomerProfileMissingFields({
      phone: null,
      normalizedPhone: null,
      email: "jane@example.com",
      name: null,
      callId: null,
    }),
    [],
    "email alone satisfies the requirement"
  );

  // extractCreateCustomerProfileArgs — snake_case + default language.
  assert.deepEqual(
    extractCreateCustomerProfileArgs(
      [{ customer_name: "Jane Doe", phone_number: "+1 555 0500", notes: "VIP" }],
      {}
    ),
    {
      name: "Jane Doe",
      phone: "+1 555 0500",
      normalizedPhone: "15550500",
      email: null,
      notes: "VIP",
      language: "tr",
      callId: null,
    },
    "snake_case create payload, default language"
  );

  // explicit language override.
  assert.equal(
    extractCreateCustomerProfileArgs([{ name: "X", phone: "+1 555 0600", language: "en" }], {}).language,
    "en",
    "explicit language is preserved"
  );

  // computeCreateCustomerProfileMissingFields — name + (phone or email) required.
  assert.deepEqual(
    computeCreateCustomerProfileMissingFields({
      name: null,
      phone: null,
      normalizedPhone: null,
      email: null,
      notes: null,
      language: "tr",
      callId: null,
    }),
    ["name", "phone_or_email"],
    "missing name and contact info"
  );
  assert.deepEqual(
    computeCreateCustomerProfileMissingFields({
      name: "Jane Doe",
      phone: "+1 555 0500",
      normalizedPhone: "15550500",
      email: null,
      notes: null,
      language: "tr",
      callId: null,
    }),
    [],
    "name + phone satisfies the requirement"
  );
  assert.deepEqual(
    computeCreateCustomerProfileMissingFields({
      name: "Jane Doe",
      phone: null,
      normalizedPhone: null,
      email: null,
      notes: null,
      language: "tr",
      callId: null,
    }),
    ["phone_or_email"],
    "name present but no contact info"
  );

  // buildCustomerProfileMissingFieldsResponse / conflict response shapes.
  const missingResponse = buildCustomerProfileMissingFieldsResponse(["name", "phone_or_email"]);
  assert.equal(missingResponse.success, false);
  assert.deepEqual(missingResponse.missing_fields, ["name", "phone_or_email"]);
  assert.ok(missingResponse.message.includes("name"));

  const conflictResponse = buildCustomerProfileConflictResponse();
  assert.equal(conflictResponse.success, false);
  assert.equal(conflictResponse.conflict, true);

  // toSafeCustomerPayload — only non-empty fields included, no internal fields.
  assert.deepEqual(
    toSafeCustomerPayload({ fullName: "Jane Doe", phoneNumber: "+1 555 0500", email: null, notes: null }),
    { name: "Jane Doe", phone: "+1 555 0500" },
    "empty email/notes are omitted, not returned as null"
  );
  assert.deepEqual(toSafeCustomerPayload({ fullName: null, phoneNumber: null, email: null, notes: null }), {});

  console.log("vapiCustomerProfileAdapter.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("vapiCustomerProfileAdapter.test.ts failed:", err);
  process.exitCode = 1;
});
