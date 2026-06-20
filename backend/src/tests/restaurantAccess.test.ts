/**
 * restaurantAccess.test.ts — tenant isolation logic checks.
 *
 * Mirrors the algorithm in src/services/restaurantAccess.ts against an
 * in-memory fixture (no live Postgres needed), the same pattern the Dental
 * CRM project's multiBranchAccess.test.ts uses for pure-logic checks. Run a
 * real end-to-end login -> /api/restaurants/:id/ping check against a live
 * database (e.g. on the VPS) before trusting this in isolation.
 *
 * Run: npx tsx src/tests/restaurantAccess.test.ts
 *
 * Scenarios:
 *  - PLATFORM_ADMIN can access any restaurant, even with no org/restaurant rows.
 *  - OWNER/ORG_ADMIN org membership grants access to every restaurant in that org.
 *  - A STAFF user assigned to one restaurant cannot access a sibling restaurant
 *    in the same org just by guessing its id.
 *  - A user cannot access another organization's restaurant (cross-org).
 *  - An inactive RestaurantUser row grants no access.
 *  - validateRestaurantAccess rejects a missing/undefined restaurant id —
 *    there is no "default restaurant" fallback to trust.
 */
import assert from "node:assert/strict";

const PLATFORM_ADMIN = "PLATFORM_ADMIN";
const ORG_WIDE_ROLES = ["OWNER", "ORG_ADMIN"];

type Restaurant = { id: string; organizationId: string };
type OrgUser = { organizationId: string; userId: string; role: string };
type RestaurantUser = { restaurantId: string; userId: string; role: string; status: string };

interface Fixture {
  restaurants: Restaurant[];
  orgUsers: OrgUser[];
  restaurantUsers: RestaurantUser[];
}

type User = { id: string; globalRole: string | null };

function getAccessibleRestaurantIds(fixture: Fixture, user: User): string[] {
  if (user.globalRole === PLATFORM_ADMIN) {
    return fixture.restaurants.map((r) => r.id);
  }

  const orgIds = fixture.orgUsers
    .filter((m) => m.userId === user.id && ORG_WIDE_ROLES.includes(m.role))
    .map((m) => m.organizationId);

  const restaurantsViaOrg = fixture.restaurants.filter((r) => orgIds.includes(r.organizationId)).map((r) => r.id);
  const directIds = fixture.restaurantUsers
    .filter((m) => m.userId === user.id && m.status === "active")
    .map((m) => m.restaurantId);

  return Array.from(new Set([...restaurantsViaOrg, ...directIds]));
}

function resolveRestaurantRole(fixture: Fixture, user: User, restaurantId: string): string | null {
  if (user.globalRole === PLATFORM_ADMIN) return PLATFORM_ADMIN;

  const restaurant = fixture.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) return null;

  const orgMembership = fixture.orgUsers.find(
    (m) => m.organizationId === restaurant.organizationId && m.userId === user.id
  );
  if (orgMembership && ORG_WIDE_ROLES.includes(orgMembership.role)) return "OWNER";

  const restaurantMembership = fixture.restaurantUsers.find(
    (m) => m.restaurantId === restaurantId && m.userId === user.id
  );
  if (restaurantMembership && restaurantMembership.status === "active") return restaurantMembership.role;

  return null;
}

function validateRestaurantAccess(
  fixture: Fixture,
  user: User,
  requestedRestaurantId: string | undefined
): { restaurantId: string; role: string } | null {
  if (!requestedRestaurantId) return null;
  const role = resolveRestaurantRole(fixture, user, requestedRestaurantId);
  if (!role) return null;
  return { restaurantId: requestedRestaurantId, role };
}

async function main() {
  const fixture: Fixture = {
    restaurants: [
      { id: "rest-A1", organizationId: "org-A" },
      { id: "rest-A2", organizationId: "org-A" },
      { id: "rest-B1", organizationId: "org-B" },
    ],
    orgUsers: [{ organizationId: "org-A", userId: "owner-A", role: "OWNER" }],
    restaurantUsers: [
      { restaurantId: "rest-A1", userId: "staff-A1", role: "STAFF", status: "active" },
      { restaurantId: "rest-A1", userId: "former-staff-A1", role: "STAFF", status: "inactive" },
    ],
  };

  // PLATFORM_ADMIN sees every restaurant, no org/restaurant rows required.
  const admin: User = { id: "admin-1", globalRole: PLATFORM_ADMIN };
  assert.deepEqual(
    new Set(getAccessibleRestaurantIds(fixture, admin)),
    new Set(["rest-A1", "rest-A2", "rest-B1"]),
    "PLATFORM_ADMIN must see all restaurants"
  );
  assert.equal(resolveRestaurantRole(fixture, admin, "rest-B1"), PLATFORM_ADMIN);

  // Org owner gets OWNER on every restaurant in their org, including one
  // they have no direct RestaurantUser row for.
  const ownerA: User = { id: "owner-A", globalRole: null };
  assert.deepEqual(
    new Set(getAccessibleRestaurantIds(fixture, ownerA)),
    new Set(["rest-A1", "rest-A2"]),
    "org OWNER must see all restaurants in their org"
  );
  assert.equal(resolveRestaurantRole(fixture, ownerA, "rest-A2"), "OWNER");
  assert.equal(
    resolveRestaurantRole(fixture, ownerA, "rest-B1"),
    null,
    "org OWNER must not access another organization's restaurant"
  );

  // STAFF assigned to one restaurant cannot reach a sibling restaurant by
  // guessing its id, even within the same org.
  const staffA1: User = { id: "staff-A1", globalRole: null };
  assert.deepEqual(getAccessibleRestaurantIds(fixture, staffA1), ["rest-A1"]);
  assert.equal(resolveRestaurantRole(fixture, staffA1, "rest-A1"), "STAFF");
  assert.equal(
    resolveRestaurantRole(fixture, staffA1, "rest-A2"),
    null,
    "STAFF must not access a sibling restaurant they are not assigned to"
  );
  assert.equal(
    validateRestaurantAccess(fixture, staffA1, "rest-A2"),
    null,
    "validateRestaurantAccess must deny a restaurant id outside the user's access"
  );

  // Deactivated RestaurantUser rows grant no access.
  const formerStaff: User = { id: "former-staff-A1", globalRole: null };
  assert.equal(
    resolveRestaurantRole(fixture, formerStaff, "rest-A1"),
    null,
    "inactive RestaurantUser status must not grant access"
  );

  // No restaurant id supplied -> denied. There is no default-restaurant
  // fallback to trust (the Dental CRM lesson this project must not repeat).
  assert.equal(validateRestaurantAccess(fixture, staffA1, undefined), null);

  console.log("restaurantAccess.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("restaurantAccess.test.ts failed:", err);
  process.exitCode = 1;
});
