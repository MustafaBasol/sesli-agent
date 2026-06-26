/**
 * menu-db-snapshot.test.ts — Phase 43 unit tests for the menu DB snapshot
 * helper. Uses pure functions only — no database required.
 *
 * Run: npx tsx scripts/migration/menu-db-snapshot.test.ts
 *      npm run test:menu-db-snapshot
 */
import assert from "node:assert/strict";
import { buildSnapshotReport, buildSnapshotMarkdown } from "./menu-db-snapshot";

function makeDate(iso: string): Date {
  return new Date(iso);
}

const sampleCategories = [
  { id: "cat-1", name: "Starters", description: "First courses", sortOrder: 1, status: "active", createdAt: makeDate("2025-01-01T00:00:00Z"), updatedAt: makeDate("2025-01-01T00:00:00Z") },
  { id: "cat-2", name: "Mains", description: null, sortOrder: 2, status: "active", createdAt: makeDate("2025-01-01T00:00:00Z"), updatedAt: makeDate("2025-01-01T00:00:00Z") },
  { id: "cat-3", name: "Old Demo Cat", description: null, sortOrder: 99, status: "inactive", createdAt: makeDate("2025-01-01T00:00:00Z"), updatedAt: makeDate("2025-01-01T00:00:00Z") },
];

const sampleItems = [
  { id: "item-1", name: "Hummus", categoryId: "cat-1", description: "Chickpea dip", priceCents: 850, currency: "EUR", isAvailable: true, status: "active", sortOrder: 1, createdAt: makeDate("2025-01-01T00:00:00Z"), updatedAt: makeDate("2025-01-01T00:00:00Z") },
  { id: "item-2", name: "Steak", categoryId: "cat-2", description: null, priceCents: 2500, currency: "EUR", isAvailable: false, status: "inactive", sortOrder: 1, createdAt: makeDate("2025-01-01T00:00:00Z"), updatedAt: makeDate("2025-01-01T00:00:00Z") },
  { id: "item-3", name: "Old Demo Item", categoryId: null, description: null, priceCents: null, currency: "EUR", isAvailable: false, status: "inactive", sortOrder: 99, createdAt: makeDate("2025-01-01T00:00:00Z"), updatedAt: makeDate("2025-01-01T00:00:00Z") },
];

async function main() {
  // Basic output shape.
  {
    const snapshot = buildSnapshotReport("rest-1", sampleCategories, sampleItems);
    assert.equal(snapshot.restaurantId, "rest-1");
    assert.ok(typeof snapshot.snapshotAt === "string");
    assert.equal(snapshot.categories.length, 3);
    assert.equal(snapshot.items.length, 3);
  }

  // Counts computed correctly.
  {
    const snapshot = buildSnapshotReport("rest-1", sampleCategories, sampleItems);
    assert.equal(snapshot.counts.categories, 3);
    assert.equal(snapshot.counts.items, 3);
    assert.equal(snapshot.counts.activeCategories, 2);
    assert.equal(snapshot.counts.inactiveCategories, 1);
    assert.equal(snapshot.counts.activeItems, 1);
    assert.equal(snapshot.counts.inactiveItems, 2);
    assert.equal(snapshot.counts.availableItems, 1);
    assert.equal(snapshot.counts.unavailableItems, 2);
  }

  // NormalizedName is derived from name.
  {
    const snapshot = buildSnapshotReport("rest-1", sampleCategories, sampleItems);
    assert.equal(snapshot.categories[0].normalizedName, "starters");
    assert.equal(snapshot.items[0].normalizedName, "hummus");
  }

  // Timestamps are ISO strings.
  {
    const snapshot = buildSnapshotReport("rest-1", sampleCategories, sampleItems);
    assert.ok(snapshot.categories[0].createdAt.includes("T"));
    assert.ok(snapshot.items[0].updatedAt.includes("T"));
  }

  // Empty DB produces valid zero-count snapshot.
  {
    const snapshot = buildSnapshotReport("rest-empty", [], []);
    assert.equal(snapshot.counts.categories, 0);
    assert.equal(snapshot.counts.items, 0);
    assert.equal(snapshot.counts.activeCategories, 0);
    assert.equal(snapshot.counts.inactiveCategories, 0);
  }

  // Markdown contains expected headers and content.
  {
    const snapshot = buildSnapshotReport("rest-1", sampleCategories, sampleItems);
    const md = buildSnapshotMarkdown(snapshot);
    assert.ok(md.includes("# Menu DB Snapshot"));
    assert.ok(md.includes("rest-1"));
    assert.ok(md.includes("Starters"));
    assert.ok(md.includes("Hummus"));
    assert.ok(md.includes("read-only snapshot"));
  }

  // Markdown shows correct category item counts.
  {
    const snapshot = buildSnapshotReport("rest-1", sampleCategories, sampleItems);
    const md = buildSnapshotMarkdown(snapshot);
    // "Starters" has 1 item, "Mains" has 1 item.
    assert.ok(md.includes("1 items") || md.includes("1 item"));
  }

  // Markdown truncates items list at 50 (tested with a large set).
  {
    const manyItems = Array.from({ length: 60 }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
      categoryId: null,
      description: null,
      priceCents: null,
      currency: "EUR",
      isAvailable: true,
      status: "active",
      sortOrder: i,
      createdAt: makeDate("2025-01-01T00:00:00Z"),
      updatedAt: makeDate("2025-01-01T00:00:00Z"),
    }));
    const snapshot = buildSnapshotReport("rest-1", [], manyItems);
    const md = buildSnapshotMarkdown(snapshot);
    assert.ok(md.includes("10 more"));
  }

  console.log("menu-db-snapshot.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("menu-db-snapshot.test.ts failed:", err);
  process.exitCode = 1;
});
