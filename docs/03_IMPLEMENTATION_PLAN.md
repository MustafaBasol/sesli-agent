# 03 — Implementation Plan

The implementation must be incremental and safe. The current application should stay usable during the transition.

## Phase 0 — Documentation and repository preparation

Add:
- `AGENTS.md`
- all `docs/*.md` files in this package

No runtime behavior changes in this phase.

Acceptance:
- docs are committed;
- agent can explain the target architecture from docs;
- no app code modified.

## Phase 1 — Backend foundation

Create a backend folder:

```txt
backend/
  src/
    routes/
    services/
    providers/
    jobs/
    middleware/
    config/
    prisma/
  package.json
  tsconfig.json
  Dockerfile
```

Recommended dependencies:
- express or nestjs
- prisma
- @prisma/client
- zod
- jsonwebtoken or session library
- bcrypt or argon2
- bullmq
- ioredis
- dotenv
- cors
- helmet

Add:
- `/health`
- `/api/health`
- environment validation
- structured logger
- error handler
- request id middleware

Acceptance:
- backend starts locally;
- health endpoint works;
- no connection to production Supabase required;
- no existing Next.js behavior broken.

## Phase 2 — Prisma and PostgreSQL tenant schema

Add Prisma schema for:
- Organization
- Restaurant
- User
- OrganizationUser
- RestaurantUser
- Customer
- RestaurantTable
- ReservationRequest
- Reservation
- Conversation
- Message
- IntegrationConnection
- OutboundMessage
- MessageTemplate
- AutomationRule
- ToolLog
- IntegrationEvent

Add seed script:
- default organization;
- default restaurant;
- default owner user;
- initial tables;
- default message templates;
- disabled automation rules.

Acceptance:
- `prisma migrate dev` works;
- `prisma generate` works;
- seed creates one usable restaurant;
- all restaurant-specific models include `restaurantId`.

## Phase 3 — Auth and tenant context

Replace simple admin password model in the new backend with user-based auth.

Minimum roles:
- PLATFORM_ADMIN
- OWNER
- MANAGER
- STAFF

Rules:
- PLATFORM_ADMIN can access platform-level routes.
- OWNER can manage all data and integrations for their restaurants.
- MANAGER can manage reservations, inbox, customers, limited settings.
- STAFF can manage reservations and inbox only.
- If user has one restaurant, auto-select it.
- If user has multiple restaurants, selected restaurant must be explicit.

Add middleware:
- authenticate user;
- resolve restaurant context;
- authorize role;
- enforce restaurant scoping.

Acceptance:
- no route accesses restaurant data without restaurant context;
- tenant scoping cannot be bypassed by sending another restaurant id;
- tests cover restaurant isolation.

## Phase 4 — Vapi flow migration

Move Vapi business logic from Next.js/Supabase routes into backend services.

Target endpoint examples:

```txt
POST /api/webhooks/vapi/:publicWebhookKey/create-reservation-request
POST /api/webhooks/vapi/:publicWebhookKey/change-reservation-request
POST /api/webhooks/vapi/:publicWebhookKey/cancel-reservation-request
POST /api/webhooks/vapi/:publicWebhookKey/staff-handoff
```

Preserve current behavior:
- parse Vapi payload;
- normalize fields;
- validate missing data;
- upsert customer;
- create conversation/message where appropriate;
- create reservation request;
- create tool log;
- return Vapi-compatible response.

Acceptance:
- existing Vapi test payloads still pass;
- new records include `restaurantId`;
- current admin UI can still show reservation requests during transition;
- no loss of raw payload logging.

## Phase 5 — Integration settings UI

Create integration settings screens:

```txt
/admin/settings/integrations
/admin/settings/vapi
/admin/settings/sms
/admin/settings/whatsapp
/admin/settings/instagram
/admin/settings/website-widget
```

Each integration card should show:
- status;
- provider;
- display name;
- last tested time;
- last error;
- enable/disable;
- test connection;
- webhook URL;
- setup instructions.

Acceptance:
- restaurant owner can configure integration values from UI;
- credentials are encrypted before storage;
- only masked values are shown after save;
- test buttons create integration events/logs.

## Phase 6 — Central inbox

Add:

```txt
/admin/inbox
```

Features:
- list conversations across all channels;
- filter by channel/status;
- open conversation;
- see messages;
- send reply when provider supports it;
- link/create customer;
- create reservation request from conversation;
- assign to staff;
- close/archive conversation.

Acceptance:
- Vapi, web form, WhatsApp, Instagram can all map to the same inbox model;
- no separate channel silo screens are required for daily work.

## Phase 7 — Website reservation form/widget

Add public pages:

```txt
/reserve/:restaurantSlug
/widget/reservation/:restaurantSlug
```

Add backend endpoint:

```txt
POST /api/public/restaurants/:slug/reservation-request
```

Security:
- rate limit;
- honeypot;
- validation;
- no admin credentials;
- restaurant resolved by slug/public key;
- optional allowed origins.

Acceptance:
- customer can submit reservation request;
- request appears in inbox/reservation list;
- optional SMS/WhatsApp acknowledgement can be triggered if enabled.

## Phase 8 — SMS provider and automation

Implement provider abstraction:
- SmsProvider interface;
- first concrete provider based on restaurant's current SMS system;
- CustomHttpSmsProvider as fallback if provider API is simple.

Add automation triggers:
- reservation request received;
- reservation confirmed;
- reservation rejected;
- reservation cancelled;
- reminder before reservation.

Use worker queue:
- queue outbound message;
- send;
- retry;
- mark sent/failed;
- log provider response.

Acceptance:
- owner configures SMS from UI;
- test SMS works;
- confirmation SMS can be sent from reservation action;
- reminder jobs can be scheduled.

## Phase 9 — WhatsApp integration

Implement provider options:
- Meta Cloud API for long-term production;
- Evolution API for faster MVP if needed.

Add webhook:
- verify token;
- inbound message handling;
- customer matching by phone;
- conversation state;
- reservation intent detection;
- missing field collection;
- handoff to staff.

Acceptance:
- inbound WhatsApp message creates/updates conversation;
- reservation intent creates request after required fields collected;
- panel reply sends WhatsApp message;
- provider-specific code is isolated.

## Phase 10 — Instagram integration

Implement Meta webhook handling:
- verify webhook;
- receive DMs;
- map sender to customer/conversation;
- reservation intent detection;
- missing information flow;
- panel reply.

Acceptance:
- Instagram DMs appear in central inbox;
- staff can reply;
- reservation request can be created from DM.

## Phase 11 — Supabase data migration

Export and import:
- calls
- reservation_requests
- reservation_changes
- reservation_cancellations
- staff_handoffs
- tool_logs
- customers
- tables

Map to target schema.

Acceptance:
- old data appears under default restaurant;
- old Vapi identifiers retained where useful;
- counts match after migration;
- rollback plan documented.

## Phase 12 — Production deployment

Target:
- one VPS;
- Docker Compose;
- Traefik;
- PostgreSQL;
- Redis;
- backend API;
- frontend;
- worker.

Acceptance:
- first restaurant uses same deployment;
- no separate domain/VPS required;
- backups are configured;
- logs are inspectable;
- environment secrets are not committed.
