/**
 * vapiMenuInfoAdapter.test.ts — pure-logic checks for the Phase 38 Vapi
 * get-menu-info adapter (argument extraction, limit bounding, price
 * formatting, response-shape building). No Prisma/DB involved, so this is
 * wired into `npm test`.
 *
 * Run: npx tsx src/tests/vapiMenuInfoAdapter.test.ts
 */
import assert from "node:assert/strict";
import {
  buildFilteredMenuItemsResponse,
  buildMenuSummaryResponse,
  buildNoMatchingMenuItemsResponse,
  buildNoMenuConfiguredResponse,
  DEFAULT_MENU_ITEMS_LIMIT,
  extractGetMenuInfoArgs,
  formatMenuPrice,
  MAX_MENU_ITEMS_LIMIT,
  normalizeMenuItemsLimit,
  toVoiceMenuCategorySummary,
  toVoiceMenuItemSummary,
} from "../utils/vapi/menuInfoAdapter";
import { parseVapiPayload } from "../utils/vapi/parser";

async function main() {
  // --- extractGetMenuInfoArgs -------------------------------------------

  // Flat payload, no optional fields.
  assert.deepEqual(extractGetMenuInfoArgs([{}], {}), {
    category: null,
    search: null,
    limit: DEFAULT_MENU_ITEMS_LIMIT,
    language: null,
    callId: null,
  });

  // Flat aliases.
  assert.deepEqual(
    extractGetMenuInfoArgs([{ category: "Starters", search: "soup", limit: 5, language: "en", callId: "call-1" }], {}),
    { category: "Starters", search: "soup", limit: 5, language: "en", callId: "call-1" }
  );

  // camelCase aliases.
  assert.deepEqual(
    extractGetMenuInfoArgs(
      [{ categoryName: "Mains", itemName: "Steak", maxItems: 3, lang: "tr", conversationId: "conv-1" }],
      {}
    ),
    { category: "Mains", search: "Steak", limit: 3, language: "tr", callId: "conv-1" }
  );

  // snake_case aliases.
  assert.deepEqual(
    extractGetMenuInfoArgs(
      [{ category_name: "Desserts", item_name: "Cake", max_items: 4, locale: "fr", call_id: "call-2" }],
      {}
    ),
    { category: "Desserts", search: "Cake", limit: 4, language: "fr", callId: "call-2" }
  );

  // query/keyword search aliases.
  assert.equal(extractGetMenuInfoArgs([{ query: "vegan" }], {}).search, "vegan");
  assert.equal(extractGetMenuInfoArgs([{ keyword: "spicy" }], {}).search, "spicy");

  // callId falls back to getVapiToolCallId(rawBody) when no alias matches.
  const nestedRawBody = {
    message: {
      call: { id: "vapi-call-99" },
      toolCalls: [{ id: "tc-1", function: { arguments: JSON.stringify({ category: "Starters" }) } }],
    },
  };
  const nestedParsed = parseVapiPayload(nestedRawBody);
  const nestedArgs = extractGetMenuInfoArgs([nestedParsed, nestedRawBody], nestedRawBody);
  assert.equal(nestedArgs.category, "Starters", "nested tool-call JSON-string arguments must be parsed");
  assert.equal(nestedArgs.callId, "vapi-call-99", "callId must resolve from the nested envelope's call.id");

  // No call.id present -> callId falls back to the tool call's own id.
  const nestedRawBodyNoCallId = {
    message: {
      toolCalls: [{ id: "tc-2", function: { arguments: JSON.stringify({ search: "soup" }) } }],
    },
  };
  const nestedParsedNoCallId = parseVapiPayload(nestedRawBodyNoCallId);
  const nestedArgsNoCallId = extractGetMenuInfoArgs([nestedParsedNoCallId, nestedRawBodyNoCallId], nestedRawBodyNoCallId);
  assert.equal(nestedArgsNoCallId.search, "soup");
  assert.equal(nestedArgsNoCallId.callId, "tc-2", "callId must fall back to the tool call id when no call.id is present");

  // --- normalizeMenuItemsLimit -------------------------------------------

  assert.equal(normalizeMenuItemsLimit(undefined), DEFAULT_MENU_ITEMS_LIMIT);
  assert.equal(normalizeMenuItemsLimit(null), DEFAULT_MENU_ITEMS_LIMIT);
  assert.equal(normalizeMenuItemsLimit("abc"), DEFAULT_MENU_ITEMS_LIMIT);
  assert.equal(normalizeMenuItemsLimit(0), DEFAULT_MENU_ITEMS_LIMIT);
  assert.equal(normalizeMenuItemsLimit(-5), DEFAULT_MENU_ITEMS_LIMIT);
  assert.equal(normalizeMenuItemsLimit(5), 5);
  assert.equal(normalizeMenuItemsLimit("5"), 5);
  assert.equal(normalizeMenuItemsLimit(999), MAX_MENU_ITEMS_LIMIT, "limit must be capped, never an unbounded dump");

  // --- formatMenuPrice -----------------------------------------------------

  assert.equal(formatMenuPrice(null, "EUR"), undefined, "null priceCents must omit the price, never invent one");
  assert.equal(formatMenuPrice(850, "EUR"), "8.50 EUR");
  assert.equal(formatMenuPrice(2400, null), "24.00 EUR", "missing currency must default to EUR");
  assert.equal(formatMenuPrice(100, "TRY"), "1.00 TRY");

  // --- toVoiceMenuItemSummary / toVoiceMenuCategorySummary -----------------

  const itemRow = {
    name: "Soup",
    description: "Hot tomato soup",
    priceCents: 850,
    currency: "EUR",
    allergensJson: ["gluten"],
    dietaryTagsJson: ["vegan"],
  };
  const summary = toVoiceMenuItemSummary(itemRow, "Starters");
  assert.deepEqual(summary, {
    name: "Soup",
    category: "Starters",
    description: "Hot tomato soup",
    price: "8.50 EUR",
    dietary_tags: ["vegan"],
    allergens: ["gluten"],
  });
  assert.ok(!JSON.stringify(summary).includes("id"), "item summary must never include a raw DB id field");

  const sparseItem = { name: "Water", description: null, priceCents: null, currency: "EUR", allergensJson: [], dietaryTagsJson: null };
  const sparseSummary = toVoiceMenuItemSummary(sparseItem);
  assert.deepEqual(sparseSummary, { name: "Water" }, "empty/null optional fields must be omitted, not invented");

  const categorySummary = toVoiceMenuCategorySummary({ name: "Starters", description: "Light bites" });
  assert.deepEqual(categorySummary, { name: "Starters", description: "Light bites" });
  assert.deepEqual(toVoiceMenuCategorySummary({ name: "Mains", description: null }), { name: "Mains" });

  // --- response builders -----------------------------------------------

  const noMenu = buildNoMenuConfiguredResponse();
  assert.equal(noMenu.success, true);
  assert.equal(noMenu.menu_available, false);
  assert.ok(noMenu.message.length > 0);

  const noMatchCategory = buildNoMatchingMenuItemsResponse({ category: "Drinks" });
  assert.equal(noMatchCategory.success, true);
  assert.equal(noMatchCategory.items_found, false);
  assert.equal(noMatchCategory.category, "Drinks");

  const noMatchSearch = buildNoMatchingMenuItemsResponse({ search: "caviar" });
  assert.equal(noMatchSearch.items_found, false);
  assert.equal(noMatchSearch.category, undefined);
  assert.ok(noMatchSearch.message.includes("caviar"));

  const summaryResponse = buildMenuSummaryResponse(
    [{ name: "Starters" }, { name: "Mains" }],
    [toVoiceMenuItemSummary(itemRow, "Starters")]
  );
  assert.equal(summaryResponse.success, true);
  assert.equal(summaryResponse.menu_available, true);
  assert.equal(summaryResponse.categories?.length, 2);
  assert.equal(summaryResponse.items?.length, 1);
  assert.ok(summaryResponse.message.includes("Starters"));

  const filteredResponse = buildFilteredMenuItemsResponse([toVoiceMenuItemSummary(itemRow, "Starters")], {
    category: "Starters",
  });
  assert.equal(filteredResponse.items_found, true);
  assert.equal(filteredResponse.category, "Starters");
  assert.ok(filteredResponse.message.includes("Soup"));

  // No raw object leakage anywhere in the response builders' output.
  const serialized = JSON.stringify([noMenu, noMatchCategory, summaryResponse, filteredResponse]);
  assert.ok(!serialized.includes("restaurantId"), "responses must never include restaurantId or other raw DB fields");
  assert.ok(!serialized.includes("createdAt"));

  console.log("vapiMenuInfoAdapter.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("vapiMenuInfoAdapter.test.ts failed:", err);
  process.exitCode = 1;
});
