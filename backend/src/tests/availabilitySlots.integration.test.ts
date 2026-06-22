/**
 * availabilitySlots.integration.test.ts — end-to-end checks for the Phase 25
 * GET /api/restaurants/:restaurantId/availability/slots endpoint against a
 * real Postgres database.
 *
 * Needs a live DATABASE_URL and is NOT wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/availabilitySlots.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { signAuthToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";

const TEST_TAG = `slotstest_${Date.now()}`;

// Restaurant uses UTC so the test's date math never depends on the host
// machine's local timezone or DST.
function toLocalDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("availabilitySlots.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("availabilitySlots.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
    return;
  }

  const organization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org`, status: "active" } });
  const restaurant = await prisma.restaurant.create({
    data: {
      organizationId: organization.id,
      name: `${TEST_TAG}_restaurant`,
      slug: `${TEST_TAG}-restaurant`,
      timezone: "UTC",
      status: "active",
    },
  });
  const otherOrganization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org_2`, status: "active" } });
  const otherRestaurant = await prisma.restaurant.create({
    data: { organizationId: otherOrganization.id, name: `${TEST_TAG}_restaurant_2`, slug: `${TEST_TAG}-restaurant-2` },
  });

  const passwordHash = await hashPassword("Test1234!");
  const owner = await prisma.user.create({ data: { email: `${TEST_TAG}_owner@example.com`, passwordHash, status: "active" } });
  const outsider = await prisma.user.create({ data: { email: `${TEST_TAG}_outsider@example.com`, passwordHash, status: "active" } });

  await prisma.restaurantUser.create({ data: { restaurantId: restaurant.id, userId: owner.id, role: "OWNER", status: "active" } });
  await prisma.restaurantUser.create({ data: { restaurantId: otherRestaurant.id, userId: outsider.id, role: "OWNER", status: "active" } });

  const ownerToken = signAuthToken({ sub: owner.id });
  const outsiderToken = signAuthToken({ sub: outsider.id });

  await prisma.restaurantSettings.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      reservationsEnabled: true,
      openingHoursJson: {
        monday: [{ start: "09:00", end: "23:00" }],
        tuesday: [{ start: "09:00", end: "23:00" }],
        wednesday: [{ start: "09:00", end: "23:00" }],
        thursday: [{ start: "09:00", end: "23:00" }],
        friday: [{ start: "09:00", end: "23:00" }],
        saturday: [{ start: "09:00", end: "23:00" }],
        sunday: [{ start: "09:00", end: "23:00" }],
      },
      slotIntervalMinutes: 60,
      defaultReservationDurationMinutes: 60,
      minAdvanceMinutes: 60,
      bookingWindowDays: 30,
      minPartySize: 1,
      maxPartySize: 10,
      maxReservationsPerSlot: null,
    },
    create: {
      restaurantId: restaurant.id,
      reservationsEnabled: true,
      openingHoursJson: {
        monday: [{ start: "09:00", end: "23:00" }],
        tuesday: [{ start: "09:00", end: "23:00" }],
        wednesday: [{ start: "09:00", end: "23:00" }],
        thursday: [{ start: "09:00", end: "23:00" }],
        friday: [{ start: "09:00", end: "23:00" }],
        saturday: [{ start: "09:00", end: "23:00" }],
        sunday: [{ start: "09:00", end: "23:00" }],
      },
      slotIntervalMinutes: 60,
      defaultReservationDurationMinutes: 60,
      minAdvanceMinutes: 60,
      bookingWindowDays: 30,
      minPartySize: 1,
      maxPartySize: 10,
    },
  });

  const tableSmall = await prisma.restaurantTable.create({
    data: { restaurantId: restaurant.id, tableNumber: `${TEST_TAG}-A`, capacity: 2, isActive: true },
  });
  const tableLarge = await prisma.restaurantTable.create({
    data: { restaurantId: restaurant.id, tableNumber: `${TEST_TAG}-B`, capacity: 6, isActive: true },
  });
  const tableInactive = await prisma.restaurantTable.create({
    data: { restaurantId: restaurant.id, tableNumber: `${TEST_TAG}-C`, capacity: 4, isActive: false },
  });

  const testDate = toLocalDate(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
  const blackoutFullDayDate = toLocalDate(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));
  const blackoutPartialDate = toLocalDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const reservation = await prisma.reservation.create({
    data: {
      restaurantId: restaurant.id,
      sourceChannel: "manual",
      reservationDate: new Date(`${testDate}T00:00:00.000Z`),
      reservationTime: "12:00",
      partySize: 2,
      status: "confirmed",
      assignedTableId: tableSmall.id,
    },
  });
  const cancelledReservation = await prisma.reservation.create({
    data: {
      restaurantId: restaurant.id,
      sourceChannel: "manual",
      reservationDate: new Date(`${testDate}T00:00:00.000Z`),
      reservationTime: "13:00",
      partySize: 2,
      status: "cancelled",
      assignedTableId: tableLarge.id,
    },
  });

  const inactiveBlackout = await prisma.blackoutDate.create({
    data: { restaurantId: restaurant.id, localDate: testDate, isFullDay: true, status: "inactive" },
  });
  const fullDayBlackout = await prisma.blackoutDate.create({
    data: { restaurantId: restaurant.id, localDate: blackoutFullDayDate, isFullDay: true, status: "active" },
  });
  const partialBlackout = await prisma.blackoutDate.create({
    data: {
      restaurantId: restaurant.id,
      localDate: blackoutPartialDate,
      isFullDay: false,
      startsAtLocal: "18:00",
      endsAtLocal: "19:00",
      status: "active",
    },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/restaurants`;
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  type SlotsResponse = {
    restaurantId: string;
    localDate: string;
    partySize: number;
    timezone: string;
    durationMinutes: number;
    slotIntervalMinutes: number;
    availableSlots: Array<{ time: string; available: boolean; availableTableIds: string[]; capacity: number; reason?: string }>;
    warnings: string[];
    blockedReason?: string;
    preferredTime?: { time: string; available: boolean };
  };

  const getSlots = async (
    token: string,
    restaurantId: string,
    params: Record<string, string>
  ): Promise<{ status: number; body: SlotsResponse; text: string }> => {
    const search = new URLSearchParams(params).toString();
    const res = await fetch(`${baseUrl}/${restaurantId}/availability/slots?${search}`, { headers: authed(token) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, text };
  };

  try {
    // 1. Missing/invalid token -> 401.
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/availability/slots?date=${testDate}&partySize=2`);
    assert.equal(noAuthRes.status, 401, "missing bearer token must be rejected with 401");
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/availability/slots?date=${testDate}&partySize=2`, {
      headers: authed("not-a-real-token"),
    });
    assert.equal(badAuthRes.status, 401, "invalid bearer token must be rejected with 401");

    // 2. Cross-tenant restaurant -> 403.
    const crossTenant = await getSlots(ownerToken, otherRestaurant.id, { date: testDate, partySize: "2" });
    assert.equal(crossTenant.status, 403);

    // 3. Invalid date / time -> 400.
    const badDate = await getSlots(ownerToken, restaurant.id, { date: "22-06-2026", partySize: "2" });
    assert.equal(badDate.status, 400, "invalid date format must be rejected");
    const badTime = await getSlots(ownerToken, restaurant.id, { date: testDate, partySize: "2", preferredTime: "99:99" });
    assert.equal(badTime.status, 400, "invalid preferredTime format must be rejected");
    const badPartySize = await getSlots(ownerToken, restaurant.id, { date: testDate, partySize: "0" });
    assert.equal(badPartySize.status, 400, "partySize below schema minimum must be rejected");

    // 4. Opening hours generate correct HH:mm slots; last slot cannot overrun closing time.
    const normal = await getSlots(ownerToken, restaurant.id, { date: testDate, partySize: "2" });
    assert.equal(normal.status, 200);
    assert.ok(!normal.text.includes("passwordHash"), "response must never include passwordHash");
    assert.ok(!normal.text.includes("credentialsEncrypted"), "response must never include credentialsEncrypted");
    assert.ok(!normal.text.includes("rawPayload"), "response must never include rawPayload");
    const times = normal.body.availableSlots.map((s) => s.time);
    assert.equal(times[0], "09:00");
    assert.equal(times[times.length - 1], "22:00", "a 60-minute slot cannot start at 22:30 and end after 23:00 closing");
    assert.ok(!times.includes("23:00"));

    // 5. Assigned existing reservation blocks that table for the overlapping slot;
    //    non-overlapping reservation (13:00, cancelled) does not block 14:00.
    const slot12 = normal.body.availableSlots.find((s) => s.time === "12:00")!;
    assert.ok(slot12.available, "table B still fits party size 2 even though table A is reserved at 12:00");
    assert.ok(!slot12.availableTableIds.includes(tableSmall.id), "reserved table A must not be offered at 12:00");
    assert.ok(slot12.availableTableIds.includes(tableLarge.id));

    const slot14 = normal.body.availableSlots.find((s) => s.time === "14:00")!;
    assert.ok(slot14.available);
    assert.ok(slot14.availableTableIds.includes(tableSmall.id), "non-overlapping reservation must not block an unrelated slot");

    // 6. Inactive table ignored; capacity filters by party size.
    const largeParty = await getSlots(ownerToken, restaurant.id, { date: testDate, partySize: "8" });
    assert.equal(largeParty.status, 200);
    assert.ok(
      largeParty.body.availableSlots.every((s) => !s.available && s.reason === "no_capacity"),
      "party of 8 exceeds every table's capacity (max active table capacity is 6)"
    );
    assert.ok(
      largeParty.body.availableSlots.every((s) => !s.availableTableIds.includes(tableInactive.id)),
      "inactive table must never be offered"
    );

    // 7. partySize above the schema's hard cap -> 400; partySize above the
    //    restaurant's configured maxPartySize but within the schema cap is a
    //    valid query, just blocked by business rules (200 + blockedReason).
    const tooBig = await getSlots(ownerToken, restaurant.id, { date: testDate, partySize: "101" });
    assert.equal(tooBig.status, 400, "partySize above the schema's hard cap (100) must be rejected");

    const overMax = await getSlots(ownerToken, restaurant.id, { date: testDate, partySize: "11" });
    assert.equal(overMax.status, 200);
    assert.equal(overMax.body.blockedReason, "party_size_out_of_range");

    // 8. preferredTime included in the response.
    const withPreferred = await getSlots(ownerToken, restaurant.id, { date: testDate, partySize: "2", preferredTime: "12:00" });
    assert.equal(withPreferred.body.preferredTime?.time, "12:00");
    assert.equal(withPreferred.body.preferredTime?.available, true);

    // 9. Full-day blackout blocks the entire date; inactive blackout (testDate) does not block.
    void inactiveBlackout;
    const fullDay = await getSlots(ownerToken, restaurant.id, { date: blackoutFullDayDate, partySize: "2" });
    assert.equal(fullDay.body.blockedReason, "blackout_full_day");
    assert.equal(fullDay.body.availableSlots.length, 0);

    // 10. Partial blackout blocks only the overlapping slot.
    const partialDay = await getSlots(ownerToken, restaurant.id, { date: blackoutPartialDate, partySize: "2" });
    assert.equal(partialDay.status, 200);
    const blockedSlot = partialDay.body.availableSlots.find((s) => s.time === "18:00")!;
    assert.equal(blockedSlot.available, false);
    assert.equal(blockedSlot.reason, "blackout");
    const unaffectedSlot = partialDay.body.availableSlots.find((s) => s.time === "20:00")!;
    assert.equal(unaffectedSlot.available, true);

    // 11. maxReservationsPerSlot blocks after the limit, counting unassigned reservations too.
    await prisma.restaurantSettings.update({ where: { restaurantId: restaurant.id }, data: { maxReservationsPerSlot: 1 } });
    const overLimit = await getSlots(ownerToken, restaurant.id, { date: testDate, partySize: "2" });
    const slot12Limited = overLimit.body.availableSlots.find((s) => s.time === "12:00")!;
    assert.equal(slot12Limited.available, false, "one confirmed reservation already meets maxReservationsPerSlot=1");
    assert.equal(slot12Limited.reason, "max_reservations_per_slot");
    await prisma.restaurantSettings.update({ where: { restaurantId: restaurant.id }, data: { maxReservationsPerSlot: null } });

    // 12. reservationsEnabled=false blocks everything.
    await prisma.restaurantSettings.update({ where: { restaurantId: restaurant.id }, data: { reservationsEnabled: false } });
    const disabled = await getSlots(ownerToken, restaurant.id, { date: testDate, partySize: "2" });
    assert.equal(disabled.body.blockedReason, "reservations_disabled");
    await prisma.restaurantSettings.update({ where: { restaurantId: restaurant.id }, data: { reservationsEnabled: true } });

    // 13. No opening hours configured -> warning + blockedReason, no slots.
    await prisma.restaurantSettings.update({ where: { restaurantId: restaurant.id }, data: { openingHoursJson: Prisma.JsonNull } });
    const noHours = await getSlots(ownerToken, restaurant.id, { date: testDate, partySize: "2" });
    assert.equal(noHours.body.blockedReason, "opening_hours_not_configured");
    assert.equal(noHours.body.availableSlots.length, 0);
    assert.ok(noHours.body.warnings.some((w) => w.includes("opening hours")));

    // 14. Outsider (no access to this restaurant) is rejected.
    const noAccess = await getSlots(outsiderToken, restaurant.id, { date: testDate, partySize: "2" });
    assert.equal(noAccess.status, 403);

    void reservation;
    void cancelledReservation;
    void partialBlackout;
    void fullDayBlackout;

    console.log("availabilitySlots.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.reservation.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.blackoutDate.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurantTable.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurantSettings.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, outsider.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organization.id, otherOrganization.id] } } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("availabilitySlots.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
