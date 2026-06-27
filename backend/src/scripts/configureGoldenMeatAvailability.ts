/**
 * configureGoldenMeatAvailability.ts — Phase 46D one-shot script.
 *
 * Updates the restaurant_settings row for Golden Meat with real
 * editable opening hours, party-size limits, and approval settings.
 * Safe to re-run: uses upsert with an explicit update object.
 *
 * Usage (run inside the sesli-agent-backend container):
 *   npx tsx src/scripts/configureGoldenMeatAvailability.ts
 *
 * Safety gates:
 *   - Only modifies restaurant_settings for the DEFAULT_RESTAURANT_SLUG.
 *   - Never touches reservations, customers, or calls tables.
 *   - Exits with code 1 if the restaurant row is not found.
 *   - Prints a summary of what was written (no secrets).
 */
import { prisma } from "../prisma/client";

const DEFAULT_RESTAURANT_SLUG = process.env.DEFAULT_RESTAURANT_SLUG ?? "golden-meat";

// Opening hours for Golden Meat (editable via backend-admin/availability after
// this initial configuration). Values are demo/reasonable defaults; the owner
// can refine them via the UI.
const OPENING_HOURS = {
  monday:    [{ start: "12:00", end: "14:30" }, { start: "19:00", end: "22:30" }],
  tuesday:   [{ start: "12:00", end: "14:30" }, { start: "19:00", end: "22:30" }],
  wednesday: [{ start: "12:00", end: "14:30" }, { start: "19:00", end: "22:30" }],
  thursday:  [{ start: "12:00", end: "14:30" }, { start: "19:00", end: "22:30" }],
  friday:    [{ start: "12:00", end: "14:30" }, { start: "19:00", end: "23:00" }],
  saturday:  [{ start: "12:00", end: "14:30" }, { start: "19:00", end: "23:00" }],
  sunday:    [{ start: "12:00", end: "14:30" }, { start: "19:00", end: "22:30" }],
};

async function main() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug: DEFAULT_RESTAURANT_SLUG },
    select: { id: true, name: true },
  });

  if (!restaurant) {
    console.error(`Restaurant not found for slug "${DEFAULT_RESTAURANT_SLUG}". Run prisma:seed first.`);
    process.exit(1);
  }

  console.log(`Configuring availability for restaurant: ${restaurant.name} (${restaurant.id})`);

  const result = await prisma.restaurantSettings.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      reservationsEnabled: true,
      openingHoursJson: OPENING_HOURS,
      slotIntervalMinutes: 90,
      defaultReservationDurationMinutes: 90,
      minAdvanceMinutes: 60,
      bookingWindowDays: 60,
      minPartySize: 1,
      maxPartySize: 12,
      maxReservationsPerSlot: null,
      manualApprovalThreshold: 8,
      autoConfirm: true,
    },
    create: {
      restaurantId: restaurant.id,
      reservationsEnabled: true,
      openingHoursJson: OPENING_HOURS,
      slotIntervalMinutes: 90,
      defaultReservationDurationMinutes: 90,
      minAdvanceMinutes: 60,
      bookingWindowDays: 60,
      minPartySize: 1,
      maxPartySize: 12,
      maxReservationsPerSlot: null,
      manualApprovalThreshold: 8,
      autoConfirm: true,
    },
  });

  console.log("restaurant_settings updated:");
  console.log("  reservationsEnabled:", result.reservationsEnabled);
  console.log("  slotIntervalMinutes:", result.slotIntervalMinutes);
  console.log("  minPartySize:", result.minPartySize);
  console.log("  maxPartySize:", result.maxPartySize);
  console.log("  manualApprovalThreshold:", result.manualApprovalThreshold);
  console.log("  autoConfirm:", result.autoConfirm);
  console.log("  openingHoursJson: configured for all 7 days");
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Script failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
