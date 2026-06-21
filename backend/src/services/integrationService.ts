import { randomBytes } from "crypto";
import { Prisma, type IntegrationConnection } from "@prisma/client";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";
import { prisma } from "../prisma/client";
import type { CreateIntegrationInput, UpdateIntegrationInput } from "../schemas/integrations";
import { encryptCredentials, isCredentialEncryptionConfigured } from "../utils/encryption";

function buildWebhookUrl(channel: string, publicWebhookKey: string): string {
  const base = env.PUBLIC_API_URL ?? "";
  return `${base}/api/webhooks/${channel}/${publicWebhookKey}`;
}

// Safe summary: never includes credentialsEncrypted or webhookVerifyTokenHash.
// isActive is derived from status since the schema has no separate boolean column.
function toSummary(row: IntegrationConnection) {
  return {
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    displayName: row.displayName,
    status: row.status,
    isActive: row.status === "active",
    publicWebhookKey: row.publicWebhookKey,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDetail(row: IntegrationConnection) {
  return {
    ...toSummary(row),
    configJson: row.configJson,
    hasCredentials: Boolean(row.credentialsEncrypted),
    lastConnectedAt: row.lastConnectedAt,
    lastTestedAt: row.lastTestedAt,
    webhookUrl: buildWebhookUrl(row.channel, row.publicWebhookKey),
  };
}

function generateWebhookKey(): string {
  return randomBytes(24).toString("hex");
}

async function createUniqueWebhookKey(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = generateWebhookKey();
    const existing = await prisma.integrationConnection.findUnique({ where: { publicWebhookKey: key } });
    if (!existing) return key;
  }
  // Astronomically unlikely with a 24-byte random key, but fail loudly rather
  // than silently retrying forever or persisting a colliding key.
  throw new AppError("Failed to generate a unique webhook key", 500);
}

function assertCredentialEncryptionAvailable(credentials: Record<string, string> | undefined): void {
  if (credentials && Object.keys(credentials).length > 0 && !isCredentialEncryptionConfigured()) {
    throw new AppError("Integration credential encryption is not configured", 503);
  }
}

/**
 * Looks up an integration scoped to restaurantId. Returns null for both
 * "does not exist" and "belongs to another restaurant" so callers respond
 * 404 without distinguishing the two cases to a probing request.
 */
export async function findIntegrationForRestaurant(restaurantId: string, integrationId: string) {
  return prisma.integrationConnection.findFirst({ where: { id: integrationId, restaurantId } });
}

export async function listIntegrations(restaurantId: string) {
  const rows = await prisma.integrationConnection.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toSummary);
}

export async function getIntegrationDetail(restaurantId: string, integrationId: string) {
  const row = await findIntegrationForRestaurant(restaurantId, integrationId);
  if (!row) return null;
  return toDetail(row);
}

export async function createIntegration(restaurantId: string, input: CreateIntegrationInput) {
  const { credentials, ...rest } = input;
  assertCredentialEncryptionAvailable(credentials);

  const publicWebhookKey = await createUniqueWebhookKey();
  const data: Prisma.IntegrationConnectionUncheckedCreateInput = {
    restaurantId,
    channel: rest.channel,
    provider: rest.provider,
    displayName: rest.displayName ?? null,
    status: rest.status ?? "inactive",
    configJson:
      rest.configJson === undefined
        ? undefined
        : rest.configJson === null
          ? Prisma.JsonNull
          : (rest.configJson as Prisma.InputJsonValue),
    publicWebhookKey,
  };
  if (credentials && Object.keys(credentials).length > 0) {
    data.credentialsEncrypted = encryptCredentials(JSON.stringify(credentials));
  }

  const created = await prisma.integrationConnection.create({ data });
  return toDetail(created);
}

export async function updateIntegration(restaurantId: string, integrationId: string, patch: UpdateIntegrationInput) {
  const { credentials, ...rest } = patch;
  assertCredentialEncryptionAvailable(credentials);

  const data: Prisma.IntegrationConnectionUncheckedUpdateInput = {};
  if (rest.channel !== undefined) data.channel = rest.channel;
  if (rest.provider !== undefined) data.provider = rest.provider;
  if (rest.displayName !== undefined) data.displayName = rest.displayName;
  if (rest.status !== undefined) data.status = rest.status;
  if (rest.configJson !== undefined) {
    data.configJson = rest.configJson === null ? Prisma.JsonNull : (rest.configJson as Prisma.InputJsonValue);
  }
  if (credentials !== undefined) {
    data.credentialsEncrypted = Object.keys(credentials).length > 0 ? encryptCredentials(JSON.stringify(credentials)) : null;
  }

  const updated = await prisma.integrationConnection.update({ where: { id: integrationId, restaurantId }, data });
  return toDetail(updated);
}

export async function rotateWebhookKey(restaurantId: string, integrationId: string) {
  const publicWebhookKey = await createUniqueWebhookKey();
  const updated = await prisma.integrationConnection.update({
    where: { id: integrationId, restaurantId },
    data: { publicWebhookKey },
  });
  return toDetail(updated);
}

export async function setIntegrationActive(restaurantId: string, integrationId: string, isActive: boolean) {
  const updated = await prisma.integrationConnection.update({
    where: { id: integrationId, restaurantId },
    data: { status: isActive ? "active" : "inactive" },
  });
  return toDetail(updated);
}

// No real provider call yet (Phase 7 is backend-only scaffolding) — returns a
// controlled stub so the frontend can wire up a "Test connection" button now
// without this phase reaching out to WhatsApp/Instagram/SMS/Vapi APIs.
export async function testIntegrationStub(restaurantId: string, integrationId: string) {
  const existing = await findIntegrationForRestaurant(restaurantId, integrationId);
  if (!existing) return null;
  return {
    success: false,
    implemented: false,
    message: `Live connection testing for provider "${existing.provider}" is not implemented yet.`,
  };
}
