-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "plan" TEXT DEFAULT 'starter',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'fr',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "globalRole" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_users" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "normalizedPhone" TEXT,
    "fullName" TEXT,
    "email" TEXT,
    "instagramHandle" TEXT,
    "whatsappId" TEXT,
    "totalReservations" INTEGER NOT NULL DEFAULT 0,
    "lastVisitAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_tables" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableNumber" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_requests" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT,
    "conversationId" TEXT,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "sourceExternalId" TEXT,
    "requestType" TEXT NOT NULL DEFAULT 'create',
    "customerName" TEXT,
    "phoneNumber" TEXT,
    "normalizedPhone" TEXT,
    "partySize" INTEGER,
    "reservationDate" TIMESTAMP(3),
    "reservationTime" TEXT,
    "language" TEXT,
    "specialRequest" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "internalNote" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "reservationRequestId" TEXT,
    "customerId" TEXT,
    "assignedTableId" TEXT,
    "sourceChannel" TEXT NOT NULL,
    "reservationDate" TIMESTAMP(3) NOT NULL,
    "reservationTime" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "externalThreadId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerHandle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedToUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "stateJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerId" TEXT,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "senderType" TEXT NOT NULL,
    "senderUserId" TEXT,
    "externalMessageId" TEXT,
    "messageText" TEXT,
    "rawPayload" JSONB,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "publicWebhookKey" TEXT NOT NULL,
    "webhookVerifyTokenHash" TEXT,
    "configJson" JSONB,
    "credentialsEncrypted" TEXT,
    "lastConnectedAt" TIMESTAMP(3),
    "lastTestedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT,
    "reservationId" TEXT,
    "conversationId" TEXT,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "templateKey" TEXT,
    "messageBody" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "templateKey" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "body" TEXT NOT NULL,
    "providerTemplateName" TEXT,
    "providerStatus" TEXT,
    "variablesJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "delayMinutes" INTEGER,
    "configJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_logs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "channel" TEXT,
    "provider" TEXT,
    "toolName" TEXT NOT NULL,
    "externalCallId" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "status" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "integrationId" TEXT,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_organizationId_slug_key" ON "restaurants"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organization_users_organizationId_userId_key" ON "organization_users"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_users_restaurantId_userId_key" ON "restaurant_users"("restaurantId", "userId");

-- CreateIndex
CREATE INDEX "customers_restaurantId_fullName_idx" ON "customers"("restaurantId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "customers_restaurantId_normalizedPhone_key" ON "customers"("restaurantId", "normalizedPhone");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_restaurantId_tableNumber_key" ON "restaurant_tables"("restaurantId", "tableNumber");

-- CreateIndex
CREATE INDEX "reservation_requests_restaurantId_status_idx" ON "reservation_requests"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "reservation_requests_restaurantId_reservationDate_idx" ON "reservation_requests"("restaurantId", "reservationDate");

-- CreateIndex
CREATE INDEX "reservations_restaurantId_reservationDate_idx" ON "reservations"("restaurantId", "reservationDate");

-- CreateIndex
CREATE INDEX "reservations_restaurantId_status_idx" ON "reservations"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "conversations_restaurantId_channel_idx" ON "conversations"("restaurantId", "channel");

-- CreateIndex
CREATE INDEX "conversations_restaurantId_status_idx" ON "conversations"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_restaurantId_channel_provider_externalThreadI_key" ON "conversations"("restaurantId", "channel", "provider", "externalThreadId");

-- CreateIndex
CREATE INDEX "messages_restaurantId_conversationId_idx" ON "messages"("restaurantId", "conversationId");

-- CreateIndex
CREATE INDEX "messages_restaurantId_createdAt_idx" ON "messages"("restaurantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_publicWebhookKey_key" ON "integration_connections"("publicWebhookKey");

-- CreateIndex
CREATE INDEX "integration_connections_restaurantId_channel_idx" ON "integration_connections"("restaurantId", "channel");

-- CreateIndex
CREATE INDEX "outbound_messages_restaurantId_status_idx" ON "outbound_messages"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "outbound_messages_restaurantId_scheduledFor_idx" ON "outbound_messages"("restaurantId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_restaurantId_channel_templateKey_language_key" ON "message_templates"("restaurantId", "channel", "templateKey", "language");

-- CreateIndex
CREATE INDEX "automation_rules_restaurantId_triggerKey_idx" ON "automation_rules"("restaurantId", "triggerKey");

-- CreateIndex
CREATE UNIQUE INDEX "automation_rules_restaurantId_triggerKey_channel_templateKe_key" ON "automation_rules"("restaurantId", "triggerKey", "channel", "templateKey");

-- CreateIndex
CREATE INDEX "tool_logs_restaurantId_createdAt_idx" ON "tool_logs"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "integration_events_restaurantId_channel_idx" ON "integration_events"("restaurantId", "channel");

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_users" ADD CONSTRAINT "restaurant_users_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_users" ADD CONSTRAINT "restaurant_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
