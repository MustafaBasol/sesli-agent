/**
 * conversationQuery.test.ts — pure-logic checks for the Phase 6 conversation
 * list filtering rules.
 *
 * Run: npx tsx src/tests/conversationQuery.test.ts
 */
import assert from "node:assert/strict";
import { buildConversationListWhere } from "../services/conversationQuery";

async function main() {
  // Always pins restaurantId, regardless of filters.
  const baseWhere = buildConversationListWhere("rest-1", {});
  assert.deepEqual(baseWhere, { restaurantId: "rest-1" });

  const channelProviderWhere = buildConversationListWhere("rest-1", { channel: "whatsapp", provider: "meta_cloud" });
  assert.equal(channelProviderWhere.channel, "whatsapp");
  assert.equal(channelProviderWhere.provider, "meta_cloud");

  const customerWhere = buildConversationListWhere("rest-1", { customerId: "cust-1" });
  assert.equal(customerWhere.customerId, "cust-1");

  const statusWhere = buildConversationListWhere("rest-1", { status: "open" });
  assert.equal(statusWhere.status, "open");

  const searchWhere = buildConversationListWhere("rest-1", { search: "Ada" });
  assert.ok(Array.isArray(searchWhere.OR) && searchWhere.OR.length === 3, "search must OR across name/phone/thread fields");

  console.log("conversationQuery.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("conversationQuery.test.ts failed:", err);
  process.exitCode = 1;
});
