import { prisma } from "../prisma/client";
import type { AddTeamMemberInput, ListTeamQuery, UpdateTeamMemberInput } from "../schemas/team";
import { PLATFORM_ADMIN } from "./restaurantAccess";

// Thrown for role-safety/business-rule violations the route layer maps to a
// specific HTTP status, distinct from validation (400) and not-found (404).
export class TeamActionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MANAGE_ROLES = ["OWNER", "MANAGER"];

// Never select passwordHash or any auth/session field here — this is the
// single allowlist every team response is built from.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  status: true,
  globalRole: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function loadOrganizationRoles(
  organizationId: string,
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.organizationUser.findMany({
    where: { organizationId, userId: { in: userIds } },
    select: { userId: true, role: true },
  });
  return new Map(rows.map((r) => [r.userId, r.role]));
}

function toListItem(
  membership: {
    userId: string;
    role: string;
    status: string;
    createdAt: Date;
    user: { id: string; email: string; name: string | null; status: string; createdAt: Date; updatedAt: Date };
  },
  organizationRole: string | undefined
) {
  return {
    userId: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
    userStatus: membership.user.status,
    organizationRole: organizationRole ?? null,
    restaurantRole: membership.role,
    membershipStatus: membership.status,
    accessSource: "restaurant" as const,
    // RestaurantUser only tracks createdAt (no updatedAt column); the
    // user's own updatedAt reflects their safe profile fields, not the
    // membership row.
    joinedAt: membership.createdAt,
    updatedAt: membership.user.updatedAt,
  };
}

export async function listTeamMembers(restaurantId: string, query: ListTeamQuery) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { organizationId: true },
  });
  if (!restaurant) {
    return { data: [], pagination: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 1 } };
  }

  const where = {
    restaurantId,
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          user: {
            OR: [
              { email: { contains: query.search, mode: "insensitive" as const } },
              { name: { contains: query.search, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.restaurantUser.count({ where }),
    prisma.restaurantUser.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        userId: true,
        role: true,
        status: true,
        createdAt: true,
        user: { select: SAFE_USER_SELECT },
      },
    }),
  ]);

  const orgRoles = await loadOrganizationRoles(
    restaurant.organizationId,
    rows.map((r) => r.userId)
  );

  return {
    data: rows.map((row) => toListItem(row, orgRoles.get(row.userId))),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

/**
 * Looks up a restaurant membership scoped to restaurantId. Returns null for
 * both "no such membership" and "belongs to another restaurant" so callers
 * can respond 404 without distinguishing the two cases to a probing request.
 */
export async function findMembershipForRestaurant(restaurantId: string, userId: string) {
  return prisma.restaurantUser.findFirst({
    where: { restaurantId, userId },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      createdAt: true,
      user: { select: SAFE_USER_SELECT },
    },
  });
}

export async function getTeamMemberDetail(restaurantId: string, userId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { organizationId: true },
  });
  if (!restaurant) return null;

  const membership = await findMembershipForRestaurant(restaurantId, userId);
  if (!membership) return null;

  const orgRoles = await loadOrganizationRoles(restaurant.organizationId, [userId]);

  return {
    userId: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
    userStatus: membership.user.status,
    organizationRole: orgRoles.get(userId) ?? null,
    restaurantId,
    restaurantRole: membership.role,
    membershipStatus: membership.status,
    joinedAt: membership.createdAt,
    updatedAt: membership.user.updatedAt,
  };
}

async function countActiveOwners(restaurantId: string, excludeUserId?: string): Promise<number> {
  return prisma.restaurantUser.count({
    where: {
      restaurantId,
      role: "OWNER",
      status: "active",
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
  });
}

export async function addTeamMember(
  restaurantId: string,
  actingRole: string,
  input: AddTeamMemberInput
) {
  if (!MANAGE_ROLES.includes(actingRole) && actingRole !== PLATFORM_ADMIN) {
    throw new TeamActionError(403, "Insufficient permissions to add team members");
  }
  // MANAGER may only bring in STAFF-level members; role escalation is OWNER-only.
  if (actingRole === "MANAGER" && input.restaurantRole !== "STAFF") {
    throw new TeamActionError(403, "Managers may only add staff-level members");
  }

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new TeamActionError(
      404,
      "No existing user found with this email. Inviting new users will be added in a later phase."
    );
  }

  const existing = await prisma.restaurantUser.findUnique({
    where: { restaurantId_userId: { restaurantId, userId: user.id } },
  });
  if (existing) {
    throw new TeamActionError(409, "This user is already a member of this restaurant");
  }

  const created = await prisma.restaurantUser.create({
    data: { restaurantId, userId: user.id, role: input.restaurantRole, status: "active" },
    select: {
      userId: true,
      role: true,
      status: true,
      createdAt: true,
      user: { select: SAFE_USER_SELECT },
    },
  });

  return toListItem(created, undefined);
}

export async function updateTeamMember(
  restaurantId: string,
  actingRole: string,
  targetUserId: string,
  patch: UpdateTeamMemberInput
) {
  if (!MANAGE_ROLES.includes(actingRole) && actingRole !== PLATFORM_ADMIN) {
    throw new TeamActionError(403, "Insufficient permissions to manage team members");
  }

  const target = await findMembershipForRestaurant(restaurantId, targetUserId);
  if (!target) {
    throw new TeamActionError(404, "Team member not found");
  }

  // Managers may only manage staff-level members, and may never assign a
  // role above MANAGER (OWNER is owner-only territory).
  if (actingRole === "MANAGER") {
    if (target.role !== "STAFF") {
      throw new TeamActionError(403, "Managers may only manage staff-level members");
    }
    if (patch.restaurantRole && patch.restaurantRole === "OWNER") {
      throw new TeamActionError(403, "Managers may not assign the owner role");
    }
  }

  const willDemote = patch.restaurantRole !== undefined && patch.restaurantRole !== "OWNER";
  const willDeactivate = patch.membershipStatus === "inactive";
  if (target.role === "OWNER" && target.status === "active" && (willDemote || willDeactivate)) {
    const remainingOwners = await countActiveOwners(restaurantId, targetUserId);
    if (remainingOwners === 0) {
      throw new TeamActionError(409, "Cannot remove the last owner of this restaurant");
    }
  }

  const updated = await prisma.restaurantUser.update({
    where: { restaurantId_userId: { restaurantId, userId: targetUserId } },
    data: {
      ...(patch.restaurantRole !== undefined ? { role: patch.restaurantRole } : {}),
      ...(patch.membershipStatus !== undefined ? { status: patch.membershipStatus } : {}),
    },
    select: {
      userId: true,
      role: true,
      status: true,
      createdAt: true,
      user: { select: SAFE_USER_SELECT },
    },
  });

  return toListItem(updated, undefined);
}

export async function removeTeamMember(restaurantId: string, actingRole: string, targetUserId: string) {
  if (!MANAGE_ROLES.includes(actingRole) && actingRole !== PLATFORM_ADMIN) {
    throw new TeamActionError(403, "Insufficient permissions to remove team members");
  }

  const target = await findMembershipForRestaurant(restaurantId, targetUserId);
  if (!target) {
    throw new TeamActionError(404, "Team member not found");
  }

  if (actingRole === "MANAGER" && target.role !== "STAFF") {
    throw new TeamActionError(403, "Managers may only remove staff-level members");
  }

  if (target.role === "OWNER" && target.status === "active") {
    const remainingOwners = await countActiveOwners(restaurantId, targetUserId);
    if (remainingOwners === 0) {
      throw new TeamActionError(409, "Cannot remove the last owner of this restaurant");
    }
  }

  // Soft-deactivate only: the restaurant membership row (and the global User
  // record) is never deleted.
  const updated = await prisma.restaurantUser.update({
    where: { restaurantId_userId: { restaurantId, userId: targetUserId } },
    data: { status: "inactive" },
    select: {
      userId: true,
      role: true,
      status: true,
      createdAt: true,
      user: { select: SAFE_USER_SELECT },
    },
  });

  return toListItem(updated, undefined);
}
