# 10 — Dental CRM Reuse Guide

This document is mandatory for any agent working on the restaurant platform migration.

The restaurant platform must not be built as a complete greenfield rewrite when equivalent, tested patterns already exist in the Dental CRM project. The agent must inspect the Dental CRM codebase and reuse/adapt suitable patterns before implementing new versions.

## Why this matters

The Dental CRM project already solved many of the same architectural problems:

- Express/Node backend structure;
- Prisma/PostgreSQL data modeling;
- role-based authorization;
- organization/clinic scoping;
- WhatsApp provider abstraction;
- Meta WhatsApp Cloud API vs Evolution API separation;
- webhook processing;
- conversation state handling;
- inbound/outbound message logging;
- Meta approved template handling;
- template status sync;
- contact/request separation;
- privacy and data retention jobs;
- production deployment with Docker/Traefik;
- frontend integration/settings screens.

The restaurant platform should reuse these patterns and adapt domain names rather than rebuilding the same concepts from scratch.

## Where to inspect first

If available locally, inspect:

```txt
E:\Ek Gelir\Siteler\DisKlinikCRM-git
```

If the Dental CRM repository is available on GitHub or another local path, use that source instead.

Before implementing each phase, the agent should search the Dental CRM codebase for relevant concepts.

Suggested search terms:

```txt
authorize
getAccessibleClinicIds
validateAndGetClinicIdScope
MessageTemplate
WhatsApp
Meta WhatsApp
Evolution
sendTemplateMessage
ContactRequest
AppointmentRequest
conversation state
WhatsAppConversation
metaTemplate
dataRetention
PlatformSetting
Integration
webhook
```

## Domain mapping

Use this mapping when adapting code or patterns:

| Dental CRM concept | Restaurant platform concept |
|---|---|
| Organization | Organization |
| Clinic | Restaurant |
| clinicId | restaurantId |
| Patient | Customer |
| Appointment | Reservation |
| AppointmentRequest | ReservationRequest |
| ContactRequest | ContactRequest / Conversation / StaffHandoff |
| Practitioner / Dentist | Staff / Manager |
| TreatmentCase | Not directly applicable |
| Payment | Later phase only |
| MessageTemplate | MessageTemplate |
| WhatsAppConversationState | Conversation.stateJson |
| WhatsAppConversationMessage | Message |
| WhatsAppInboxEntry | Conversation / Inbox item |
| No-show recovery | Reservation no-show recovery |
| Post-treatment follow-up | Post-visit / review / thank-you follow-up |
| PlatformSetting | PlatformSetting / runtime settings |
| Clinic settings | Restaurant settings |

## Reuse priority by phase

### Phase 1 — Backend foundation

The initial backend foundation may already exist in this repository, but future cleanup should align with the Dental CRM backend patterns where useful.

Reuse/adapt:
- Express app structure;
- route registration pattern;
- error handling style;
- logger redaction concepts;
- environment validation style;
- Docker Compose conventions.

Do not blindly copy code if the new backend foundation is already cleaner. Prefer the simpler version, but keep Dental CRM’s production lessons.

### Phase 2 — Prisma schema and seed

Reuse/adapt these Dental CRM ideas:
- organization/clinic hierarchy;
- tenant scoping via `clinicId`, adapted to `restaurantId`;
- user-role relationships;
- platform admin separation if present;
- Prisma migration/seed structure;
- safe seed scripts.

Important:
- Do not design the restaurant system as single-tenant.
- Do not use hardcoded restaurant ids in business logic.
- Seed only one default organization and one default restaurant for the first customer.

### Phase 3 — Auth and authorization

This is one of the most important areas to reuse from Dental CRM.

Inspect and adapt:
- `authorize()` middleware;
- role allow-list pattern;
- accessible clinic/tenant helpers;
- request user context;
- multi-clinic access rules.

Adapt to restaurant roles:
- PLATFORM_ADMIN
- OWNER
- MANAGER
- STAFF

Important production lesson from Dental CRM:
- Do not use a JWT default clinic/restaurant id as the sole authorization scope.
- Always verify the target record belongs to one of the user's accessible restaurants.
- List/detail/update routes must all scope by accessible restaurant ids.
- Background polling and frontend hidden modules must not call endpoints the user role cannot access.

### Phase 4 — Vapi migration

The Vapi flow is restaurant-specific, but the service-layer pattern should resemble Dental CRM’s message/request handling:

- parse inbound payload;
- normalize phone;
- match/create customer;
- create request record;
- create conversation state/log records;
- return provider-compatible response;
- keep raw payload safely;
- avoid leaking secrets in logs.

Do not connect WhatsApp/Instagram before the core tenant and request models are ready.

### Phase 5 — Integration settings UI

Reuse/adapt Dental CRM patterns for:
- provider settings screens;
- active/inactive status;
- test connection actions;
- masked credentials;
- status badges;
- polling only for allowed roles;
- role-gated navigation.

The restaurant platform must support UI-managed integrations:
- Vapi;
- SMS;
- WhatsApp;
- Instagram;
- Website widget.

Do not rely only on `.env` for tenant-specific provider credentials.

### Phase 6 — Central inbox

Reuse/adapt Dental CRM’s WhatsApp inbox/contact request ideas.

Restaurant target:
- one inbox for Vapi/voice summaries, WhatsApp, Instagram, website reservations, SMS replies later;
- conversations are channel-aware;
- messages are logged;
- staff can convert conversation into reservation request;
- handoff requests appear in the same operational area.

Dental CRM concepts to inspect:
- WhatsApp inbox entries;
- contact requests;
- appointment requests;
- unread badges;
- role-gated polling;
- conversation state display.

### Phase 7 — Website reservation form

This is restaurant-specific. Reuse only generic validation/security patterns:
- Zod validation;
- rate limiting if present;
- tenant resolution by public slug/key;
- no admin session dependence;
- audit/log patterns where useful.

### Phase 8 — SMS provider and automation

Dental CRM may have email/SMS-related patterns or message queue patterns. Reuse if present.

Must design like Dental CRM’s WhatsApp outbound logic:
- provider adapter;
- outbound message log;
- retry-safe sending;
- template-based messages;
- automation rules;
- no duplicate sends for same trigger.

### Phase 9 — WhatsApp integration

This is the highest-priority reuse area.

Reuse/adapt from Dental CRM:
- WhatsApp provider abstraction;
- Meta Cloud vs Evolution provider separation;
- inbound webhook processing;
- message safety checks;
- conversation state JSON handling;
- phone normalization and phone matching;
- template-based Meta sending;
- plain text sending for Evolution where appropriate;
- provider response logging;
- webhook token verification;
- staff handoff/contact request creation;
- tests around shared phone/conversation state if relevant.

Important adaptations:
- Dental CRM patients become restaurant customers.
- Dental appointments become reservations.
- Dental appointment requests become reservation requests.
- Clinic-specific settings become restaurant-specific settings.
- Template purposes should be restaurant-specific:
  - `reservation_received`
  - `reservation_confirmed`
  - `reservation_rejected`
  - `reservation_cancelled`
  - `reservation_reminder`
  - `reservation_no_show_recovery`
  - `post_visit_thank_you`

### Phase 10 — Instagram integration

Reuse/adapt Dental CRM’s Instagram handling if present:
- webhook verification;
- inbound DM parsing;
- staff handoff/callback/info intent handling;
- creation/update of contact requests;
- logging and role-gated UI.

Restaurant adaptation:
- info/callback/staff handoff become general inquiry or reservation inquiry;
- completed reservation intent creates a reservation request;
- unresolved messages stay in central inbox.

### Phase 11 — Privacy and retention

Reuse/adapt Dental CRM’s data retention patterns later:
- runtime toggle;
- env hard-kill switch;
- dry-run endpoint;
- scheduled cleanup job;
- redaction/anonymization instead of unsafe deletion;
- platform admin controls.

Do not implement retention too early, but keep model design compatible.

## Code reuse rules

The agent may reuse code by copying/adapting only when:
- the source code exists in the user's Dental CRM project;
- the code is compatible with the restaurant platform stack;
- clinic/patient/dental concepts are renamed and adapted correctly;
- tests are updated;
- tenant scoping remains correct;
- secrets and credentials are not copied;
- no production data is copied.

The agent must not:
- copy irrelevant dental domain modules such as treatment cases, dental chart, insurance, medical records, or procedure stock logic;
- copy hardcoded clinic-specific demo data;
- copy production credentials;
- copy old bugs or patterns that were later fixed;
- mix clinicId and restaurantId naming in new code.

## Known Dental CRM lessons to preserve

### Shared/default tenant caution

A user may have a default clinic/restaurant for UI convenience. This must not be treated as authorization.

Always authorize based on accessible restaurant ids.

### Hidden UI polling caution

Frontend should not poll endpoints for modules hidden from the current role.

If STAFF cannot manage integrations, integration polling must not call integration endpoints for STAFF.

### Provider fallback caution

For Meta Cloud API template-required flows, do not silently fall back to plain-text sending if approved templates are required.

For Evolution-style providers, plain text may be acceptable.

### Webhook token caution

Production verify tokens must be strong random secrets and must match provider dashboards exactly.

### Conversation state caution

When storing state JSON, always read back every field required by subsequent steps. Bugs can occur when fields are written but not parsed back.

### Phone matching caution

Normalize phones and include fallback matching. Do not rely only on exact string equality.

## Expected agent behavior

Before implementing a feature, the agent should report:

```txt
Dental CRM reuse check:
- searched files/terms:
- reusable patterns found:
- reused/adapted:
- intentionally not reused:
- reason:
```

If the agent cannot access Dental CRM code, it must say so and continue using the documented patterns without pretending it inspected the code.

## Phase 2 addendum

When implementing Phase 2 now, inspect Dental CRM before finalizing:
- Prisma organization/clinic/user models;
- role and tenant relationships;
- MessageTemplate model;
- WhatsApp-related models;
- platform settings if any.

Then adapt only the generic parts needed for the restaurant schema.
