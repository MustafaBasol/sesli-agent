import type { Organization, Restaurant } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { UpdateRestaurantSettingsInput } from "../schemas/restaurantSettings";

// Safe organization summary: never includes anything beyond these fields.
function toOrganizationSummary(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    status: org.status,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  };
}

// Safe restaurant settings shape. Restaurant has no website/description/
// city/country/currency/openingHours/reservation-defaults columns yet, so
// only fields that actually exist on the model are exposed (see AGENTS.md
// Phase 18 — never invent frontend-only settings that cannot persist).
function toSettings(restaurant: Restaurant, organization: Organization) {
  return {
    id: restaurant.id,
    organizationId: restaurant.organizationId,
    name: restaurant.name,
    slug: restaurant.slug,
    status: restaurant.status,
    phone: restaurant.phone,
    email: restaurant.email,
    address: restaurant.address,
    timezone: restaurant.timezone,
    defaultLanguage: restaurant.defaultLanguage,
    createdAt: restaurant.createdAt,
    updatedAt: restaurant.updatedAt,
    organization: toOrganizationSummary(organization),
  };
}

export async function getRestaurantSettings(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: { organization: true },
  });
  if (!restaurant) return null;

  return toSettings(restaurant, restaurant.organization);
}

export async function updateRestaurantSettings(restaurantId: string, patch: UpdateRestaurantSettingsInput) {
  const updated = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.defaultLanguage !== undefined ? { defaultLanguage: patch.defaultLanguage } : {}),
    },
    include: { organization: true },
  });

  return toSettings(updated, updated.organization);
}
