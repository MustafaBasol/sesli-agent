# 05 — Migration From Supabase

## Goal

Move from the current Next.js + Supabase-centric implementation to a dedicated backend + PostgreSQL + Prisma system without breaking the existing first restaurant workflow.

## Current Supabase concepts

Existing tables include:
- `calls`
- `reservation_requests`
- `reservation_changes`
- `reservation_cancellations`
- `staff_handoffs`
- `tool_logs`
- `customers`
- `tables`

These must be preserved or mapped into the new schema.

## Migration principles

1. Do not perform a big-bang rewrite.
2. Keep current app working during transition.
3. Add new backend and database in parallel.
4. Migrate one flow at a time.
5. Validate counts and sample records.
6. Keep old identifiers where useful.
7. Add rollback path for each phase.

## Target mapping

| Supabase table | Target table/model |
|---|---|
| `customers` | `Customer` |
| `tables` | `RestaurantTable` |
| `reservation_requests` | `ReservationRequest` |
| `reservation_changes` | `ReservationRequest` with `requestType=change`, or separate model if needed |
| `reservation_cancellations` | `ReservationRequest` with `requestType=cancel`, or separate model if needed |
| `staff_handoffs` | `Conversation` + `Message` + optional `StaffHandoff` later |
| `calls` | `Conversation`/`ToolLog`, or keep `VoiceCall` if needed |
| `tool_logs` | `ToolLog` |

## Recommended staged migration

### Stage 1 — Mirror schema

Create Prisma models that can represent all current data.

Add `restaurantId` to all imported records.

Seed:
- organization;
- restaurant;
- owner user.

### Stage 2 — Export Supabase data

Export from Supabase:
- use SQL export;
- or use a Node script with Supabase service role;
- store exports temporarily outside the repo or in ignored files.

Never commit production customer data.

### Stage 3 — Import into PostgreSQL

Write import script:

```txt
backend/scripts/import-supabase-data.ts
```

Import order:
1. organization/restaurant seed;
2. customers;
3. restaurant tables;
4. calls/tool logs;
5. reservation requests;
6. changes/cancellations;
7. handoffs/messages.

### Stage 4 — Validate

Validation script should check:
- source and target record counts;
- sample customer by phone;
- sample reservation by date;
- sample Vapi call id/tool log;
- no records missing `restaurantId`.

### Stage 5 — Route migration

Move active routes gradually:
1. Vapi create reservation;
2. Vapi change reservation;
3. Vapi cancellation;
4. staff handoff;
5. admin reads;
6. admin writes.

### Stage 6 — Decommission Supabase writes

Once all writes go to the new backend:
- mark Supabase read-only;
- keep backup;
- remove direct Supabase writes from Next.js;
- update README.

## Compatibility fields

During migration, keep legacy fields where helpful:
- `vapiCallId`
- `legacySupabaseId`
- `sourceExternalId`
- `rawPayload`

Do not remove legacy fields until all historical views and debugging needs are covered.

## Rollback plan

For each migrated endpoint:
- keep old route implementation available behind a feature flag temporarily;
- log whether request is handled by old or new backend;
- allow switching back if the new route fails.

Example feature flags:
- `USE_BACKEND_FOR_VAPI_CREATE=true`
- `USE_BACKEND_FOR_ADMIN_RESERVATIONS=true`

## Data safety

Do not commit:
- customer data;
- phone numbers;
- production payloads;
- Supabase service keys;
- provider credentials;
- SMS tokens;
- WhatsApp tokens;
- Vapi token.
