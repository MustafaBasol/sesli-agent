# 06 — Security and Tenancy Rules

## Tenant isolation

Every restaurant-specific query must be scoped by `restaurantId`.

Bad:

```ts
prisma.reservation.findMany()
```

Good:

```ts
prisma.reservation.findMany({
  where: { restaurantId: ctx.restaurantId }
})
```

Bad:

```ts
prisma.reservation.update({
  where: { id },
  data
})
```

Good:

```ts
await prisma.reservation.updateMany({
  where: { id, restaurantId: ctx.restaurantId },
  data
})
```

Or fetch with `id + restaurantId`, then update only after ownership is verified.

## Restaurant context

Backend must resolve restaurant context from:
- authenticated user's selected restaurant;
- webhook public key for inbound provider calls;
- public restaurant slug for website form;
- platform admin route when explicitly allowed.

## Roles

Initial roles:
- PLATFORM_ADMIN
- OWNER
- MANAGER
- STAFF

### PLATFORM_ADMIN

Can:
- access all restaurants;
- manage platform-level settings;
- inspect logs.

### OWNER

Can:
- manage restaurant settings;
- manage integrations;
- manage users;
- manage reservations/inbox/customers.

### MANAGER

Can:
- manage reservations;
- manage inbox;
- manage customers;
- view limited settings;
- test integrations if allowed.

### STAFF

Can:
- view and update assigned/open reservations;
- reply in inbox if allowed;
- cannot change credentials/integrations.

## Credential storage

Never store provider credentials in plain text.

Use:
- `credentialsEncrypted`
- encryption/decryption service
- global `CREDENTIAL_ENCRYPTION_KEY` environment variable

Only show masked values in UI.

Example:
```txt
••••••••••••abcd
```

## Logging rules

Never log:
- access tokens;
- API keys;
- provider secrets;
- customer full raw payloads when they contain sensitive data, unless necessary and protected;
- authorization headers.

When logging phone numbers, prefer masked values:
```txt
+33******9141
```

## Webhook security

Webhook endpoints must:
- resolve integration by `publicWebhookKey`;
- reject unknown public keys;
- verify provider signature/token when available;
- avoid exposing raw `restaurantId`;
- rate limit where practical;
- store raw payload only after restaurant is resolved.

Webhook URL pattern:

```txt
/api/webhooks/{channel}/{publicWebhookKey}/...
```

## Website form security

Public reservation form must include:
- rate limiting;
- honeypot;
- input validation;
- optional origin restriction later;
- no admin cookie/session dependence;
- no sensitive error messages.

## Message sending safety

Outbound messages must:
- be queued;
- be logged;
- have retry limits;
- never be sent twice accidentally for the same trigger;
- respect automation enabled/disabled flag;
- include opt-out handling later for marketing messages.

## Production token rules

Production webhook verify tokens must be strong random values.

Do not use test words such as:
- `dentheria`
- `test`
- `secret`
- restaurant name
- provider name

Use long random secrets.

## Data retention

Add retention later for:
- raw webhook payloads;
- provider events;
- old message bodies;
- failed logs.

Do not delete core reservation/customer records without a clear product/legal decision.
