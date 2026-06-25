/**
 * vapiMenu.integration.test.ts — Phase 38 DB-backed checks for
 * POST /api/webhooks/vapi/:publicWebhookKey/get-menu-info and
 * POST /api/webhooks/vapi/:publicWebhookKey/get-item-details, against a
 * real Postgres database. Same convention as
 * vapiCancelReservationRequest.integration.test.ts: needs a live
 * DATABASE_URL, so it is NOT wired into `npm test` — run via:
 *
 *   npx tsx src/tests/vapiMenu.integration.test.ts
 *
 * If DATABASE_URL is unset or the database is unreachable, this script logs
 * a skip notice and exits 0 rather than failing the run.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";

const TEST_TAG = `vapimenu_${Date.now()}`;

// Same convention as vapiCancelReservationRequest.integration.test.ts — true
// secrets/internal-debug fields only. restaurantId/itemId/categoryId are
// legitimate ToolLog.responsePayload metadata (same pattern as
// reservationRequestId in the cancel route) and are checked separately,
// narrower, against the public Vapi *response* bodies below instead.
const SENSITIVE_FIELD_PATTERNS = [
  "passwordHash",
  "resetToken",
  "session",
  "refreshToken",
  "jwt",
  "JWT",
  "credentials",
  "credentialsEncrypted",
  "webhookVerifyTokenHash",
  "accessToken",
  "apiKey",
  "providerSecret",
  "clientSecret",
  "tokenValue",
  "rawPayload",
  "stateJson",
  "tableIds",
  "transcript",
  "fullTranscript",
];

/** Public Vapi response bodies must never include a raw DB id/relation-style key, even though ToolLog metadata legitimately can. */
function assertNoRawIdFields(body: unknown, label: string) {
  const hits = collectSensitiveKeyHits(body, ["restaurantId", "categoryId", "itemId", "createdAt", "updatedAt"]);
  assert.equal(hits.length, 0, `${label} response must not expose raw DB id/relation fields [${hits.join(", ")}]: ${JSON.stringify(body)}`);
}

function collectSensitiveKeyHits(value: unknown, patterns: string[], path = ""): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => hits.push(...collectSensitiveKeyHits(item, patterns, `${path}[${index}]`)));
    return hits;
  }
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const keyPath = path ? `${path}.${key}` : key;
      const lowerKey = key.toLowerCase();
      if (patterns.some((pattern) => lowerKey.includes(pattern.toLowerCase()))) {
        hits.push(keyPath);
      }
      hits.push(...collectSensitiveKeyHits(val, patterns, keyPath));
    }
  }
  return hits;
}

function assertNoSensitiveFields(body: unknown, label: string) {
  const hits = collectSensitiveKeyHits(body, SENSITIVE_FIELD_PATTERNS);
  assert.equal(
    hits.length,
    0,
    `${label} response must not contain sensitive/internal field name(s) [${hits.join(", ")}]: ${JSON.stringify(body)}`
  );
}

interface VapiMenuInfoBody {
  success?: boolean;
  message?: string;
  menu_available?: boolean;
  items_found?: boolean;
  category?: string;
  categories?: Array<{ name: string; description?: string }>;
  items?: Array<{ name: string; category?: string; description?: string; price?: string }>;
  results?: Array<{ toolCallId: string; result?: string; error?: string }>;
}

interface VapiItemDetailsBody {
  success?: boolean;
  message?: string;
  item_found?: boolean;
  ambiguous?: boolean;
  candidates?: Array<{ name: string; category?: string; price?: string }>;
  item?: { name: string; category?: string; price?: string; available?: boolean };
  missing_fields?: string[];
  results?: Array<{ toolCallId: string; result?: string; error?: string }>;
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("vapiMenu.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("vapiMenu.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
    return;
  }

  const organization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org`, status: "active" } });
  const restaurant = await prisma.restaurant.create({
    data: { organizationId: organization.id, name: `${TEST_TAG}_restaurant`, slug: `${TEST_TAG}-restaurant` },
  });
  const emptyMenuRestaurant = await prisma.restaurant.create({
    data: { organizationId: organization.id, name: `${TEST_TAG}_restaurant_empty`, slug: `${TEST_TAG}-restaurant-empty` },
  });

  const connection = await prisma.integrationConnection.create({
    data: { restaurantId: restaurant.id, channel: "vapi", provider: "vapi", status: "active", publicWebhookKey: `${TEST_TAG}_key` },
  });
  const inactiveConnection = await prisma.integrationConnection.create({
    data: { restaurantId: restaurant.id, channel: "vapi", provider: "vapi", status: "inactive", publicWebhookKey: `${TEST_TAG}_key_inactive` },
  });
  const emptyMenuConnection = await prisma.integrationConnection.create({
    data: {
      restaurantId: emptyMenuRestaurant.id,
      channel: "vapi",
      provider: "vapi",
      status: "active",
      publicWebhookKey: `${TEST_TAG}_key_empty`,
    },
  });

  const starters = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: `${TEST_TAG}-Starters`, sortOrder: 1 },
  });
  const mains = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: `${TEST_TAG}-Mains`, sortOrder: 2 },
  });
  const archivedCategory = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: `${TEST_TAG}-Archived`, status: "inactive", sortOrder: 3 },
  });

  const soup = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: starters.id,
      name: `${TEST_TAG} Tomato Soup`,
      description: "Hot tomato soup",
      priceCents: 850,
      currency: "EUR",
      allergensJson: ["gluten"],
      dietaryTagsJson: ["vegan"],
      aliasesJson: ["domates corbasi"],
    },
  });
  const steak = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: mains.id,
      name: `${TEST_TAG} Steak Frites`,
      priceCents: 2400,
      currency: "EUR",
    },
  });
  const steakTartare = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: mains.id,
      name: `${TEST_TAG} Steak Tartare`,
      priceCents: 2600,
      currency: "EUR",
    },
  });
  const unavailableItem = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: mains.id,
      name: `${TEST_TAG} Out Of Stock Fish`,
      priceCents: 1800,
      isAvailable: false,
    },
  });
  const inactiveItem = await prisma.menuItem.create({
    data: { restaurantId: restaurant.id, categoryId: mains.id, name: `${TEST_TAG} Discontinued Dish`, status: "inactive" },
  });
  void archivedCategory;
  void inactiveItem;

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/webhooks/vapi`;
  const menuInfoUrl = `${baseUrl}/${connection.publicWebhookKey}/get-menu-info`;
  const itemDetailsUrl = `${baseUrl}/${connection.publicWebhookKey}/get-item-details`;

  try {
    // 1. Unknown publicWebhookKey is rejected (both routes).
    const unknownMenuRes = await fetch(`${baseUrl}/${TEST_TAG}_no_such_key/get-menu-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(unknownMenuRes.status, 401, "unknown publicWebhookKey must be rejected for get-menu-info");

    const unknownItemRes = await fetch(`${baseUrl}/${TEST_TAG}_no_such_key/get-item-details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "Soup" }),
    });
    assert.equal(unknownItemRes.status, 401, "unknown publicWebhookKey must be rejected for get-item-details");

    // 2. Inactive IntegrationConnection is rejected (both routes).
    const inactiveMenuRes = await fetch(`${baseUrl}/${inactiveConnection.publicWebhookKey}/get-menu-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(inactiveMenuRes.status, 401, "inactive IntegrationConnection must be rejected for get-menu-info");

    const inactiveItemRes = await fetch(`${baseUrl}/${inactiveConnection.publicWebhookKey}/get-item-details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "Soup" }),
    });
    assert.equal(inactiveItemRes.status, 401, "inactive IntegrationConnection must be rejected for get-item-details");

    // 3. get-menu-info with empty menu -> safe menu_available:false, HTTP 200.
    const emptyMenuRes = await fetch(`${baseUrl}/${emptyMenuConnection.publicWebhookKey}/get-menu-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(emptyMenuRes.status, 200);
    const emptyMenuBody = await readJson<VapiMenuInfoBody>(emptyMenuRes);
    assert.equal(emptyMenuBody.success, true);
    assert.equal(emptyMenuBody.menu_available, false);

    // 4. get-menu-info with no filters -> general summary, only active/available items, HTTP 200 + success field.
    const summaryRes = await fetch(menuInfoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(summaryRes.status, 200);
    const summaryBody = await readJson<VapiMenuInfoBody>(summaryRes);
    assert.equal(summaryBody.success, true);
    assert.equal(summaryBody.menu_available, true);
    const summaryNames = summaryBody.items?.map((i) => i.name) ?? [];
    assert.ok(summaryNames.includes(soup.name), "summary must include the available soup item");
    assert.ok(!summaryNames.includes(unavailableItem.name), "summary must never include an unavailable item");
    assert.ok(!summaryNames.includes(inactiveItem.name), "summary must never include an inactive item");
    const summaryCategoryNames = summaryBody.categories?.map((c) => c.name) ?? [];
    assert.ok(!summaryCategoryNames.includes(archivedCategory.name), "summary must never include an inactive category");

    // 5. get-menu-info category filter.
    const categoryRes = await fetch(menuInfoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: mains.name }),
    });
    const categoryBody = await readJson<VapiMenuInfoBody>(categoryRes);
    assert.equal(categoryBody.success, true);
    assert.equal(categoryBody.items_found, true);
    const categoryItemNames = categoryBody.items?.map((i) => i.name) ?? [];
    assert.ok(categoryItemNames.includes(steak.name));
    assert.ok(!categoryItemNames.includes(soup.name), "category filter must exclude items from other categories");
    assert.ok(!categoryItemNames.includes(unavailableItem.name));

    // 6. get-menu-info search filter.
    const searchRes = await fetch(menuInfoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search: "Tomato Soup" }),
    });
    const searchBody = await readJson<VapiMenuInfoBody>(searchRes);
    assert.equal(searchBody.items_found, true);
    assert.ok(searchBody.items?.some((i) => i.name === soup.name));

    // 7. get-menu-info no matching items -> items_found:false, never a 500.
    const noMatchRes = await fetch(menuInfoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search: `${TEST_TAG}_nonexistent_dish_xyz` }),
    });
    assert.equal(noMatchRes.status, 200);
    const noMatchBody = await readJson<VapiMenuInfoBody>(noMatchRes);
    assert.equal(noMatchBody.success, true);
    assert.equal(noMatchBody.items_found, false);

    // 8. get-menu-info respects limit/bounding.
    const boundedRes = await fetch(menuInfoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: mains.name, limit: 1 }),
    });
    const boundedBody = await readJson<VapiMenuInfoBody>(boundedRes);
    assert.equal(boundedBody.items?.length, 1, "limit must bound the number of items returned");

    // 9. get-menu-info no raw/sensitive fields leak.
    assertNoSensitiveFields(summaryBody, "get-menu-info summary");
    assertNoSensitiveFields(categoryBody, "get-menu-info category filter");
    assertNoRawIdFields(summaryBody, "get-menu-info summary");
    assertNoRawIdFields(categoryBody, "get-menu-info category filter");

    // --- get-item-details ---------------------------------------------------

    // 10. Missing item identifier -> success:false + missing_fields, HTTP 200.
    const missingRes = await fetch(itemDetailsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(missingRes.status, 200, "missing fields must never surface as a 500");
    const missingBody = await readJson<VapiItemDetailsBody>(missingRes);
    assert.equal(missingBody.success, false);
    assert.deepEqual(missingBody.missing_fields, ["item_identifier"]);

    // 11. Exact name match.
    const exactRes = await fetch(itemDetailsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: soup.name }),
    });
    const exactBody = await readJson<VapiItemDetailsBody>(exactRes);
    assert.equal(exactBody.success, true);
    assert.equal(exactBody.item_found, true);
    assert.equal(exactBody.item?.name, soup.name);
    assert.equal(exactBody.item?.price, "8.50 EUR");
    assert.equal(exactBody.item?.available, true);

    // 12. Alias match.
    const aliasRes = await fetch(itemDetailsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "domates corbasi" }),
    });
    const aliasBody = await readJson<VapiItemDetailsBody>(aliasRes);
    assert.equal(aliasBody.item_found, true);
    assert.equal(aliasBody.item?.name, soup.name);

    // 13. Ambiguous search returns candidates, never picks randomly.
    const ambiguousRes = await fetch(itemDetailsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: `${TEST_TAG} Steak` }),
    });
    const ambiguousBody = await readJson<VapiItemDetailsBody>(ambiguousRes);
    assert.equal(ambiguousBody.success, true);
    assert.equal(ambiguousBody.item_found, false);
    assert.equal(ambiguousBody.ambiguous, true);
    const ambiguousNames = ambiguousBody.candidates?.map((c) => c.name) ?? [];
    assert.ok(ambiguousNames.includes(steak.name));
    assert.ok(ambiguousNames.includes(steakTartare.name));

    // 14. Not found -> safe response, HTTP 200.
    const notFoundRes = await fetch(itemDetailsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: `${TEST_TAG}_no_such_item_xyz` }),
    });
    assert.equal(notFoundRes.status, 200);
    const notFoundBody = await readJson<VapiItemDetailsBody>(notFoundRes);
    assert.equal(notFoundBody.success, true);
    assert.equal(notFoundBody.item_found, false);
    assert.ok(!notFoundBody.ambiguous);

    // 15. Unavailable item is found but never presented as available.
    const unavailableRes = await fetch(itemDetailsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: unavailableItem.name }),
    });
    const unavailableBody = await readJson<VapiItemDetailsBody>(unavailableRes);
    assert.equal(unavailableBody.item_found, true);
    assert.equal(unavailableBody.item?.available, false);
    assert.ok(!/^.*\bis available\b/i.test(unavailableBody.message ?? ""), "must never claim an unavailable item is available");

    // 16. Inactive item is treated as not found (same as the old routes' single "not found" outcome).
    const inactiveItemLookupRes = await fetch(itemDetailsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: inactiveItem.name }),
    });
    const inactiveItemLookupBody = await readJson<VapiItemDetailsBody>(inactiveItemLookupRes);
    assert.equal(inactiveItemLookupBody.item_found, false);

    // 17. itemId lookup, scoped to restaurant + active.
    const idRes = await fetch(itemDetailsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: steak.id }),
    });
    const idBody = await readJson<VapiItemDetailsBody>(idRes);
    assert.equal(idBody.item_found, true);
    assert.equal(idBody.item?.name, steak.name);

    // 18. priceCents/currency formats correctly (also covered by step 11; explicit re-check for steak).
    const steakDetailsRes = await fetch(itemDetailsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: steak.id }),
    });
    const steakDetailsBody = await readJson<VapiItemDetailsBody>(steakDetailsRes);
    assert.equal(steakDetailsBody.item?.price, "24.00 EUR");

    // 19. Nested Vapi tool-call payload -> results[] envelope, inner JSON has success:true; JSON-string arguments parsed.
    const nestedRes = await fetch(itemDetailsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          call: { id: `${TEST_TAG}_call_nested` },
          toolCalls: [
            {
              id: "tc-menu-1",
              function: { arguments: JSON.stringify({ item_name: soup.name }) },
            },
          ],
        },
      }),
    });
    assert.equal(nestedRes.status, 200);
    const nestedEnvelope = await readJson<VapiItemDetailsBody>(nestedRes);
    assert.ok(nestedEnvelope.results?.[0]?.result, "nested tool-call payload must be wrapped in the results[] envelope");
    const nestedBody = JSON.parse(nestedEnvelope.results![0].result!) as VapiItemDetailsBody;
    assert.equal(nestedBody.success, true);
    assert.equal(nestedBody.item_found, true);
    assertNoSensitiveFields(nestedEnvelope, "nested tool-call get-item-details");

    // 20. ToolLog success/failure status works.
    const successToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurant.id, toolName: "get_item_details", status: "success" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(successToolLog, "a success ToolLog row must exist for get_item_details");
    assertNoSensitiveFields(successToolLog!.responsePayload, "ToolLog.responsePayload (get_item_details)");

    const failureToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurant.id, toolName: "get_item_details", status: "failure" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(failureToolLog, "a failure ToolLog row must exist for the missing-identifier call");

    const menuInfoToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurant.id, toolName: "get_menu_info", status: "success" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(menuInfoToolLog, "a success ToolLog row must exist for get_menu_info");
    assertNoSensitiveFields(menuInfoToolLog!.responsePayload, "ToolLog.responsePayload (get_menu_info)");

    // 21. No raw/sensitive/internal fields in any response collected above.
    assertNoSensitiveFields(exactBody, "get-item-details exact match");
    assertNoSensitiveFields(aliasBody, "get-item-details alias match");
    assertNoSensitiveFields(ambiguousBody, "get-item-details ambiguous match");
    assertNoSensitiveFields(unavailableBody, "get-item-details unavailable item");
    assertNoSensitiveFields(idBody, "get-item-details itemId lookup");
    assertNoRawIdFields(exactBody, "get-item-details exact match");
    assertNoRawIdFields(aliasBody, "get-item-details alias match");
    assertNoRawIdFields(ambiguousBody, "get-item-details ambiguous match");
    assertNoRawIdFields(unavailableBody, "get-item-details unavailable item");
    assertNoRawIdFields(idBody, "get-item-details itemId lookup");

    console.log("vapiMenu.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.toolLog.deleteMany({ where: { restaurantId: { in: [restaurant.id, emptyMenuRestaurant.id] } } });
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: [restaurant.id, emptyMenuRestaurant.id] } } });
    await prisma.menuCategory.deleteMany({ where: { restaurantId: { in: [restaurant.id, emptyMenuRestaurant.id] } } });
    await prisma.integrationConnection.deleteMany({
      where: { id: { in: [connection.id, inactiveConnection.id, emptyMenuConnection.id] } },
    });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, emptyMenuRestaurant.id] } } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("vapiMenu.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
