/**
 * menu-test-db-preview.ts — Phase 42 read-only preview of imported menu data.
 *
 * Connects only to DATABASE_URL and prints MenuCategory/MenuItem counts,
 * the category list with per-category item counts, and a few sample items
 * per category for MENU_IMPORT_RESTAURANT_ID. Never writes, updates, or
 * deletes anything.
 *
 * Intended for a VPS/test database after a Phase 40/41 write-mode import —
 * never point DATABASE_URL at production or at live Supabase.
 *
 * Run:
 *   MENU_IMPORT_RESTAURANT_ID=<id> DATABASE_URL=<test-db-url> \
 *     npx tsx scripts/migration/menu-test-db-preview.ts
 *
 * Policy reference: docs/menu-data-migration-plan.md
 */
import { prisma } from "../../backend/src/prisma/client";

const SAMPLE_ITEMS_PER_CATEGORY = 3;

function printUsageAndExit(message: string): never {
  console.log(
    [
      "menu-test-db-preview.ts — read-only preview, never writes to the database.",
      "",
      message,
      "",
      "Usage:",
      "  MENU_IMPORT_RESTAURANT_ID=<restaurant-id> DATABASE_URL=<test-db-url> npx tsx scripts/migration/menu-test-db-preview.ts",
    ].join("\n")
  );
  process.exit(1);
}

async function main() {
  const restaurantId = process.env.MENU_IMPORT_RESTAURANT_ID;
  if (!restaurantId || !restaurantId.trim()) {
    printUsageAndExit("MENU_IMPORT_RESTAURANT_ID is required — this script never guesses a target restaurant.");
  }
  if (!process.env.DATABASE_URL) {
    printUsageAndExit("DATABASE_URL is required — this script never assumes a default database.");
  }

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId },
    orderBy: { sortOrder: "asc" },
  });
  const totalItems = await prisma.menuItem.count({ where: { restaurantId } });

  console.log(`Restaurant: ${restaurantId}`);
  console.log(`Categories: ${categories.length}`);
  console.log(`Items: ${totalItems}`);
  console.log("");

  for (const category of categories) {
    const items = await prisma.menuItem.findMany({
      where: { restaurantId, categoryId: category.id },
      orderBy: { sortOrder: "asc" },
      take: SAMPLE_ITEMS_PER_CATEGORY,
    });
    const itemCount = await prisma.menuItem.count({ where: { restaurantId, categoryId: category.id } });

    console.log(`- ${category.name} (${category.status}) — ${itemCount} item(s)`);
    for (const item of items) {
      const price = item.priceCents !== null ? `${(item.priceCents / 100).toFixed(2)} ${item.currency}` : "no price";
      console.log(`    · ${item.name} — ${price} — ${item.isAvailable ? "available" : "unavailable"}`);
    }
  }

  const uncategorizedCount = await prisma.menuItem.count({ where: { restaurantId, categoryId: null } });
  if (uncategorizedCount > 0) {
    console.log(`\nUncategorized items: ${uncategorizedCount}`);
  }
}

main()
  .catch((err) => {
    console.error("menu-test-db-preview.ts failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
