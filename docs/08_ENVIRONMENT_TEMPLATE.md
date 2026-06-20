# 08 — Environment Template

This is not a final `.env.example`; it documents target environment variables for the future backend/frontend deployment.

## Frontend

```env
NEXT_PUBLIC_APP_URL=https://app.example.com
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
```

## Backend

```env
NODE_ENV=production
PORT=4000
PUBLIC_API_URL=https://api.example.com
PUBLIC_APP_URL=https://app.example.com

DATABASE_URL=postgresql://user:password@postgres:5432/restaurant_platform
REDIS_URL=redis://redis:6379

JWT_SECRET=replace_with_long_random_secret
SESSION_SECRET=replace_with_long_random_secret
CREDENTIAL_ENCRYPTION_KEY=replace_with_32_byte_base64_or_hex_key

DEFAULT_RESTAURANT_SLUG=golden-meat
DEFAULT_TIMEZONE=Europe/Paris
DEFAULT_LANGUAGE=fr

LOG_LEVEL=info
```

## Worker

```env
WORKER_CONCURRENCY=5
MESSAGE_RETRY_ATTEMPTS=3
MESSAGE_RETRY_BACKOFF_SECONDS=60
RESERVATION_REMINDER_LOOKAHEAD_MINUTES=180
```

## Temporary migration flags

```env
USE_BACKEND_FOR_VAPI_CREATE=false
USE_BACKEND_FOR_VAPI_CHANGE=false
USE_BACKEND_FOR_VAPI_CANCEL=false
USE_BACKEND_FOR_ADMIN_RESERVATIONS=false
```

## Legacy Supabase, temporary only

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

These should be removed after migration.

## Vapi, future UI-managed

Global env should not store per-restaurant Vapi credentials long-term.

Temporary only:

```env
VAPI_TOKEN=
```

Long-term:
- store encrypted restaurant-specific credentials in `IntegrationConnection`.

## SMS, future UI-managed

Do not hardcode one provider globally if the product will be multi-tenant.

Temporary development examples:

```env
SMS_PROVIDER=custom_http
SMS_TEST_MODE=true
```

Long-term:
- store encrypted restaurant-specific SMS credentials in `IntegrationConnection`.

## WhatsApp, future UI-managed

Temporary development examples only:

```env
WHATSAPP_TEST_MODE=true
```

Long-term:
- Meta/Evolution credentials must be stored per restaurant.

## Instagram, future UI-managed

Temporary development examples only:

```env
INSTAGRAM_TEST_MODE=true
```

Long-term:
- Meta credentials must be stored per restaurant.

## Security reminder

Never commit:
- production `.env`;
- provider tokens;
- Supabase service role key;
- SMS credentials;
- WhatsApp tokens;
- Instagram tokens;
- Vapi token;
- customer data export files.
