/**
 * vapiCheckAvailability.integration.test.ts — end-to-end checks for
 * POST /api/webhooks/vapi/:publicWebhookKey/check-availability
 * against a real Postgres database.
 *
 * Needs a live DATABASE_URL and is NOT wired into `npm test` (like the other
 * DB-backed Vapi/availability integration tests). Run explicitly:
 *
 *   npx tsx src/tests/vapiCheckAvailability.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 *
 * Scenarios covered:
 *  - invalid publicWebhookKey rejected with 401, no ToolLog written
 *  - valid simple date/partySize payload -> success:true
 *  - preferredTime available -> available:true
 *  - preferredTime unavailable -> available:false + suggested_times
 *  - missing date -> success:false + missing_fields
 *  - missing partySize -> success:false + missing_fields
 *  - invalid date format handled safely (success:false, no 500)
 *  - Vapi nested tool-call payload parsed correctly
 *  - no opening hours configured -> success:true, available:false, blocked_reason
 *  - full-day blackout -> available:false
 *  - partial blackout affects only the overlapping preferredTime
 *  - response never includes internal/sensitive fields
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import { createApp } from "../app";
import { prisma } from "../prisma/client";

const TEST_TAG = `vapiavail_${Date.now()}`;

interface VapiCheckAvailabilityBody {
  success?: boolean;
  available?: boolean;
  message?: string;
  missing_fields?: string[];
  blocked_reason?: string;
  available_slots?: string[];
  suggested_times?: string[];
  date?: string;
  time?: string;
  partySize?: number;
  error?: string;
}

const SENSITIVE_FIELD_NAMES = [
  "passwordHash",
  "resetToken",
  "session",
  "refreshToken",
  "jwt",
  "JWT",
  "credentials",
  "credentialsEncrypted",
  "webhookVerifyTokenHash",
  "accessToken",
  "apiKey",
  "providerSecret",
  "clientSecret",
  "tokenValue",
  "rawPayload",
  "stateJson",
  "availableTableIds",
  "tableIds",
];

function assertNoSensitiveFields(text: string, label: string): void {
  for (const field of SENSITIVE_FIELD_NAMES) {
    assert.ok(!text.includes(field), `${label} response must never include "${field}"`);
  }
}

async function readJson(res: Response): Promise<VapiCheckAvailabilityBody> {
  return (await res.json()) as VapiCheckAvailabilityBody;
}

function toLocalDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("vapiCheckAvailability.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("vapiCheckAvailability.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
    return;
  }

  const organization = await prisma.organization.create({
    data: { name: `${TEST_TAG}_org`, status: "active" },
  });
  const restaurant = await prisma.restaurant.create({
    data: {
      organizationId: organization.id,
      name: `${TEST_TAG}_restaurant`,
      slug: `${TEST_TAG}-restaurant`,
      timezone: "UTC",
      status: "active",
    },
  });
  const connection = await prisma.integrationConnection.create({
    data: {
      restaurantId: restaurant.id,
      channel: "vapi",
      provider: "vapi",
      status: "active",
      publicWebhookKey: `${TEST_TAG}_key`,
    },
  });

  await prisma.restaurantSettings.create({
    data: {
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

  const table = await prisma.restaurantTable.create({
    data: { restaurantId: restaurant.id, tableNumber: `${TEST_TAG}-A`, capacity: 4, isActive: true },
  });

  const testDate = toLocalDate(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
  const blackoutFullDayDate = toLocalDate(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));
  const blackoutPartialDate = toLocalDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

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
  const baseUrl = `http://127.0.0.1:${port}/api/webhooks/vapi`;
  const path = `${baseUrl}/${connection.publicWebhookKey}/check-availability`;

  const post = (body: unknown) =>
    fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  try {
    // 1. Unknown publicWebhookKey -> 401, no ToolLog written under any restaurant.
    const unknownRes = await fetch(`${baseUrl}/${TEST_TAG}_does_not_exist/check-availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: testDate, partySize: 2 }),
    });
    assert.equal(unknownRes.status, 401, "unknown webhook key must return a controlled 401, never a 500");
    const unknownBody = await readJson(unknownRes);
    assert.equal(unknownBody.error, "Unknown or inactive webhook key");

    // 2. Valid simple payload -> success:true.
    const validRes = await post({ date: testDate, partySize: 2 });
    assert.equal(validRes.status, 200);
    const validText = await validRes.clone().text();
    const validBody = await readJson(validRes);
    assert.equal(validBody.success, true, "valid date/partySize payload must return success:true");
    assertNoSensitiveFields(validText, "valid payload");

    const toolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurant.id, toolName: "check_availability" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(toolLog, "ToolLog must be created for check-availability");
    assert.equal(toolLog!.status, "success");

    // 3. preferredTime available -> available:true.
    const availableRes = await post({ date: testDate, time: "12:00", partySize: 2 });
    const availableBody = await readJson(availableRes);
    assert.equal(availableRes.status, 200);
    assert.equal(availableBody.available, true, "12:00 must be available with no conflicting reservations/blackouts");

    // 4. preferredTime unavailable (full-day blackout date, no slots at all) -> available:false + suggested_times.
    const blockedRes = await post({ date: blackoutFullDayDate, time: "19:00", partySize: 2 });
    const blockedBody = await readJson(blockedRes);
    assert.equal(blockedRes.status, 200);
    assert.equal(blockedBody.success, true);
    assert.equal(blockedBody.available, false);
    assert.equal(blockedBody.blocked_reason, "blackout_full_day");

    // 5. Partial blackout blocks only the overlapping preferredTime.
    const partialBlockedRes = await post({ date: blackoutPartialDate, time: "18:00", partySize: 2 });
    const partialBlockedBody = await readJson(partialBlockedRes);
    assert.equal(partialBlockedBody.available, false, "18:00 overlaps the 18:00-19:00 partial blackout");
    assert.ok(
      Array.isArray(partialBlockedBody.suggested_times) && partialBlockedBody.suggested_times.length > 0,
      "unavailable preferredTime with other open slots must include suggested_times"
    );

    const partialUnaffectedRes = await post({ date: blackoutPartialDate, time: "20:00", partySize: 2 });
    const partialUnaffectedBody = await readJson(partialUnaffectedRes);
    assert.equal(partialUnaffectedBody.available, true, "20:00 is outside the partial blackout window");

    // 6. Missing date -> success:false + missing_fields.
    const missingDateRes = await post({ partySize: 2 });
    const missingDateBody = await readJson(missingDateRes);
    assert.equal(missingDateRes.status, 200);
    assert.equal(missingDateBody.success, false);
    assert.ok(missingDateBody.missing_fields?.includes("date"));

    // 7. Missing partySize -> success:false + missing_fields.
    const missingPartySizeRes = await post({ date: testDate });
    const missingPartySizeBody = await readJson(missingPartySizeRes);
    assert.equal(missingPartySizeRes.status, 200);
    assert.equal(missingPartySizeBody.success, false);
    assert.ok(missingPartySizeBody.missing_fields?.includes("party_size"));

    // 8. Invalid date format handled safely -> success:false, never a 500.
    const invalidDateRes = await post({ date: "not-a-date", partySize: 2 });
    const invalidDateBody = await readJson(invalidDateRes);
    assert.equal(invalidDateRes.status, 200, "unparseable date must never crash with a 500");
    assert.equal(invalidDateBody.success, false);
    assert.ok(invalidDateBody.missing_fields?.includes("date"));

    // 9. Vapi nested tool-call payload parsed correctly.
    const nestedRes = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          toolCalls: [
            {
              id: "tool-call-1",
              function: {
                name: "check_availability",
                arguments: JSON.stringify({ date: testDate, time: "12:00", partySize: 2 }),
              },
            },
          ],
        },
      }),
    });
    assert.equal(nestedRes.status, 200);
    const nestedBody = (await nestedRes.json()) as { results?: Array<{ toolCallId: string; result?: string }> };
    assert.ok(nestedBody.results?.[0]?.result, "tool-call envelope must be wrapped in the results[] shape");
    const nestedResult = JSON.parse(nestedBody.results![0].result!) as VapiCheckAvailabilityBody;
    assert.equal(nestedResult.available, true);

    // 10. No opening hours configured -> success:true, available:false, blocked_reason set.
    await prisma.restaurantSettings.update({
      where: { restaurantId: restaurant.id },
      data: { openingHoursJson: Prisma.JsonNull },
    });
    const noHoursRes = await post({ date: testDate, partySize: 2 });
    const noHoursBody = await readJson(noHoursRes);
    assert.equal(noHoursBody.success, true);
    assert.equal(noHoursBody.available, false);
    assert.equal(noHoursBody.blocked_reason, "opening_hours_not_configured");

    console.log("vapiCheckAvailability.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.toolLog.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.blackoutDate.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurantTable.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurantSettings.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.integrationConnection.deleteMany({ where: { id: connection.id } });
    await prisma.restaurant.deleteMany({ where: { id: restaurant.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
    void table;
    void fullDayBlackout;
    void partialBlackout;
  }
}

main().catch(async (err) => {
  console.error("vapiCheckAvailability.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
