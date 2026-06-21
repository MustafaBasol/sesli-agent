/**
 * vapiNormalizers.test.ts — parsing/normalization checks for the Phase 4
 * Vapi webhook (ported from the Next.js app's src/lib/vapi-*.ts behavior).
 *
 * Run: npx tsx src/tests/vapiNormalizers.test.ts
 */
import assert from "node:assert/strict";
import { parseVapiPayload } from "../utils/vapi/parser";
import {
  buildMissingFieldsResponse,
  getValueFromAliases,
  normalizeDate,
  normalizePartySize,
  normalizePhone,
  normalizeTime,
  toDigitsOnlyPhone,
} from "../utils/vapi/normalizers";
import { buildVapiErrorPayload, buildVapiSuccessPayload, getVapiToolCallId } from "../utils/vapi/toolResponse";

async function main() {
  // parseVapiPayload — all three Vapi payload shapes plus the plain fallback.
  assert.deepEqual(
    parseVapiPayload({ message: { call: { id: "call-1" }, toolCalls: [{ function: { arguments: { foo: "bar" } } }] } }),
    { foo: "bar", call_id: "call-1" },
    "message.toolCalls[0].function.arguments shape"
  );
  assert.deepEqual(
    parseVapiPayload({
      message: { call: { id: "call-2" }, toolCallList: [{ function: { arguments: '{"foo":"bar"}' } }] },
    }),
    { foo: "bar", call_id: "call-2" },
    "message.toolCallList[0].function.arguments shape (stringified JSON)"
  );
  assert.deepEqual(
    parseVapiPayload({ call: { id: "call-3" }, toolCall: { function: { arguments: { foo: "bar" } } } }),
    { foo: "bar", call_id: "call-3" },
    "toolCall.function.arguments shape"
  );
  assert.deepEqual(parseVapiPayload({ foo: "bar" }), { foo: "bar" }, "falls back to root-level body");

  // getValueFromAliases — first non-empty value across ordered sources/aliases.
  assert.equal(getValueFromAliases([{ name: "Ada" }], ["customer_name", "name"]), "Ada");
  assert.equal(getValueFromAliases([{}, { full_name: "Ada" }], ["customer_name", "full_name"]), "Ada");
  assert.equal(getValueFromAliases([{ customer_name: "" }], ["customer_name"]), null, "empty string is not a value");

  // normalizePhone / toDigitsOnlyPhone
  assert.equal(normalizePhone(" +33 6 12 34 56 78 "), "+33 6 12 34 56 78");
  assert.equal(normalizePhone(null), null);
  assert.equal(toDigitsOnlyPhone("+33 6 12 34 56 78"), "33612345678");

  // normalizeTime
  assert.equal(normalizeTime("21"), "21:00");
  assert.equal(normalizeTime("9"), "09:00");
  assert.equal(normalizeTime("21h"), "21:00");
  assert.equal(normalizeTime("21 h"), "21:00");
  assert.equal(normalizeTime("21.00"), "21:00");
  assert.equal(normalizeTime("9:30"), "09:30");
  assert.equal(normalizeTime("25:00"), null, "out-of-range hour is rejected");
  assert.equal(normalizeTime("not a time"), null);

  // normalizeDate — past-year correction and DD/MM/YYYY conversion.
  assert.equal(normalizeDate("2024-03-05", 2026), "2026-03-05", "past year is corrected to currentYear");
  assert.equal(normalizeDate("2027-03-05", 2026), "2027-03-05", "future year is kept as-is");
  assert.equal(normalizeDate("05/03/2024", 2026), "2026-03-05");
  assert.equal(normalizeDate("05-03-2024", 2026), "2026-03-05");
  assert.equal(normalizeDate("garbage", 2026), null);

  // normalizePartySize — numbers, "N kişi"/"N people", word numbers (EN+TR).
  assert.equal(normalizePartySize(4), 4);
  assert.equal(normalizePartySize("4"), 4);
  assert.equal(normalizePartySize("4 kişi"), 4);
  assert.equal(normalizePartySize("4 people"), 4);
  assert.equal(normalizePartySize("dört"), 4);
  assert.equal(normalizePartySize("four"), 4);
  assert.equal(normalizePartySize(0), null, "zero is not a valid party size");
  assert.equal(normalizePartySize("a lot"), null);

  // buildMissingFieldsResponse — Vapi-compatible shape.
  const missing = buildMissingFieldsResponse(["customer_name", "phone_number"]);
  assert.equal(missing.success, false);
  assert.equal(missing.available, false);
  assert.deepEqual(missing.missing_fields, ["customer_name", "phone_number"]);
  assert.match(missing.message, /customer_name, phone_number/);

  // getVapiToolCallId — picks the first id from any of Vapi's request shapes.
  assert.equal(getVapiToolCallId({ message: { toolCalls: [{ id: "tc-1" }] } }), "tc-1");
  assert.equal(getVapiToolCallId({ toolCall: { id: "tc-2" } }), "tc-2");
  assert.equal(getVapiToolCallId({ id: "tc-3" }), "tc-3");
  assert.equal(getVapiToolCallId({}), null);

  // buildVapiSuccessPayload / buildVapiErrorPayload — wraps in `results[]` only
  // when Vapi sent a toolCallId; otherwise returns the raw payload (so the
  // existing manual-test-without-Vapi-headers flow keeps working).
  const successWithToolCall = buildVapiSuccessPayload({ toolCallId: "tc-1" }, { ok: true });
  assert.equal(successWithToolCall.status, 200);
  assert.deepEqual(successWithToolCall.body, { results: [{ toolCallId: "tc-1", result: JSON.stringify({ ok: true }) }] });

  const successWithoutToolCall = buildVapiSuccessPayload({}, { ok: true });
  assert.deepEqual(successWithoutToolCall.body, { ok: true });

  const errorWithToolCall = buildVapiErrorPayload({ toolCallId: "tc-1" }, "boom");
  assert.equal(errorWithToolCall.status, 200, "errors are still 200 when Vapi expects a tool result");
  assert.deepEqual(errorWithToolCall.body, { results: [{ toolCallId: "tc-1", error: "boom" }] });

  const errorWithoutToolCall = buildVapiErrorPayload({}, "boom");
  assert.equal(errorWithoutToolCall.status, 500);
  assert.deepEqual(errorWithoutToolCall.body, { error: "boom" });

  console.log("vapiNormalizers.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("vapiNormalizers.test.ts failed:", err);
  process.exitCode = 1;
});
