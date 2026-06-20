# 01 — Architecture Decisions

## Decision 1 — Keep Next.js for frontend, move business logic to backend

Current Next.js API routes are acceptable for MVP, but long-term integration-heavy workflows should move to a dedicated backend.

Target split:

```txt
Next.js
- admin panel
- public reservation page
- website widget/iframe page
- auth UI
- settings UI

Backend API
- Vapi webhooks/tools
- WhatsApp webhooks
- Instagram webhooks
- website reservation API
- SMS sending
- automation rules
- queue scheduling
- provider integrations
- tenant authorization
```

## Decision 2 — Use dedicated PostgreSQL + Prisma

Avoid making Supabase the permanent core of the platform.

Target:
- PostgreSQL database;
- Prisma ORM;
- explicit migrations;
- seed scripts;
- backup strategy under our control.

Supabase may be used only as a temporary existing source during migration.

## Decision 3 — Use Redis + BullMQ for asynchronous work

Required for:
- SMS reminders;
- WhatsApp retries;
- Instagram retries;
- webhook processing;
- rate-limited provider calls;
- scheduled reservation reminders;
- failed message retry;
- provider status checks.

Do not rely on request/response lifecycle for operations that can fail or take time.

## Decision 4 — Multi-tenant foundation from the beginning

Even if only one restaurant uses the app initially, all restaurant-specific tables must include `restaurantId`.

Core tenant hierarchy:

```txt
Organization
  ↓
Restaurant
  ↓
Users through RestaurantUser
```

The first production deployment will seed:
- one organization;
- one restaurant;
- one owner user.

## Decision 5 — UI-managed integrations

Integrations must be configured from the UI, not only from `.env`.

Examples:
- Vapi API key / assistant / phone number / webhook key;
- SMS provider credentials;
- WhatsApp Meta/Evolution settings;
- Instagram business account settings;
- website widget settings.

Only global secrets such as credential encryption key should remain in `.env`.

## Decision 6 — Provider adapter pattern

Never scatter provider-specific code across routes.

Use service/provider classes:

```txt
providers/
  sms/
    SmsProvider.ts
    NetgsmSmsProvider.ts
    TwilioSmsProvider.ts
    CustomHttpSmsProvider.ts
  whatsapp/
    WhatsAppProvider.ts
    MetaWhatsAppProvider.ts
    EvolutionWhatsAppProvider.ts
  instagram/
    InstagramProvider.ts
    MetaInstagramProvider.ts
  voice/
    VapiProvider.ts
```

## Decision 7 — Centralized inbox before deep automation

The central inbox is the operational heart of the product.

Do not build independent WhatsApp, Instagram, Vapi, and website screens that fragment the workflow.

All channels should map into:
- conversation;
- inbound/outbound message;
- reservation request;
- customer;
- staff handoff when needed.

## Decision 8 — Do not hard-delete operational records early

Reservations, conversations, messages, tool logs, and outbound message logs are important for support and debugging.

Prefer:
- status changes;
- archival;
- retention policies later;
- anonymization/redaction for privacy.

## Decision 9 — Keep first version simple for the restaurant

The UI should not expose tenant complexity to the first restaurant.

If a user has access to only one restaurant:
- auto-select it;
- hide restaurant switcher;
- keep navigation simple.

If later a user has access to multiple restaurants:
- show restaurant switcher;
- scope all screens to selected restaurant.
