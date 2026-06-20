import { prisma } from "../prisma/client";

export const PLATFORM_ADMIN = "PLATFORM_ADMIN";

// Roles that an OrganizationUser row grants across every restaurant in that
// organization. Mirrors the Dental CRM canAccessAllClinics concept, but
// resolved per-organization instead of as a single boolean on the user.
const ORG_WIDE_ROLES = ["OWNER", "ORG_ADMIN"];

export interface AuthUser {
  id: string;
  globalRole: string | null;
}

/**
 * Restaurant ids a user may act on, derived entirely from the database:
 * org-wide roles (OrganizationUser.role in OWNER/ORG_ADMIN) plus direct,
 * active RestaurantUser assignments. Never trust a token-supplied list.
 */
export async function getAccessibleRestaurantIds(user: AuthUser): Promise<string[]> {
  if (user.globalRole === PLATFORM_ADMIN) {
    const all = await prisma.restaurant.findMany({ select: { id: true } });
    return all.map((r) => r.id);
  }

  const [orgMemberships, restaurantMemberships] = await Promise.all([
    prisma.organizationUser.findMany({
      where: { userId: user.id, role: { in: ORG_WIDE_ROLES } },
      select: { organizationId: true },
    }),
    prisma.restaurantUser.findMany({
      where: { userId: user.id, status: "active" },
      select: { restaurantId: true },
    }),
  ]);

  const orgIds = orgMemberships.map((m) => m.organizationId);
  const restaurantsViaOrg = orgIds.length
    ? await prisma.restaurant.findMany({
        where: { organizationId: { in: orgIds } },
        select: { id: true },
      })
    : [];

  const ids = new Set<string>([
    ...restaurantsViaOrg.map((r) => r.id),
    ...restaurantMemberships.map((m) => m.restaurantId),
  ]);
  return Array.from(ids);
}

/**
 * Effective role for a specific restaurant: PLATFORM_ADMIN for global
 * admins, the org-wide role's restaurant-equivalent (treated as OWNER) for
 * org owners/admins, otherwise the direct RestaurantUser.role, or null if
 * the user has no access at all.
 */
export async function resolveRestaurantRole(
  user: AuthUser,
  restaurantId: string
): Promise<string | null> {
  if (user.globalRole === PLATFORM_ADMIN) {
    return PLATFORM_ADMIN;
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { organizationId: true },
  });
  if (!restaurant) return null;

  const orgMembership = await prisma.organizationUser.findUnique({
    where: { organizationId_userId: { organizationId: restaurant.organizationId, userId: user.id } },
    select: { role: true },
  });
  if (orgMembership && ORG_WIDE_ROLES.includes(orgMembership.role)) {
    return "OWNER";
  }

  const restaurantMembership = await prisma.restaurantUser.findUnique({
    where: { restaurantId_userId: { restaurantId, userId: user.id } },
    select: { role: true, status: true },
  });
  if (restaurantMembership && restaurantMembership.status === "active") {
    return restaurantMembership.role;
  }

  return null;
}

/**
 * Verifies the requested restaurant id is one the user can access and
 * returns the resolved role, or null if access must be denied (caller
 * should respond 403). The candidate id is never trusted on its own —
 * both checks hit the database directly.
 */
export async function validateRestaurantAccess(
  user: AuthUser,
  requestedRestaurantId: string | undefined
): Promise<{ restaurantId: string; role: string } | null> {
  if (!requestedRestaurantId) return null;

  const role = await resolveRestaurantRole(user, requestedRestaurantId);
  if (!role) return null;

  return { restaurantId: requestedRestaurantId, role };
}
