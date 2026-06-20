# 02 — Target Database Schema

This document defines the target Prisma/PostgreSQL data model. Names may be adjusted during implementation, but the relationships and tenancy rules should remain.

## Naming convention

Preferred:
- Prisma model names: PascalCase
- DB table names: snake_case through `@@map`
- tenant field: `restaurantId`
- external identifiers: `externalId`, `externalThreadId`, `externalMessageId`
- JSON fields: `Json`

## Core tenant models

```prisma
model Organization {
  id          String   @id @default(uuid())
  name        String
  status      String   @default("active")
  plan        String?  @default("starter")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  restaurants Restaurant[]
  users       OrganizationUser[]

  @@map("organizations")
}

model Restaurant {
  id              String   @id @default(uuid())
  organizationId  String
  name            String
  slug            String
  phone           String?
  email           String?
  address         String?
  timezone        String   @default("Europe/Paris")
  defaultLanguage String   @default("fr")
  status          String   @default("active")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  users        RestaurantUser[]

  @@unique([organizationId, slug])
  @@map("restaurants")
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  name         String?
  passwordHash String?
  globalRole   String?  // PLATFORM_ADMIN only when needed
  status       String   @default("active")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  restaurants RestaurantUser[]
  organizations OrganizationUser[]

  @@map("users")
}

model OrganizationUser {
  id             String   @id @default(uuid())
  organizationId String
  userId         String
  role           String   // OWNER, ORG_ADMIN
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@map("organization_users")
}

model RestaurantUser {
  id           String   @id @default(uuid())
  restaurantId String
  userId       String
  role         String   // OWNER, MANAGER, STAFF
  status       String   @default("active")
  createdAt    DateTime @default(now())

  restaurant Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([restaurantId, userId])
  @@map("restaurant_users")
}
```

## Customer and reservation models

```prisma
model Customer {
  id                String   @id @default(uuid())
  restaurantId      String
  phoneNumber       String?
  normalizedPhone   String?
  fullName          String?
  email             String?
  instagramHandle   String?
  whatsappId        String?
  totalReservations Int      @default(0)
  lastVisitAt       DateTime?
  notes             String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  restaurant Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@unique([restaurantId, normalizedPhone])
  @@index([restaurantId, fullName])
  @@map("customers")
}

model RestaurantTable {
  id           String   @id @default(uuid())
  restaurantId String
  tableNumber  String
  capacity     Int
  location     String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  restaurant Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@unique([restaurantId, tableNumber])
  @@map("restaurant_tables")
}

model ReservationRequest {
  id                String   @id @default(uuid())
  restaurantId       String
  customerId         String?
  conversationId     String?
  channel            String   // voice, whatsapp, instagram, website, manual
  provider           String?
  sourceExternalId   String?
  requestType        String   @default("create") // create, change, cancel, question, handoff
  customerName       String?
  phoneNumber        String?
  normalizedPhone    String?
  partySize          Int?
  reservationDate    DateTime?
  reservationTime    String?
  language           String?
  specialRequest     String?
  status             String   @default("new") // new, pending_info, confirmed, rejected, cancelled, done
  internalNote       String?
  rawPayload         Json?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([restaurantId, status])
  @@index([restaurantId, reservationDate])
  @@map("reservation_requests")
}

model Reservation {
  id                   String   @id @default(uuid())
  restaurantId          String
  reservationRequestId  String?
  customerId            String?
  assignedTableId       String?
  sourceChannel         String
  reservationDate       DateTime
  reservationTime       String
  partySize             Int
  status                String   @default("confirmed") // pending, confirmed, cancelled, no_show, completed
  internalNote          String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([restaurantId, reservationDate])
  @@index([restaurantId, status])
  @@map("reservations")
}
```

## Conversation and message models

```prisma
model Conversation {
  id                  String   @id @default(uuid())
  restaurantId         String
  customerId           String?
  channel              String   // voice, whatsapp, instagram, website, sms
  provider             String?
  externalThreadId     String?
  customerName         String?
  customerPhone        String?
  customerHandle       String?
  status               String   @default("open") // open, pending, closed, archived
  assignedToUserId     String?
  lastMessageAt        DateTime?
  lastMessagePreview   String?
  stateJson            Json?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@index([restaurantId, channel])
  @@index([restaurantId, status])
  @@unique([restaurantId, channel, provider, externalThreadId])
  @@map("conversations")
}

model Message {
  id                String   @id @default(uuid())
  restaurantId      String
  conversationId    String
  customerId        String?
  direction         String   // inbound, outbound
  channel           String
  provider          String?
  senderType        String   // customer, staff, system, ai
  senderUserId      String?
  externalMessageId String?
  messageText       String?
  rawPayload        Json?
  status            String?  // received, queued, sent, failed, delivered
  createdAt         DateTime @default(now())

  @@index([restaurantId, conversationId])
  @@index([restaurantId, createdAt])
  @@map("messages")
}
```

## Integration and outbound models

```prisma
model IntegrationConnection {
  id                       String   @id @default(uuid())
  restaurantId              String
  channel                   String   // vapi, sms, whatsapp, instagram, website
  provider                  String   // vapi, netgsm, twilio, meta_cloud, evolution, custom_http
  displayName               String?
  status                    String   @default("inactive") // inactive, active, error
  publicWebhookKey          String   @unique
  webhookVerifyTokenHash    String?
  configJson                Json?
  credentialsEncrypted      String?
  lastConnectedAt           DateTime?
  lastTestedAt              DateTime?
  lastError                 String?
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt

  @@index([restaurantId, channel])
  @@map("integration_connections")
}

model OutboundMessage {
  id                 String   @id @default(uuid())
  restaurantId       String
  customerId         String?
  reservationId      String?
  conversationId     String?
  channel            String   // sms, whatsapp, instagram
  provider           String
  toAddress          String
  templateKey        String?
  messageBody        String
  status             String   @default("queued") // queued, sent, failed, delivered
  providerMessageId  String?
  errorMessage       String?
  attemptCount       Int      @default(0)
  scheduledFor       DateTime?
  sentAt             DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([restaurantId, status])
  @@index([restaurantId, scheduledFor])
  @@map("outbound_messages")
}

model MessageTemplate {
  id                   String   @id @default(uuid())
  restaurantId          String
  channel               String
  provider              String?
  templateKey           String
  language              String   @default("fr")
  body                  String
  providerTemplateName  String?
  providerStatus        String?
  variablesJson         Json?
  isActive              Boolean  @default(true)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([restaurantId, channel, templateKey, language])
  @@map("message_templates")
}

model AutomationRule {
  id             String   @id @default(uuid())
  restaurantId   String
  triggerKey     String   // reservation_received, reservation_confirmed, reminder_before_reservation
  channel        String   // sms, whatsapp, instagram
  templateKey    String
  isEnabled      Boolean  @default(false)
  delayMinutes   Int?
  configJson     Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([restaurantId, triggerKey])
  @@map("automation_rules")
}
```

## Logging models

```prisma
model ToolLog {
  id              String   @id @default(uuid())
  restaurantId    String?
  channel         String?
  provider        String?
  toolName        String
  externalCallId  String?
  requestPayload  Json?
  responsePayload Json?
  status          String?
  errorMessage    String?
  createdAt       DateTime @default(now())

  @@index([restaurantId, createdAt])
  @@map("tool_logs")
}

model IntegrationEvent {
  id             String   @id @default(uuid())
  restaurantId   String?
  integrationId  String?
  channel        String
  provider       String?
  eventType      String
  status         String
  payload        Json?
  errorMessage   String?
  createdAt      DateTime @default(now())

  @@index([restaurantId, channel])
  @@map("integration_events")
}
```

## Migration note

When migrating from Supabase:
- current `tables` should become `restaurant_tables`;
- current `calls` can be preserved or mapped to `Conversation`/`ToolLog`;
- current `reservation_requests` should receive `restaurantId`, `channel`, and `sourceExternalId`;
- current Vapi-specific `vapi_call_id` can be retained temporarily as legacy compatibility.
