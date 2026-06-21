/**
 * customerQuery.test.ts — pure-logic checks for the Phase 6 customer list
 * filtering rules.
 *
 * Run: npx tsx src/tests/customerQuery.test.ts
 */
import assert from "node:assert/strict";
import { buildCustomerListWhere } from "../services/customerQuery";

async function main() {
  // Always pins restaurantId, regardless of filters.
  const baseWhere = buildCustomerListWhere("rest-1", {});
  assert.deepEqual(baseWhere, { restaurantId: "rest-1" });

  const searchWhere = buildCustomerListWhere("rest-1", { search: "Ada" });
  assert.equal(searchWhere.restaurantId, "rest-1");
  assert.ok(Array.isArray(searchWhere.OR) && searchWhere.OR.length === 4, "search must OR across name/phone/email fields");

  console.log("customerQuery.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("customerQuery.test.ts failed:", err);
  process.exitCode = 1;
});
