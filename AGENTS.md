# AGENTS.md — Sesli Agent Restaurant Platform Migration Guide

This file is the entry point for any coding agent working on this repository.

## Project context

This repository currently contains a production-oriented Golden Meat inbound call management application using Next.js, Supabase, and Vapi.

The current application:
- receives restaurant reservation calls through Vapi;
- writes call and reservation data to Supabase;
- shows reservations, calls, customers, tables, handoffs, changes, cancellations, analytics, tool logs, and settings in the admin UI;
- currently uses a simple admin password/session model;
- is expected to evolve into a multi-tenant restaurant communication and reservation platform.

The target system must support:
- Vapi phone calls;
- WhatsApp reservations and messages;
- Instagram DM reservations and messages;
- website reservation forms/widgets;
- SMS sending and automation;
- centralized inbox;
- tenant-aware restaurant management;
- UI-managed integrations, similar in spirit to the Dental CRM integration screens;
- a controlled migration away from direct Supabase dependency toward a dedicated backend + PostgreSQL architecture.

## Non-negotiable rules

1. Do not break the current Vapi reservation flow while migrating.
2. Do not implement new channel integrations as hardcoded environment-only features.
3. All new business data must be designed as tenant-aware from the beginning.
4. Every table that stores restaurant-specific data must include `restaurantId` or a clearly equivalent tenant reference.
5. Every integration must be configurable from the UI.
6. Credentials must not be stored in plain text.
7. Provider-specific logic must be isolated behind provider adapters.
8. Webhooks must resolve the correct restaurant/tenant securely.
9. SMS, WhatsApp, Instagram, and reminder sending must be job/queue-friendly.
10. Keep the first production use case simple: one restaurant, one deployment, one VPS, one database, but with multi-tenant foundations.

## Read these documents before coding

Read in this order:

1. `docs/00_PROJECT_CONTEXT.md`
2. `docs/01_ARCHITECTURE_DECISIONS.md`
3. `docs/02_TARGET_DATABASE_SCHEMA.md`
4. `docs/03_IMPLEMENTATION_PLAN.md`
5. `docs/04_INTEGRATIONS_GUIDE.md`
6. `docs/05_MIGRATION_FROM_SUPABASE.md`
7. `docs/06_SECURITY_AND_TENANCY_RULES.md`
8. `docs/07_TESTING_AND_ACCEPTANCE.md`
9. `docs/08_ENVIRONMENT_TEMPLATE.md`

## Current repo facts to preserve

Current stack:
- Next.js
- React
- TypeScript
- Supabase client
- Vapi endpoint routes
- Supabase SQL migrations

Existing important concepts:
- `calls`
- `reservation_requests`
- `reservation_changes`
- `reservation_cancellations`
- `staff_handoffs`
- `tool_logs`
- `customers`
- `tables`
- admin session protection via `requireAdminSession`

The migration should preserve the current behavior while progressively moving business logic into a dedicated backend.

## Target high-level architecture

```txt
Frontend: Next.js admin/public UI
Backend: Node.js Express or NestJS API
Database: PostgreSQL
ORM: Prisma
Queue: Redis + BullMQ
Deployment: Docker Compose + Traefik
Integrations: Vapi, SMS provider, WhatsApp provider, Instagram provider, Website widget/form
```

## First delivery goal

The first delivery should not try to build everything.

Initial target:
- introduce multi-tenant models;
- seed one default organization and one default restaurant;
- prepare backend structure;
- prepare Prisma schema;
- migrate or mirror current Vapi reservation creation flow;
- keep the current app usable for the first restaurant;
- create UI placeholders for integrations;
- do not add real WhatsApp/Instagram production behavior before the core tenant and integration model is in place.

## Preferred branch strategy

Use small branches by phase:

```txt
feature/platform-docs
feature/backend-foundation
feature/tenant-model
feature/vapi-backend-migration
feature/integration-settings-ui
feature/central-inbox
feature/website-reservations
feature/sms-provider
feature/whatsapp-provider
feature/instagram-provider
```

## Validation before each PR

Minimum checks:
- typecheck passes;
- build passes;
- existing Vapi flow still works;
- tenant scoping is enforced in new code;
- no credentials or tokens are logged;
- webhook endpoints reject invalid or unknown public keys;
- new provider code is covered by tests where practical.

## Important implementation preference

Do not self-host Supabase as the long-term solution. The target is a dedicated backend with PostgreSQL, Prisma, and worker infrastructure. Supabase may remain temporarily during migration, but new critical integration logic should be designed for the target backend.
