import { z } from "zod";

// Mirrors prisma/schema.prisma comments on IntegrationConnection.channel/provider/status.
export const INTEGRATION_CHANNELS = ["vapi", "sms", "whatsapp", "instagram", "website"] as const;
export const INTEGRATION_PROVIDERS = ["vapi", "netgsm", "twilio", "meta_cloud", "evolution", "custom_http"] as const;
export const INTEGRATION_STATUSES = ["inactive", "active", "error"] as const;

export type IntegrationChannel = (typeof INTEGRATION_CHANNELS)[number];
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

const channelEnum = z.enum(INTEGRATION_CHANNELS);
const providerEnum = z.enum(INTEGRATION_PROVIDERS);
const statusEnum = z.enum(INTEGRATION_STATUSES);

// Arbitrary provider-specific secret fields (e.g. apiKey, accountSid, accessToken).
// Stored as a single encrypted JSON blob in credentialsEncrypted — never returned to clients.
const credentialsSchema = z.record(z.string(), z.string()).optional();

// restaurantId, publicWebhookKey, webhookVerifyTokenHash, and credentialsEncrypted are
// intentionally absent — restaurantId comes from the route, publicWebhookKey is
// server-generated, and the encrypted fields are never accepted directly (see
// docs/06_SECURITY_AND_TENANCY_RULES.md).
export const createIntegrationSchema = z
  .object({
    channel: channelEnum,
    provider: providerEnum,
    displayName: z.string().trim().min(1).max(120).nullable().optional(),
    status: statusEnum.optional(),
    configJson: z.record(z.string(), z.unknown()).nullable().optional(),
    credentials: credentialsSchema,
  })
  .strict();

export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;

export const updateIntegrationSchema = z
  .object({
    channel: channelEnum.optional(),
    provider: providerEnum.optional(),
    displayName: z.string().trim().min(1).max(120).nullable().optional(),
    status: statusEnum.optional(),
    configJson: z.record(z.string(), z.unknown()).nullable().optional(),
    credentials: credentialsSchema,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>;
