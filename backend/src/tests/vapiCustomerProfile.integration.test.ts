/**
 * vapiCustomerProfile.integration.test.ts — Phase 29 DB-backed checks for
 * POST /api/webhooks/vapi/:publicWebhookKey/get-customer-profile and
 * POST /api/webhooks/vapi/:publicWebhookKey/create-customer-profile,
 * against a real Postgres database. Same convention as
 * vapiCreateReservationRequest.integration.test.ts: needs a live
 * DATABASE_URL, so it is NOT wired into `npm test` — run via:
 *
 *   npx tsx src/tests/vapiCustomerProfile.integration.test.ts
 *
 * If DATABASE_URL is unset or the database is unreachable, this script logs
 * a skip notice and exits 0 rather than failing the run.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";

const TEST_TAG = `vapicust_${Date.now()}`;

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

interface VapiCustomerProfileBody {
  success?: boolean;
  found?: boolean;
  action?: string;
  message?: string;
  customer_id?: string;
  customer?: { name?: string; phone?: string; email?: string; notes?: string };
  missing_fields?: string[];
  conflict?: boolean;
  error?: string;
  results?: Array<{ toolCallId: string; result?: string; error?: string }>;
}

async function readJson(res: Response): Promise<VapiCustomerProfileBody> {
  return (await res.json()) as VapiCustomerProfileBody;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("vapiCustomerProfile.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log(
      "vapiCustomerProfile.integration.test.ts: SKIPPED (database unreachable):",
      (err as Error).message
    );
    return;
  }

  const organizationA = await prisma.organization.create({ data: { name: `${TEST_TAG}_org_a`, status: "active" } });
  const restaurantA = await prisma.restaurant.create({
    data: { organizationId: organizationA.id, name: `${TEST_TAG}_restaurant_a`, slug: `${TEST_TAG}-restaurant-a` },
  });
  const connectionA = await prisma.integrationConnection.create({
    data: {
      restaurantId: restaurantA.id,
      channel: "vapi",
      provider: "vapi",
      status: "active",
      publicWebhookKey: `${TEST_TAG}_key_a`,
    },
  });
  const inactiveConnection = await prisma.integrationConnection.create({
    data: {
      restaurantId: restaurantA.id,
      channel: "vapi",
      provider: "vapi",
      status: "inactive",
      publicWebhookKey: `${TEST_TAG}_key_a_inactive`,
    },
  });

  const organizationB = await prisma.organization.create({ data: { name: `${TEST_TAG}_org_b`, status: "active" } });
  const restaurantB = await prisma.restaurant.create({
    data: { organizationId: organizationB.id, name: `${TEST_TAG}_restaurant_b`, slug: `${TEST_TAG}-restaurant-b` },
  });
  const connectionB = await prisma.integrationConnection.create({
    data: {
      restaurantId: restaurantB.id,
      channel: "vapi",
      provider: "vapi",
      status: "active",
      publicWebhookKey: `${TEST_TAG}_key_b`,
    },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/webhooks/vapi`;
  const getUrl = `${baseUrl}/${connectionA.publicWebhookKey}/get-customer-profile`;
  const createUrl = `${baseUrl}/${connectionA.publicWebhookKey}/create-customer-profile`;

  try {
    // 1. Unknown publicWebhookKey is rejected.
    const unknownRes = await fetch(`${baseUrl}/${TEST_TAG}_no_such_key/get-customer-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+1 555 0000" }),
    });
    assert.equal(unknownRes.status, 401, "unknown publicWebhookKey must be rejected");

    // 2. Inactive IntegrationConnection is rejected.
    const inactiveRes = await fetch(`${baseUrl}/${inactiveConnection.publicWebhookKey}/get-customer-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+1 555 0000" }),
    });
    assert.equal(inactiveRes.status, 401, "inactive IntegrationConnection must be rejected like an unknown key");

    // 3. get-customer-profile missing phone/email -> success:false with missing_fields.
    const missingRes = await fetch(getUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const missingBody = await readJson(missingRes);
    assert.equal(missingRes.status, 200, "missing fields must never surface as a 500");
    assert.equal(missingBody.success, false);
    assert.ok(missingBody.missing_fields?.includes("phone_or_email"));

    // 4. get-customer-profile not found -> success:true, found:false.
    const notFoundRes = await fetch(getUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+1 555 9999" }),
    });
    const notFoundBody = await readJson(notFoundRes);
    assert.equal(notFoundRes.status, 200);
    assert.equal(notFoundBody.success, true);
    assert.equal(notFoundBody.found, false);

    // 5. create-customer-profile missing name -> success:false.
    const missingNameRes = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+1 555 1000" }),
    });
    const missingNameBody = await readJson(missingNameRes);
    assert.equal(missingNameRes.status, 200);
    assert.equal(missingNameBody.success, false);
    assert.ok(missingNameBody.missing_fields?.includes("name"));

    // 6. create-customer-profile missing phone/email -> success:false.
    const missingContactRes = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Contact" }),
    });
    const missingContactBody = await readJson(missingContactRes);
    assert.equal(missingContactRes.status, 200);
    assert.equal(missingContactBody.success, false);
    assert.ok(missingContactBody.missing_fields?.includes("phone_or_email"));

    // 7. create-customer-profile creates a customer when none exists.
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Grace Hopper",
        phone: "+1 212 555 0100",
        email: "grace@example.test",
        notes: "Prefers window seating",
      }),
    });
    const createBody = await readJson(createRes);
    assert.equal(createRes.status, 200);
    assert.equal(createBody.success, true, `create must succeed: ${JSON.stringify(createBody)}`);
    assert.equal(createBody.action, "created");
    assert.ok(createBody.customer_id);
    assert.equal(createBody.customer?.name, "Grace Hopper");
    assertNoSensitiveFields(createBody, "create-customer-profile create");

    const createdCustomer = await prisma.customer.findUnique({ where: { id: createBody.customer_id! } });
    assert.ok(createdCustomer);
    assert.equal(createdCustomer!.restaurantId, restaurantA.id);

    // 8. get-customer-profile finds the customer by phone, scoped to restaurant A.
    const foundByPhoneRes = await fetch(getUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+1 212 555 0100" }),
    });
    const foundByPhoneBody = await readJson(foundByPhoneRes);
    assert.equal(foundByPhoneBody.found, true);
    assert.equal(foundByPhoneBody.customer_id, createBody.customer_id);
    assert.equal(foundByPhoneBody.customer?.email, "grace@example.test");

    // 9. get-customer-profile finds the customer by email.
    const foundByEmailRes = await fetch(getUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "GRACE@example.test" }),
    });
    const foundByEmailBody = await readJson(foundByEmailRes);
    assert.equal(foundByEmailBody.found, true);
    assert.equal(foundByEmailBody.customer_id, createBody.customer_id);

    // 10. get-customer-profile does not leak a customer from another restaurant.
    const crossTenantRes = await fetch(`${baseUrl}/${connectionB.publicWebhookKey}/get-customer-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+1 212 555 0100" }),
    });
    const crossTenantBody = await readJson(crossTenantRes);
    assert.equal(crossTenantBody.found, false, "a customer from restaurant A must not be visible from restaurant B");

    // 11. create-customer-profile updates the existing customer when phone matches.
    const updateRes = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Grace B. Hopper",
        phone: "+1 212 555 0100",
        notes: "Updated notes",
      }),
    });
    const updateBody = await readJson(updateRes);
    assert.equal(updateBody.success, true);
    assert.equal(updateBody.action, "updated");
    assert.equal(updateBody.customer_id, createBody.customer_id, "update must target the same Customer row");
    assert.equal(updateBody.customer?.name, "Grace B. Hopper");
    assert.equal(updateBody.customer?.notes, "Updated notes");
    assert.equal(updateBody.customer?.email, "grace@example.test", "update must not clear the existing email");

    // 12. create-customer-profile does not overwrite existing non-empty fields with empty input.
    const noopUpdateRes = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Grace B. Hopper", phone: "+1 212 555 0100", notes: "" }),
    });
    const noopUpdateBody = await readJson(noopUpdateRes);
    assert.equal(noopUpdateBody.customer?.notes, "Updated notes", "empty notes input must not clear existing notes");

    // 13. Conflict: phone and email resolve to two different customers -> safe conflict response.
    const otherCustomer = await prisma.customer.create({
      data: {
        restaurantId: restaurantA.id,
        fullName: "Other Customer",
        phoneNumber: "+1 212 555 0200",
        normalizedPhone: "12125550200",
        email: "other@example.test",
      },
    });
    const conflictRes = await fetch(getUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+1 212 555 0100", email: "other@example.test" }),
    });
    const conflictBody = await readJson(conflictRes);
    assert.equal(conflictBody.success, false);
    assert.equal(conflictBody.conflict, true, "mismatched phone/email must return a conflict, never merge");

    // 14. Nested Vapi tool-call payload -> results[] envelope, inner JSON success:true.
    const nestedRes = await fetch(getUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          call: { id: `${TEST_TAG}_call_nested` },
          toolCalls: [
            {
              id: "tc-nested-1",
              function: { arguments: JSON.stringify({ phone: "+1 212 555 0100" }) },
            },
          ],
        },
      }),
    });
    assert.equal(nestedRes.status, 200);
    const nestedEnvelope = (await nestedRes.json()) as {
      results?: Array<{ toolCallId: string; result?: string; error?: string }>;
    };
    assert.ok(
      nestedEnvelope.results?.[0]?.result,
      `nested tool-call payload must be wrapped in the results[] envelope: ${JSON.stringify(nestedEnvelope)}`
    );
    const nestedBody = JSON.parse(nestedEnvelope.results![0].result!) as VapiCustomerProfileBody;
    assert.equal(nestedBody.success, true);
    assert.equal(nestedBody.found, true);
    assertNoSensitiveFields(nestedEnvelope, "nested tool-call get-customer-profile");

    // 15. ToolLog success/failure status.
    const successToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurantA.id, toolName: "create_customer_profile", status: "success" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(successToolLog, "a success ToolLog row must exist for create_customer_profile");
    assertNoSensitiveFields(successToolLog!.responsePayload, "ToolLog.responsePayload");

    const failureToolLog = await prisma.toolLog.findFirst({
      where: { restaurantId: restaurantA.id, toolName: "create_customer_profile", status: "failure" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(failureToolLog, "a failure ToolLog row must exist for a missing-fields create_customer_profile call");

    // 16. Response never includes sensitive/internal fields.
    assertNoSensitiveFields(createBody, "final create-customer-profile sensitive-field check");
    assertNoSensitiveFields(updateBody, "final create-customer-profile update sensitive-field check");

    await prisma.customer.delete({ where: { id: otherCustomer.id } });

    console.log("vapiCustomerProfile.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.toolLog.deleteMany({ where: { restaurantId: { in: [restaurantA.id, restaurantB.id] } } });
    await prisma.customer.deleteMany({ where: { restaurantId: { in: [restaurantA.id, restaurantB.id] } } });
    await prisma.integrationConnection.deleteMany({
      where: { id: { in: [connectionA.id, inactiveConnection.id, connectionB.id] } },
    });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurantA.id, restaurantB.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationA.id, organizationB.id] } } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("vapiCustomerProfile.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
