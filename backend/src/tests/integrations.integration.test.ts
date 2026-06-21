/**
 * integrations.integration.test.ts — end-to-end checks for the Phase 7
 * IntegrationConnection management API against a real Postgres database.
 *
 * Like customers.integration.test.ts, this needs a live DATABASE_URL and is
 * NOT wired into `npm test`. Run explicitly:
 *
 *   npx tsx src/tests/integrations.integration.test.ts
 *
 * If DATABASE_URL is unset or unreachable, this logs a skip notice and exits 0.
 *
 * Scenarios covered:
 *  - Missing/invalid bearer token is rejected with 401.
 *  - OWNER can list integrations for their own restaurant; credentials never exposed.
 *  - GET detail validates restaurant ownership and masks secrets.
 *  - STAFF is rejected (403) from every integrations endpoint.
 *  - POST creates an integration, encrypts credentials, generates a unique publicWebhookKey.
 *  - POST rejects forbidden fields (restaurantId, publicWebhookKey, credentialsEncrypted) with 400.
 *  - PATCH updates safe fields and re-encrypts credentials without ever returning them.
 *  - POST .../rotate-webhook-key changes the key and the old key stops resolving.
 *  - POST .../enable and .../disable toggle status/isActive.
 *  - POST .../test returns a controlled not-implemented stub.
 *  - Cross-tenant access (list/detail/update) returns 403/404 without leaking data.
 *  - Unknown integration id returns a controlled 404.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";
import { prisma } from "../prisma/client";
import { signAuthToken } from "../utils/jwt";
import { hashPassword } from "../utils/password";

const TEST_TAG = `integtest_${Date.now()}`;

interface ApiError {
  error?: { message?: string };
}

interface IntegrationSummary {
  id: string;
  channel: string;
  provider: string;
  status: string;
  isActive: boolean;
  publicWebhookKey: string;
  lastError: string | null;
}

interface IntegrationDetail extends IntegrationSummary {
  configJson: unknown;
  hasCredentials: boolean;
  webhookUrl: string;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("integrations.integration.test.ts: SKIPPED (DATABASE_URL not set)");
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log("integrations.integration.test.ts: SKIPPED (database unreachable):", (err as Error).message);
    return;
  }

  // A deterministic, valid key so credentials encryption is exercised end-to-end.
  process.env.INTEGRATION_CREDENTIALS_ENCRYPTION_KEY = "b".repeat(64);

  const organization = await prisma.organization.create({ data: { name: `${TEST_TAG}_org`, status: "active" } });
  const restaurant = await prisma.restaurant.create({
    data: { organizationId: organization.id, name: `${TEST_TAG}_restaurant`, slug: `${TEST_TAG}-restaurant` },
  });
  const otherRestaurant = await prisma.restaurant.create({
    data: { organizationId: organization.id, name: `${TEST_TAG}_restaurant_2`, slug: `${TEST_TAG}-restaurant-2` },
  });

  const passwordHash = await hashPassword("Test1234!");
  const owner = await prisma.user.create({
    data: { email: `${TEST_TAG}_owner@example.com`, passwordHash, status: "active" },
  });
  const staff = await prisma.user.create({
    data: { email: `${TEST_TAG}_staff@example.com`, passwordHash, status: "active" },
  });

  await prisma.restaurantUser.create({ data: { restaurantId: restaurant.id, userId: owner.id, role: "OWNER", status: "active" } });
  await prisma.restaurantUser.create({ data: { restaurantId: restaurant.id, userId: staff.id, role: "STAFF", status: "active" } });

  const ownerToken = signAuthToken({ sub: owner.id });
  const staffToken = signAuthToken({ sub: staff.id });

  const otherTenantIntegration = await prisma.integrationConnection.create({
    data: {
      restaurantId: otherRestaurant.id,
      channel: "sms",
      provider: "netgsm",
      status: "active",
      publicWebhookKey: `${TEST_TAG}_other_key`,
    },
  });

  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api/restaurants`;

  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });
  const json = (token: string) => ({ ...authed(token), "Content-Type": "application/json" });

  try {
    // 1. Missing token -> 401.
    const noAuthRes = await fetch(`${baseUrl}/${restaurant.id}/integrations`);
    assert.equal(noAuthRes.status, 401, "missing bearer token must be rejected with 401");

    // 2. Invalid token -> 401.
    const badAuthRes = await fetch(`${baseUrl}/${restaurant.id}/integrations`, { headers: authed("not-a-real-token") });
    assert.equal(badAuthRes.status, 401, "invalid bearer token must be rejected with 401");

    // 3. STAFF is rejected from every integrations endpoint.
    const staffListRes = await fetch(`${baseUrl}/${restaurant.id}/integrations`, { headers: authed(staffToken) });
    assert.equal(staffListRes.status, 403, "STAFF must not be able to list integrations");

    // 4. Empty list for a fresh restaurant.
    const emptyListRes = await fetch(`${baseUrl}/${restaurant.id}/integrations`, { headers: authed(ownerToken) });
    assert.equal(emptyListRes.status, 200);
    const emptyListBody = (await emptyListRes.json()) as { data: IntegrationSummary[] };
    assert.equal(emptyListBody.data.length, 0);

    // 5. Forbidden fields on create -> 400 (restaurantId, publicWebhookKey, credentialsEncrypted).
    const forbiddenCreateRes = await fetch(`${baseUrl}/${restaurant.id}/integrations`, {
      method: "POST",
      headers: json(ownerToken),
      body: JSON.stringify({ channel: "sms", provider: "netgsm", restaurantId: otherRestaurant.id }),
    });
    assert.equal(forbiddenCreateRes.status, 400, "restaurantId must never be settable from the request body");

    const forbiddenCreateRes2 = await fetch(`${baseUrl}/${restaurant.id}/integrations`, {
      method: "POST",
      headers: json(ownerToken),
      body: JSON.stringify({ channel: "sms", provider: "netgsm", credentialsEncrypted: "deadbeef" }),
    });
    assert.equal(forbiddenCreateRes2.status, 400, "credentialsEncrypted must never be settable directly");

    // 6. STAFF cannot create.
    const staffCreateRes = await fetch(`${baseUrl}/${restaurant.id}/integrations`, {
      method: "POST",
      headers: json(staffToken),
      body: JSON.stringify({ channel: "sms", provider: "netgsm" }),
    });
    assert.equal(staffCreateRes.status, 403);

    // 7. OWNER creates an integration with credentials -> 201, credentials never echoed back.
    const createRes = await fetch(`${baseUrl}/${restaurant.id}/integrations`, {
      method: "POST",
      headers: json(ownerToken),
      body: JSON.stringify({
        channel: "sms",
        provider: "netgsm",
        displayName: "Netgsm prod",
        credentials: { apiKey: "super-secret-api-key" },
      }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as IntegrationDetail;
    assert.equal(created.channel, "sms");
    assert.equal(created.hasCredentials, true);
    assert.equal(created.isActive, false, "status defaults to inactive");
    assert.ok(created.publicWebhookKey, "a publicWebhookKey must be generated server-side");
    assert.ok(!JSON.stringify(created).includes("super-secret-api-key"), "raw credentials must never appear in the response");

    // Verify the DB actually stores ciphertext, never the plaintext secret.
    const storedRow = await prisma.integrationConnection.findUnique({ where: { id: created.id } });
    assert.ok(storedRow?.credentialsEncrypted, "credentialsEncrypted must be persisted");
    assert.ok(
      !storedRow!.credentialsEncrypted!.includes("super-secret-api-key"),
      "stored credentialsEncrypted must not contain the plaintext secret"
    );

    // 8. GET list includes the new integration, still without credentials.
    const listRes = await fetch(`${baseUrl}/${restaurant.id}/integrations`, { headers: authed(ownerToken) });
    const listBody = (await listRes.json()) as { data: IntegrationSummary[] };
    assert.equal(listBody.data.length, 1);
    assert.ok(!("credentialsEncrypted" in (listBody.data[0] as unknown as Record<string, unknown>)));

    // 9. GET detail works for OWNER/MANAGER-equivalent OWNER and masks secrets.
    const detailRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${created.id}`, { headers: authed(ownerToken) });
    assert.equal(detailRes.status, 200);
    const detailBody = (await detailRes.json()) as IntegrationDetail;
    assert.equal(detailBody.hasCredentials, true);
    assert.ok(detailBody.webhookUrl.includes(detailBody.publicWebhookKey));

    // 10. STAFF cannot read detail either.
    const staffDetailRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${created.id}`, { headers: authed(staffToken) });
    assert.equal(staffDetailRes.status, 403);

    // 11. PATCH updates safe fields and re-encrypts new credentials.
    const patchRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${created.id}`, {
      method: "PATCH",
      headers: json(ownerToken),
      body: JSON.stringify({ displayName: "Netgsm prod (renamed)", credentials: { apiKey: "rotated-secret" } }),
    });
    assert.equal(patchRes.status, 200);
    const patched = (await patchRes.json()) as IntegrationDetail;
    assert.ok(!JSON.stringify(patched).includes("rotated-secret"));
    const patchedRow = await prisma.integrationConnection.findUnique({ where: { id: created.id } });
    assert.equal(patchedRow?.displayName, "Netgsm prod (renamed)");
    assert.notEqual(patchedRow?.credentialsEncrypted, storedRow?.credentialsEncrypted, "re-encrypted credentials must change ciphertext");

    // 12. PATCH rejects forbidden fields.
    const forbiddenPatchRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${created.id}`, {
      method: "PATCH",
      headers: json(ownerToken),
      body: JSON.stringify({ publicWebhookKey: "attacker-chosen-key" }),
    });
    assert.equal(forbiddenPatchRes.status, 400, "publicWebhookKey must not be directly overwritable via PATCH");

    // 13. Enable/disable toggles status and isActive.
    const enableRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${created.id}/enable`, {
      method: "POST",
      headers: authed(ownerToken),
    });
    assert.equal(enableRes.status, 200);
    const enabled = (await enableRes.json()) as IntegrationDetail;
    assert.equal(enabled.isActive, true);
    assert.equal(enabled.status, "active");

    const disableRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${created.id}/disable`, {
      method: "POST",
      headers: authed(ownerToken),
    });
    const disabled = (await disableRes.json()) as IntegrationDetail;
    assert.equal(disabled.isActive, false);
    assert.equal(disabled.status, "inactive");

    // STAFF cannot enable/disable.
    const staffEnableRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${created.id}/enable`, {
      method: "POST",
      headers: authed(staffToken),
    });
    assert.equal(staffEnableRes.status, 403);

    // 14. Rotate webhook key changes it and the old key no longer resolves.
    const oldKey = disabled.publicWebhookKey;
    const rotateRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${created.id}/rotate-webhook-key`, {
      method: "POST",
      headers: authed(ownerToken),
    });
    assert.equal(rotateRes.status, 200);
    const rotated = (await rotateRes.json()) as IntegrationDetail;
    assert.notEqual(rotated.publicWebhookKey, oldKey, "rotation must change the webhook key");
    assert.ok(rotated.webhookUrl.includes(rotated.publicWebhookKey));

    const oldKeyLookup = await prisma.integrationConnection.findUnique({ where: { publicWebhookKey: oldKey } });
    assert.equal(oldKeyLookup, null, "the old webhook key must no longer resolve to any integration");

    // STAFF cannot rotate.
    const staffRotateRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${created.id}/rotate-webhook-key`, {
      method: "POST",
      headers: authed(staffToken),
    });
    assert.equal(staffRotateRes.status, 403);

    // 15. Test connection stub returns a controlled not-implemented response.
    const testRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${created.id}/test`, {
      method: "POST",
      headers: authed(ownerToken),
    });
    assert.equal(testRes.status, 200);
    const testBody = (await testRes.json()) as { success: boolean; implemented: boolean };
    assert.equal(testBody.success, false);
    assert.equal(testBody.implemented, false);

    // 16. Unknown integration id -> controlled 404.
    const unknownRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/00000000-0000-0000-0000-000000000000`, {
      headers: authed(ownerToken),
    });
    assert.equal(unknownRes.status, 404);
    const unknownBody = (await unknownRes.json()) as ApiError;
    assert.ok(unknownBody.error);

    // 17. Cross-tenant: OWNER of `restaurant` must not see/manage otherRestaurant's integration.
    const crossTenantListRes = await fetch(`${baseUrl}/${otherRestaurant.id}/integrations`, { headers: authed(ownerToken) });
    assert.equal(crossTenantListRes.status, 403, "a user with no access to otherRestaurant must get 403, not a data leak");

    const crossTenantDetailRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${otherTenantIntegration.id}`, {
      headers: authed(ownerToken),
    });
    assert.equal(crossTenantDetailRes.status, 404, "an integration belonging to another restaurant must 404 under this restaurant's scope");

    const crossTenantPatchRes = await fetch(`${baseUrl}/${restaurant.id}/integrations/${otherTenantIntegration.id}`, {
      method: "PATCH",
      headers: json(ownerToken),
      body: JSON.stringify({ displayName: "hijacked" }),
    });
    assert.equal(crossTenantPatchRes.status, 404);

    console.log("integrations.integration.test.ts: all checks passed");
  } finally {
    server.close();
    await prisma.integrationConnection.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, staff.id] } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: [restaurant.id, otherRestaurant.id] } } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("integrations.integration.test.ts failed:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
