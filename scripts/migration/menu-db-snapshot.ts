/**
 * menu-db-snapshot.ts — Phase 43 read-only DB snapshot helper.
 *
 * Reads current MenuCategory + MenuItem rows for a target restaurant and
 * writes a timestamped JSON backup + markdown summary to
 * scripts/migration/output/. This script NEVER mutates any database row.
 *
 * Required env vars:
 *   DATABASE_URL              — backend PostgreSQL connection string
 *   MENU_IMPORT_RESTAURANT_ID — target restaurant uuid
 *
 * Usage:
 *   npm run migration:menu:snapshot
 *   DATABASE_URL=... MENU_IMPORT_RESTAURANT_ID=... npx tsx scripts/migration/menu-db-snapshot.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

// --- Pure snapshot builder (exported for testing without a real DB) ---

export type SnapshotCategoryRow = {
  id: string;
  name: string;
  normalizedName: string;
  description: string | null;
  sortOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SnapshotItemRow = {
  id: string;
  name: string;
  normalizedName: string;
  categoryId: string | null;
  description: string | null;
  priceCents: number | null;
  currency: string;
  isAvailable: boolean;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MenuDbSnapshot = {
  snapshotAt: string;
  restaurantId: string;
  categories: SnapshotCategoryRow[];
  items: SnapshotItemRow[];
  counts: {
    categories: number;
    items: number;
    activeCategories: number;
    inactiveCategories: number;
    activeItems: number;
    inactiveItems: number;
    availableItems: number;
    unavailableItems: number;
  };
};

function normalizeMenuName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildSnapshotReport(
  restaurantId: string,
  rawCategories: Array<{
    id: string;
    name: string;
    description: string | null;
    sortOrder: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
  rawItems: Array<{
    id: string;
    name: string;
    categoryId: string | null;
    description: string | null;
    priceCents: number | null;
    currency: string;
    isAvailable: boolean;
    status: string;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>
): MenuDbSnapshot {
  const categories: SnapshotCategoryRow[] = rawCategories.map((c) => ({
    id: c.id,
    name: c.name,
    normalizedName: normalizeMenuName(c.name),
    description: c.description,
    sortOrder: c.sortOrder,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  const items: SnapshotItemRow[] = rawItems.map((i) => ({
    id: i.id,
    name: i.name,
    normalizedName: normalizeMenuName(i.name),
    categoryId: i.categoryId,
    description: i.description,
    priceCents: i.priceCents,
    currency: i.currency,
    isAvailable: i.isAvailable,
    status: i.status,
    sortOrder: i.sortOrder,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));

  return {
    snapshotAt: new Date().toISOString(),
    restaurantId,
    categories,
    items,
    counts: {
      categories: categories.length,
      items: items.length,
      activeCategories: categories.filter((c) => c.status === "active").length,
      inactiveCategories: categories.filter((c) => c.status !== "active").length,
      activeItems: items.filter((i) => i.status === "active").length,
      inactiveItems: items.filter((i) => i.status !== "active").length,
      availableItems: items.filter((i) => i.isAvailable).length,
      unavailableItems: items.filter((i) => !i.isAvailable).length,
    },
  };
}

export function buildSnapshotMarkdown(snapshot: MenuDbSnapshot): string {
  const lines: string[] = [];

  lines.push("# Menu DB Snapshot");
  lines.push("");
  lines.push(`- Snapshot at: ${snapshot.snapshotAt}`);
  lines.push(`- Restaurant ID: \`${snapshot.restaurantId}\``);
  lines.push(`- Categories: ${snapshot.counts.categories} (${snapshot.counts.activeCategories} active, ${snapshot.counts.inactiveCategories} inactive)`);
  lines.push(`- Items: ${snapshot.counts.items} (${snapshot.counts.activeItems} active, ${snapshot.counts.inactiveItems} inactive; ${snapshot.counts.availableItems} available, ${snapshot.counts.unavailableItems} unavailable)`);
  lines.push("");

  lines.push("## Categories");
  lines.push("");
  if (snapshot.categories.length === 0) {
    lines.push("- (none)");
  } else {
    // Show per-category item counts.
    const itemCountByCategory = new Map<string, number>();
    for (const item of snapshot.items) {
      const key = item.categoryId ?? "null";
      itemCountByCategory.set(key, (itemCountByCategory.get(key) ?? 0) + 1);
    }
    for (const cat of snapshot.categories) {
      const itemCount = itemCountByCategory.get(cat.id) ?? 0;
      lines.push(`- **${cat.name}** (${cat.status}, ${itemCount} items, sortOrder=${cat.sortOrder})`);
    }
  }
  lines.push("");

  lines.push("## Items (first 50)");
  lines.push("");
  const categoryNameById = new Map<string, string>();
  for (const cat of snapshot.categories) {
    categoryNameById.set(cat.id, cat.name);
  }
  const shownItems = snapshot.items.slice(0, 50);
  if (shownItems.length === 0) {
    lines.push("- (none)");
  } else {
    for (const item of shownItems) {
      const catName = item.categoryId ? (categoryNameById.get(item.categoryId) ?? item.categoryId) : "uncategorized";
      const price = item.priceCents !== null ? `${(item.priceCents / 100).toFixed(2)} ${item.currency}` : "no price";
      lines.push(`- **${item.name}** [${catName}] ${price} — ${item.status}${item.isAvailable ? "" : ", unavailable"}`);
    }
    if (snapshot.items.length > 50) {
      lines.push(`- ...and ${snapshot.items.length - 50} more (see JSON snapshot)`);
    }
  }
  lines.push("");
  lines.push("_This is a read-only snapshot. No data was modified._");
  lines.push("");

  return lines.join("\n");
}

// --- Script entry point (runs against real DB) ---

async function main() {
  const restaurantId = process.env.MENU_IMPORT_RESTAURANT_ID;
  const databaseUrl = process.env.DATABASE_URL;

  if (!restaurantId) {
    console.error("MENU_IMPORT_RESTAURANT_ID is required");
    process.exit(1);
  }
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const { prisma } = await import("../../backend/src/prisma/client");

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("Database unreachable:", (err as Error).message);
    await prisma.$disconnect();
    process.exit(1);
  }

  const [rawCategories, rawItems] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.menuItem.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        categoryId: true,
        description: true,
        priceCents: true,
        currency: true,
        isAvailable: true,
        status: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  await prisma.$disconnect();

  const snapshot = buildSnapshotReport(restaurantId, rawCategories, rawItems);

  const outputDir = path.join(process.cwd(), "scripts/migration/output");
  fs.mkdirSync(outputDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const jsonPath = path.join(outputDir, `menu-db-snapshot-${ts}.json`);
  const mdPath = path.join(outputDir, `menu-db-snapshot-${ts}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2), "utf-8");
  fs.writeFileSync(mdPath, buildSnapshotMarkdown(snapshot), "utf-8");

  console.log(JSON.stringify(snapshot.counts, null, 2));
  console.log(`\nSnapshot written to: ${jsonPath}`);
  console.log(`Markdown summary written to: ${mdPath}`);
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error("menu-db-snapshot.ts failed:", err);
    process.exitCode = 1;
  });
}
