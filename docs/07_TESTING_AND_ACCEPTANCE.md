# 07 — Testing and Acceptance

## General rule

Every phase must keep the existing application usable.

At minimum:
- typecheck;
- build;
- basic route smoke tests;
- Vapi reservation flow test;
- tenant isolation tests once backend exists.

## Test categories

### Backend foundation

- health endpoint returns ok;
- environment validation works;
- invalid env fails safely;
- global error handler returns expected shape.

### Tenant model

Test:
- user with one restaurant is auto-scoped;
- user cannot access another restaurant's reservation;
- restaurant owner can see own data;
- staff cannot access integration credentials;
- platform admin can access all restaurants only through platform routes.

### Vapi flow

Test payload variations:
- direct JSON;
- nested Vapi tool call;
- missing customer name;
- missing phone;
- missing date;
- missing time;
- missing party size;
- invalid date;
- invalid time;
- phone normalization.

Expected:
- valid request creates customer + reservation request + tool log;
- invalid request returns Vapi-compatible missing fields response;
- all records include `restaurantId`.

### Integration settings

Test:
- owner can save integration settings;
- staff cannot save integration settings;
- credentials are encrypted;
- masked credentials are returned;
- test action creates integration event;
- invalid provider config is rejected.

### Inbox

Test:
- conversation list scoped by restaurant;
- message list scoped by restaurant;
- reply creates outbound message;
- closing conversation works;
- creating reservation request from conversation works.

### Website form

Test:
- valid public reservation request creates record;
- unknown restaurant slug returns 404;
- honeypot rejects spam;
- invalid date/time rejected;
- rate limit works where implemented.

### SMS

Test:
- queued outbound message is created;
- provider success marks sent;
- provider failure marks failed;
- retry increments attempt count;
- disabled automation does not send;
- enabled confirmation automation sends once.

### WhatsApp

Test:
- webhook verify succeeds/fails correctly;
- inbound message creates conversation;
- known customer matched by normalized phone;
- missing fields update conversation state;
- complete reservation intent creates reservation request.

### Instagram

Test:
- webhook verify succeeds/fails correctly;
- DM creates conversation;
- staff can reply if provider configured;
- reservation request creation from DM works.

## Acceptance checklist before production

- No hardcoded restaurant id in business logic except seed/default dev helper.
- No unscoped restaurant data query.
- No provider token logged.
- No credentials returned unmasked.
- Webhook unknown key rejected.
- Vapi current flow still works.
- SMS test works in sandbox/test provider.
- Backup strategy documented.
- Deployment instructions updated.
