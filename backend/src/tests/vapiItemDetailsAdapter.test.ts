/**
 * vapiItemDetailsAdapter.test.ts — pure-logic checks for the Phase 38 Vapi
 * get-item-details adapter (argument extraction, missing-field policy,
 * response-shape building). No Prisma/DB involved, so this is wired into
 * `npm test`.
 *
 * Run: npx tsx src/tests/vapiItemDetailsAdapter.test.ts
 */
import assert from "node:assert/strict";
import {
  buildItemAmbiguousResponse,
  buildItemDetailsMissingFieldsResponse,
  buildItemFoundResponse,
  buildItemNotFoundResponse,
  computeGetItemDetailsMissingFields,
  extractGetItemDetailsArgs,
  MAX_CANDIDATES,
  resolveItemSearchName,
  toVoiceMenuItemCandidate,
  toVoiceMenuItemDetail,
} from "../utils/vapi/itemDetailsAdapter";
import { parseVapiPayload } from "../utils/vapi/parser";

async function main() {
  // --- extractGetItemDetailsArgs -----------------------------------------

  assert.deepEqual(extractGetItemDetailsArgs([{}], {}), {
    itemId: null,
    itemName: null,
    search: null,
    category: null,
    language: null,
    callId: null,
  });

  // Flat aliases.
  assert.deepEqual(
    extractGetItemDetailsArgs(
      [{ itemId: "item-1", itemName: "Steak", search: "ignored-when-itemName-present", category: "Mains", language: "en", callId: "call-1" }],
      {}
    ),
    { itemId: "item-1", itemName: "Steak", search: "ignored-when-itemName-present", category: "Mains", language: "en", callId: "call-1" }
  );

  // camelCase aliases.
  assert.deepEqual(extractGetItemDetailsArgs([{ item_id: "item-2" }], {}).itemId, "item-2");
  assert.deepEqual(extractGetItemDetailsArgs([{ item_name: "Soup" }], {}).itemName, "Soup");
  assert.deepEqual(extractGetItemDetailsArgs([{ name: "Cake" }], {}).itemName, "Cake");
  assert.deepEqual(extractGetItemDetailsArgs([{ query: "fish" }], {}).search, "fish");
  assert.deepEqual(extractGetItemDetailsArgs([{ keyword: "spicy" }], {}).search, "spicy");
  assert.deepEqual(extractGetItemDetailsArgs([{ category_name: "Desserts" }], {}).category, "Desserts");

  // Nested Vapi tool-call payload, JSON-string arguments.
  const nestedRawBody = {
    message: {
      call: { id: "vapi-call-1" },
      toolCalls: [{ id: "tc-1", function: { arguments: JSON.stringify({ item_name: "Lasagna" }) } }],
    },
  };
  const nestedParsed = parseVapiPayload(nestedRawBody);
  const nestedArgs = extractGetItemDetailsArgs([nestedParsed, nestedRawBody], nestedRawBody);
  assert.equal(nestedArgs.itemName, "Lasagna");
  assert.equal(nestedArgs.callId, "vapi-call-1");

  // --- computeGetItemDetailsMissingFields ---------------------------------

  assert.deepEqual(computeGetItemDetailsMissingFields({ itemId: null, itemName: null, search: null, category: null, language: null, callId: null }), [
    "item_identifier",
  ]);
  assert.deepEqual(
    computeGetItemDetailsMissingFields({ itemId: "x", itemName: null, search: null, category: null, language: null, callId: null }),
    []
  );
  assert.deepEqual(
    computeGetItemDetailsMissingFields({ itemId: null, itemName: "Soup", search: null, category: null, language: null, callId: null }),
    []
  );
  assert.deepEqual(
    computeGetItemDetailsMissingFields({ itemId: null, itemName: null, search: "soup", category: null, language: null, callId: null }),
    []
  );

  // --- resolveItemSearchName -----------------------------------------------

  assert.equal(
    resolveItemSearchName({ itemId: null, itemName: "Steak", search: "ignored", category: null, language: null, callId: null }),
    "Steak",
    "itemName must take priority over a generic search value"
  );
  assert.equal(
    resolveItemSearchName({ itemId: null, itemName: null, search: "soup", category: null, language: null, callId: null }),
    "soup"
  );
  assert.equal(
    resolveItemSearchName({ itemId: null, itemName: null, search: null, category: null, language: null, callId: null }),
    null
  );

  // --- toVoiceMenuItemDetail / toVoiceMenuItemCandidate --------------------

  const availableItemRow = {
    name: "Steak",
    description: "Grilled ribeye",
    priceCents: 2400,
    currency: "EUR",
    isAvailable: true,
    allergensJson: null,
    dietaryTagsJson: ["high-protein"],
  };
  const detail = toVoiceMenuItemDetail(availableItemRow, "Mains");
  assert.deepEqual(detail, {
    name: "Steak",
    category: "Mains",
    description: "Grilled ribeye",
    price: "24.00 EUR",
    available: true,
    dietary_tags: ["high-protein"],
  });

  const unavailableItemRow = { ...availableItemRow, isAvailable: false };
  const unavailableDetail = toVoiceMenuItemDetail(unavailableItemRow);
  assert.equal(unavailableDetail.available, false);
  assert.equal(unavailableDetail.category, undefined);

  const candidate = toVoiceMenuItemCandidate(availableItemRow, "Mains");
  assert.deepEqual(candidate, { name: "Steak", category: "Mains", price: "24.00 EUR" });
  assert.ok(!("description" in candidate), "candidates must be a minimal name/category/price shape, not a full item");
  assert.ok(!("available" in candidate));

  // --- response builders ---------------------------------------------------

  const missing = buildItemDetailsMissingFieldsResponse(["item_identifier"]);
  assert.equal(missing.success, false);
  assert.deepEqual(missing.missing_fields, ["item_identifier"]);

  const notFound = buildItemNotFoundResponse();
  assert.equal(notFound.success, true);
  assert.equal(notFound.item_found, false);
  assert.ok(!notFound.ambiguous);

  const candidates = [
    { name: "Steak Frites" },
    { name: "Steak Tartare" },
  ];
  const ambiguous = buildItemAmbiguousResponse(candidates);
  assert.equal(ambiguous.success, true);
  assert.equal(ambiguous.item_found, false);
  assert.equal(ambiguous.ambiguous, true);
  assert.deepEqual(ambiguous.candidates, candidates);
  assert.ok(candidates.length <= MAX_CANDIDATES);

  const found = buildItemFoundResponse(detail);
  assert.equal(found.success, true);
  assert.equal(found.item_found, true);
  assert.deepEqual(found.item, detail);
  assert.ok(found.message.includes("24.00 EUR"));

  const foundUnavailable = buildItemFoundResponse(unavailableDetail);
  assert.equal(foundUnavailable.success, true);
  assert.equal(foundUnavailable.item_found, true);
  assert.ok(
    /may not be available/i.test(foundUnavailable.message),
    "an unavailable item must never be presented as available in the voice message"
  );

  // No raw object leakage anywhere in the response builders' output.
  const serialized = JSON.stringify([missing, notFound, ambiguous, found, foundUnavailable]);
  assert.ok(!serialized.includes("restaurantId"));
  assert.ok(!serialized.includes("createdAt"));
  assert.ok(!serialized.includes('"id":'), "responses must never include a raw item id field");

  console.log("vapiItemDetailsAdapter.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("vapiItemDetailsAdapter.test.ts failed:", err);
  process.exitCode = 1;
});
