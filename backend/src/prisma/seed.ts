import { prisma } from "./client";

// Trigger keys match docs/04_INTEGRATIONS_GUIDE.md "Automation triggers".
const AUTOMATION_TRIGGERS = [
  "reservation_request_received",
  "reservation_confirmed",
  "reservation_rejected",
  "reservation_cancelled",
  "reservation_reminder_before",
] as const;

const DEFAULT_CHANNEL = "sms";
const DEFAULT_LANGUAGE = "fr";

const DEFAULT_TABLES: Array<{ tableNumber: string; capacity: number; location?: string }> = [
  { tableNumber: "1", capacity: 2, location: "window" },
  { tableNumber: "2", capacity: 2, location: "window" },
  { tableNumber: "3", capacity: 4, location: "main" },
  { tableNumber: "4", capacity: 4, location: "main" },
  { tableNumber: "5", capacity: 6, location: "main" },
  { tableNumber: "6", capacity: 8, location: "private" },
];

const DEFAULT_TEMPLATES: Record<(typeof AUTOMATION_TRIGGERS)[number], string> = {
  reservation_request_received:
    "Hi {{customerName}}, we received your reservation request for {{partySize}} on {{reservationDate}} at {{reservationTime}}. We'll confirm shortly.",
  reservation_confirmed:
    "Hi {{customerName}}, your reservation for {{partySize}} on {{reservationDate}} at {{reservationTime}} is confirmed. See you soon!",
  reservation_rejected:
    "Hi {{customerName}}, unfortunately we can't accommodate your reservation request for {{reservationDate}} at {{reservationTime}}. Please call us to find another time.",
  reservation_cancelled:
    "Hi {{customerName}}, your reservation for {{reservationDate}} at {{reservationTime}} has been cancelled as requested.",
  reservation_reminder_before:
    "Hi {{customerName}}, this is a reminder of your reservation today at {{reservationTime}} for {{partySize}}. See you soon!",
};

async function main() {
  const organization = await prisma.organization.findFirst({
    where: { name: "Golden Meat Group" },
  });
  const organizationRecord =
    organization ??
    (await prisma.organization.create({
      data: { name: "Golden Meat Group", status: "active", plan: "starter" },
    }));

  const restaurant = await prisma.restaurant.upsert({
    where: { organizationId_slug: { organizationId: organizationRecord.id, slug: "golden-meat" } },
    update: {},
    create: {
      organizationId: organizationRecord.id,
      name: "Golden Meat",
      slug: "golden-meat",
      timezone: "Europe/Paris",
      defaultLanguage: DEFAULT_LANGUAGE,
      status: "active",
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@golden-meat.example" },
    update: {},
    create: {
      email: "owner@golden-meat.example",
      name: "Golden Meat Owner",
      status: "active",
    },
  });

  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: organizationRecord.id, userId: owner.id } },
    update: {},
    create: {
      organizationId: organizationRecord.id,
      userId: owner.id,
      role: "OWNER",
    },
  });

  await prisma.restaurantUser.upsert({
    where: { restaurantId_userId: { restaurantId: restaurant.id, userId: owner.id } },
    update: {},
    create: {
      restaurantId: restaurant.id,
      userId: owner.id,
      role: "OWNER",
      status: "active",
    },
  });

  for (const table of DEFAULT_TABLES) {
    await prisma.restaurantTable.upsert({
      where: { restaurantId_tableNumber: { restaurantId: restaurant.id, tableNumber: table.tableNumber } },
      update: {},
      create: {
        restaurantId: restaurant.id,
        tableNumber: table.tableNumber,
        capacity: table.capacity,
        location: table.location,
        isActive: true,
      },
    });
  }

  for (const triggerKey of AUTOMATION_TRIGGERS) {
    const templateKey = triggerKey;

    await prisma.messageTemplate.upsert({
      where: {
        restaurantId_channel_templateKey_language: {
          restaurantId: restaurant.id,
          channel: DEFAULT_CHANNEL,
          templateKey,
          language: DEFAULT_LANGUAGE,
        },
      },
      update: {},
      create: {
        restaurantId: restaurant.id,
        channel: DEFAULT_CHANNEL,
        templateKey,
        language: DEFAULT_LANGUAGE,
        body: DEFAULT_TEMPLATES[triggerKey],
        isActive: true,
      },
    });

    await prisma.automationRule.upsert({
      where: {
        restaurantId_triggerKey_channel_templateKey: {
          restaurantId: restaurant.id,
          triggerKey,
          channel: DEFAULT_CHANNEL,
          templateKey,
        },
      },
      update: {},
      create: {
        restaurantId: restaurant.id,
        triggerKey,
        channel: DEFAULT_CHANNEL,
        templateKey,
        isEnabled: false,
      },
    });
  }

  console.log(`Seed complete for restaurant "${restaurant.name}" (${restaurant.id}).`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
