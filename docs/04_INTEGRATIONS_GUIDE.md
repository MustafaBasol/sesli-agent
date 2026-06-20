# 04 — Integrations Guide

All integrations must be tenant-aware and UI-configurable.

## Core table

Use `IntegrationConnection` as the single source of truth for integration setup.

Required fields:
- `restaurantId`
- `channel`
- `provider`
- `status`
- `publicWebhookKey`
- `configJson`
- `credentialsEncrypted`
- `webhookVerifyTokenHash`
- `lastConnectedAt`
- `lastTestedAt`
- `lastError`

## Integration settings UI

Main screen:

```txt
/admin/settings/integrations
```

Cards:
- Vapi
- SMS
- WhatsApp
- Instagram
- Website Widget
- Email later

Each card:
- provider name;
- active/inactive/error;
- configure button;
- test button;
- last error;
- webhook URL where applicable.

## Vapi

### Required UI fields

- Vapi API key
- Assistant ID
- Phone number ID
- Webhook public key
- Default language
- Enabled tools

### Webhook URL pattern

```txt
https://app.example.com/api/webhooks/vapi/{publicWebhookKey}/create-reservation-request
```

Do not expose raw `restaurantId` in webhook URLs. Use a random public webhook key.

### Vapi flow requirements

For reservation creation:
- parse payload;
- normalize phone;
- normalize date/time;
- normalize party size;
- create/update customer;
- create conversation/message/tool log;
- create reservation request;
- return Vapi-compatible response.

## SMS

### Provider strategy

Implement:

```ts
interface SmsProvider {
  sendSms(input: {
    to: string
    body: string
    from?: string
    metadata?: Record<string, unknown>
  }): Promise<{
    providerMessageId?: string
    rawResponse?: unknown
  }>
}
```

Candidate providers:
- current restaurant SMS provider;
- Netgsm;
- Twilio;
- OVH;
- Brevo SMS;
- Custom HTTP provider.

### Required UI fields

Provider-dependent:
- provider type;
- API key / username;
- password / secret;
- sender name;
- test phone number;
- default country code;
- active/inactive.

### Automation triggers

Initial triggers:
- `reservation_request_received`
- `reservation_confirmed`
- `reservation_rejected`
- `reservation_cancelled`
- `reservation_reminder_before`

### SMS logging

Every SMS must create/update `OutboundMessage`.

Statuses:
- queued
- sent
- failed
- delivered, if provider supports delivery reports

## WhatsApp

### Provider options

Support provider abstraction.

Possible providers:
- Meta Cloud API
- Evolution API

Use Meta Cloud for long-term productization. Evolution may be faster for MVP but must remain behind the provider interface.

### Required UI fields for Meta

- WhatsApp Business Account ID
- Phone Number ID
- Access Token
- App Secret
- Webhook Verify Token
- Default template language

### Required UI fields for Evolution

- Server URL
- Instance Name
- API Key
- QR status
- Webhook URL

### Webhook requirements

Inbound webhook must:
- verify token/signature when provider supports it;
- resolve integration by public key;
- resolve restaurant;
- normalize sender phone;
- find or create customer;
- find or create conversation;
- store inbound message;
- run intent detection;
- update conversation state;
- create reservation request only when required fields are present.

### Message templates

For Meta Cloud API, template rules may apply. Keep message template records channel/provider aware.

## Instagram

### Required UI fields

- Meta Page ID
- Instagram Business Account ID
- Access Token
- Webhook Verify Token
- App Secret

### Inbound flow

Instagram DM should:
- resolve restaurant by integration;
- create/update conversation;
- store message;
- optionally detect reservation intent;
- ask missing fields;
- create reservation request when complete.

Instagram should be added after WhatsApp because the same conversation/inbox/state architecture can be reused.

## Website Widget

### Public reservation page

```txt
/reserve/{restaurantSlug}
```

### Iframe widget

```html
<iframe src="https://app.example.com/widget/reservation/{restaurantSlug}"></iframe>
```

### Script widget, later

```html
<script src="https://app.example.com/widget.js" data-restaurant="restaurant-slug"></script>
```

Start with iframe. Add script widget later only if needed.

### Form fields

- name
- phone
- email optional
- party size
- date
- time
- special request
- seating preference optional

### Security

- rate limit;
- honeypot;
- validation;
- allowed origins later;
- no admin cookies required;
- no service role exposure.

## Integration test actions

Each integration should support a test action where practical.

Examples:
- Vapi: validate stored API key / assistant ID if API available.
- SMS: send test SMS.
- WhatsApp: send test message or validate token.
- Instagram: validate account/page token.
- Website widget: preview form and submit dry-run.

Every test should create an `IntegrationEvent`.
