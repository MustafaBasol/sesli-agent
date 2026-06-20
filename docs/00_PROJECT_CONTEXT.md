# 00 — Project Context

## Current product

The current application is a restaurant inbound call management system for Golden Meat. It receives phone-based reservation requests through Vapi, writes structured data into Supabase, and provides an admin UI for the restaurant owner/staff.

The current application is useful and should not be broken. The goal is to evolve it, not replace it abruptly.

## Current business workflow

Current flow:

```txt
Customer phone call
  ↓
Vapi assistant
  ↓
Vapi tool endpoint in Next.js
  ↓
Supabase tables
  ↓
Admin panel
```

The important existing flow is reservation creation:
- parse Vapi payload;
- normalize customer name, phone, date, time, party size;
- upsert customer;
- insert reservation request;
- log call/tool activity;
- return a Vapi response.

## Target product

The target product is a multi-channel restaurant reservation and communication platform.

The platform should centralize:
- phone calls from Vapi;
- WhatsApp messages;
- Instagram DMs;
- website reservation forms;
- manual reservations;
- SMS notifications and reminders;
- staff handoffs;
- customer history;
- centralized inbox.

## Target business workflow

Target flow:

```txt
Phone / WhatsApp / Instagram / Website / Manual
  ↓
Webhook or API endpoint
  ↓
Tenant-aware backend
  ↓
Conversation + Message + Reservation Request models
  ↓
Central inbox
  ↓
Reservation confirmation / rejection / change / cancellation
  ↓
Automated SMS / WhatsApp / Instagram responses where appropriate
```

## Strategic decision

The project should move away from direct Supabase-centric business logic toward a dedicated backend with PostgreSQL, Prisma, Redis/BullMQ workers, and provider adapters.

Supabase can remain temporarily during transition, but it should not be the permanent foundation for multi-tenant automation and integration logic.

## First customer requirement

The first restaurant should use the platform immediately without:
- a separate VPS;
- a separate domain;
- a separate deployment;
- a separate database.

However, the system must be designed as multi-tenant from day one.

This means:
- one deployment;
- one backend;
- one database;
- first restaurant seeded as the only active tenant;
- all restaurant-specific data scoped by `restaurantId`;
- future restaurants can be added without re-architecting.

## Long-term productization direction

Later phases may add:
- subscription plans;
- tenant onboarding;
- Stripe billing;
- custom domains;
- subdomains;
- plan limits;
- usage-based SMS/WhatsApp pricing;
- white-label settings;
- platform admin dashboard.
