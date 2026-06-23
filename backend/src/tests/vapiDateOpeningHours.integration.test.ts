/**
 * vapiDateOpeningHours.integration.test.ts — Phase 30 DB-backed checks for
 * POST /api/webhooks/vapi/:publicWebhookKey/get-current-date and
 * POST /api/webhooks/vapi/:publicWebhookKey/get-opening-hours, against a
 * real Postgres database. Same convention as
 * vapiCustomerProfile.integration.test.ts: needs a live DATABASE_URL, so it
 * is NOT wired into `npm test` — run via:
 *
 *   npx tsx src/tests/vapiDateOpeningHours.integration.test.ts
 *
 * If DATABASE_URL is unset or the database is unreachable, this script logs
 * a skip notice and exits 0 rather than failing the run.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";

const TEST_TAG = `vapidate_${Date.now()}`;

const SENSITIVE_FIELD_PATTERNS = [
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

function assertNoSensitiveFields(body: unknown, label: string) {
  const json = JSON.stringify(body);
  for (const pattern of SENSITIVE_FIELD_PATTERNS) {
    assert.ok(!json.includes(pattern), `${label} response must not contain "${pattern}": ${json}`);
  }
}

interface VapiCurrentDateBody {
  success?: boolean;
  message?: string;
  timezone?: string;
  current_date?: string;
  current_time?: string;
  day_of_week?: string;
  iso_datetime?: string;
  results?: Array<{ toolCallId: string; result?: string; error?: string }>;
}

interface VapiOpeningHoursBody {
  success?: boolean;
  message?: string;
  timezone?: string;
  configured?: boolean;
  date?: string;
  day_of_week?: string;
  is_open?: boolean;
  opening_periods?: Array<{ opens: string; closes: string }>;
  weekly_hours?: unknown;
  closed_reason?: string;
  results?: Array<{ toolCallId: string; result?: string; error?: string }>;
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("vapiDateOpeningHours.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log(
      "vapiDateOpeningHours.integration.test.ts: SKIPPED (database unreachable):",
      (err as Error).message
    );
    return;
  }

  const organization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org`, status: "active" } });
  const restaurant = await prisma.restaurant.create({
    data: {
      organizationId: organization.id,
      name: `${TEST_TAG}_restaurant`,
      slug: `${TEST_TAG}-restaurant`,
      timezone: "America/New_York",
      defaultLanguage: "tr",
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
  const inactiveConnection = await prisma.integrationConnection.create({
    data: {
      restaurantId: restaurant.id,
      channel: "vapi",
      provider: "vapi",
      status: "inactive",
      publicWebhookKey: `${TEST_TAG}_key_inactive`,
    },
  });

  const inactiveOrganization = await prisma.organization.create({
    data: { name: `${TEST_TAG}_org_inactive_restaurant`, status: "active" },
  });
  const inactiveRestaurant = await prisma.restaurant.create({
    data: {
      organizationId: inactiveOrganization.id,
      name: `${TEST_TAG}_inactive_restaurant`,
      slug: `${TEST_TAG}-inactive-restaurant`,
      status: "inactive",
    },
  });
  const inactiveRestaurantConnection = await prisma.integrationConnection.create({
    data: {
      restaurantId: inactiveRestaurant.id,
      channel: "vapi",
      provider: "vapi",
      status: "active",
      publicWebhookKey: `${TEST_TAG}_key_inactive_restaurant`,
    },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/webhooks/vapi`;
  const currentDateUrl = `${baseUrl}/${connection.publicWebhookKey}/get-current-date`;
  const openingHoursUrl = `${baseUrl}/${connection.publicWebhookKey}/get-opening-hours`;

  try {
    // 1. Unknown publicWebhookKey is rejected.
    const unknownRes = await fetch(`${baseUrl}/${TEST_TAG}_no_such_key/get-current-date`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(unknownRes.status, 401, "unknown publicWebhookKey must be rejected");

    // 2. Inactive IntegrationConnection is rejected.
    const inactiveRes = await fetch(`${baseUrl}/${inactiveConnection.publicWebhookKey}/get-current-date`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(inactiveRes.status, 401, "inactive IntegrationConnection must be rejected like an unknown key");

    // 3. get-current-date returns 200, success:true, and uses the restaurant
    //    timezone (America/New_York), not the server's timezone.
    const currentDateRes = await fetch(currentDateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const currentDateBody = await readJson<VapiCurrentDateBody>(currentDateRes);
    assert.equal(currentDateRes.status, 200);
    assert.equal(currentDateBody.success, true);
    assert.equal(currentDateBody.timezone, "America/New_York");
    assert.match(currentDateBody.current_date ?? "", /^\d{4}-\d{2}-\d{2}$/);
    assert.match(currentDateBody.current_time ?? "", /^\d{2}:\d{2}$/);
    assert.ok(currentDateBody.day_of_week);
    assert.ok(currentDateBody.iso_datetime);
    assertNoSensitiveFields(currentDateBody, "get-current-date");

    // 4. get-current-date nested tool-call payload -> results[] envelope,
    //    inner JSON has success:true.
    const nestedCurrentDateRes = await fetch(currentDateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          call: { id: `${TEST_TAG}_call_nested` },
          toolCalls: [{ id: "tc-nested-date", function: { arguments: JSON.stringify({ language: "en" }) } }],
        },
      }),
    });
    assert.equal(nestedCurrentDateRes.status, 200);
    const nestedEnvelope = await readJson<VapiCurrentDateBody>(nestedCurrentDateRes);
    assert.ok(nestedEnvelope.results?.[0]?.result, "nested payload must be wrapped in results[] envelope");
    const nestedBody = JSON.parse(nestedEnvelope.results![0].result!) as VapiCurrentDateBody;
    assert.equal(nestedBody.success, true);
    assertNoSensitiveFields(nestedEnvelope, "nested tool-call get-current-date");

    // 5. get-opening-hours with no RestaurantSettings.openingHoursJson ->
    //    documented safe response (success:true, configured:false).
    const notConfiguredRes = await fetch(openingHoursUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const notConfiguredBody = await readJson<VapiOpeningHoursBody>(notConfiguredRes);
    assert.equal(notConfiguredRes.status, 200);
    assert.equal(notConfiguredBody.success, true);
    assert.equal(notConfiguredBody.configured, false);
    assertNoSensitiveFields(notConfiguredBody, "get-opening-hours not configured");

    // 6. Configure opening hours, then re-check weekly/today hours.
    await prisma.restaurantSettings.upsert({
      where: { restaurantId: restaurant.id },
      update: { openingHoursJson: { monday: [{ start: "10:00", end: "22:00" }], saturday: [{ start: "10:00", end: "23:00" }] } },
      create: {
        restaurantId: restaurant.id,
        openingHoursJson: { monday: [{ start: "10:00", end: "22:00" }], saturday: [{ start: "10:00", end: "23:00" }] },
      },
    });

    const configuredRes = await fetch(openingHoursUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const configuredBody = await readJson<VapiOpeningHoursBody>(configuredRes);
    assert.equal(configuredRes.status, 200);
    assert.equal(configuredBody.success, true);
    assert.ok(configuredBody.weekly_hours, "weekly_hours must be present when no specific date was requested");
    assert.ok(configuredBody.date);
    assertNoSensitiveFields(configuredBody, "get-opening-hours configured");

    // 7. get-opening-hours date alias works: date, localDate, requestedDate.
    for (const alias of ["date", "localDate", "requestedDate"]) {
      const aliasRes = await fetch(openingHoursUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [alias]: "2026-08-01" }),
      });
      const aliasBody = await readJson<VapiOpeningHoursBody>(aliasRes);
      assert.equal(aliasRes.status, 200, `${alias} alias must return 200`);
      assert.equal(aliasBody.date, "2026-08-01", `${alias} alias must be honored`);
      assert.equal(aliasBody.weekly_hours, undefined, `${alias}: weekly_hours must be omitted for a specific-date request`);
    }

    // 2026-08-01 is a Saturday -> open per configured hours.
    const saturdayRes = await fetch(openingHoursUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-08-01" }),
    });
    const saturdayBody = await readJson<VapiOpeningHoursBody>(saturdayRes);
    assert.equal(saturdayBody.is_open, true);
    assert.deepEqual(saturdayBody.opening_periods, [{ opens: "10:00", closes: "23:00" }]);

    // 2026-08-02 is a Sunday -> not in openingHoursJson -> closed.
    const sundayRes = await fetch(openingHoursUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-08-02" }),
    });
    const sundayBody = await readJson<VapiOpeningHoursBody>(sundayRes);
    assert.equal(sundayBody.is_open, false);
    assert.deepEqual(sundayBody.opening_periods, []);

    // 8. get-opening-hours invalid date format -> safe success:false, not a 500.
    const invalidDateRes = await fetch(openingHoursUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "not-a-date" }),
    });
    const invalidDateBody = await readJson<VapiOpeningHoursBody>(invalidDateRes);
    assert.equal(invalidDateRes.status, 200, "invalid date must never surface as a 500");
    assert.equal(invalidDateBody.success, false);
    assertNoSensitiveFields(invalidDateBody, "get-opening-hours invalid date");

    // 9. Full-day blackout on a requested date -> closed/blocked response.
    const blackout = await prisma.blackoutDate.create({
      data: { restaurantId: restaurant.id, localDate: "2026-08-01", isFullDay: true, reason: "Private event", status: "active" },
    });
    const blackoutRes = await fetch(openingHoursUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-08-01" }),
    });
    const blackoutBody = await readJson<VapiOpeningHoursBody>(blackoutRes);
    assert.equal(blackoutBody.is_open, false);
    assert.equal(blackoutBody.closed_reason, "blackout_full_day");
    await prisma.blackoutDate.delete({ where: { id: blackout.id } });

    // 10. Nested Vapi tool-call payload for get-opening-hours -> results[] envelope.
    const nestedOpeningHoursRes = await fetch(openingHoursUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          call: { id: `${TEST_TAG}_call_nested_oh` },
          toolCalls: [{ id: "tc-nested-oh", function: { arguments: JSON.stringify({ date: "2026-08-01" }) } }],
        },
      }),
    });
    assert.equal(nestedOpeningHoursRes.status, 200);
    const nestedOpeningHoursEnvelope = await readJson<VapiOpeningHoursBody>(nestedOpeningHoursRes);
    assert.ok(nestedOpeningHoursEnvelope.results?.[0]?.result);
    const nestedOpeningHoursBody = JSON.parse(nestedOpeningHoursEnvelope.results![0].result!) as VapiOpeningHoursBody;
    assert.equal(nestedOpeningHoursBody.success, true);
    assertNoSensitiveFields(nestedOpeningHoursEnvelope, "nested tool-call get-opening-hours");

    // 11. ToolLog success/failure status.
    const successToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurant.id, toolName: "get_opening_hours", status: "success" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(successToolLog, "a success ToolLog row must exist for get_opening_hours");
    assertNoSensitiveFields(successToolLog!.responsePayload, "ToolLog.responsePayload");

    const failureToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurant.id, toolName: "get_opening_hours", status: "failure" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(failureToolLog, "a failure ToolLog row must exist for the invalid-date get_opening_hours call");

    const currentDateToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurant.id, toolName: "get_current_date", status: "success" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(currentDateToolLog, "a success ToolLog row must exist for get_current_date");

    // 12. Inactive restaurant -> safe closed/unavailable message, not a 500.
    const inactiveRestaurantRes = await fetch(
      `${baseUrl}/${inactiveRestaurantConnection.publicWebhookKey}/get-opening-hours`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
    );
    const inactiveRestaurantBody = await readJson<VapiOpeningHoursBody>(inactiveRestaurantRes);
    assert.equal(inactiveRestaurantRes.status, 200);
    assert.equal(inactiveRestaurantBody.success, true);
    assert.equal(inactiveRestaurantBody.is_open, false);
    assert.equal(inactiveRestaurantBody.closed_reason, "restaurant_inactive");

    console.log("vapiDateOpeningHours.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.toolLog.deleteMany({ where: { restaurantId: { in: [restaurant.id, inactiveRestaurant.id] } } });
    await prisma.blackoutDate.deleteMany({ where: { restaurantId: { in: [restaurant.id, inactiveRestaurant.id] } } });
    await prisma.restaurantSettings.deleteMany({ where: { restaurantId: { in: [restaurant.id, inactiveRestaurant.id] } } });
    await prisma.integrationConnection.deleteMany({
      where: { id: { in: [connection.id, inactiveConnection.id, inactiveRestaurantConnection.id] } },
    });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, inactiveRestaurant.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organization.id, inactiveOrganization.id] } } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("vapiDateOpeningHours.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
