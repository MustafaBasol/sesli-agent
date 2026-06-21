# Frontend environment variables

`.env.example` is matched by the repo's blanket `.env*` `.gitignore` rule, so it
is not tracked by git. This file documents frontend env vars that are tracked
so the documentation actually ships with the repo.

## Backend API client (Phase 9, see AGENTS.md)

```env
# Base URL for the dedicated Node/Express backend's API. Defaults to relative
# "/api" if unset, which only works behind a same-origin proxy. For local dev
# against the Express backend (see backend/.env.example, default port 4000):
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:4000/api

# Enables the dev-only /admin-backend-test page (src/lib/backend-auth.ts +
# src/lib/backend-endpoints.ts). Defaults to disabled. Must never be set to
# "true" in production. Not linked from any production nav.
NEXT_PUBLIC_ENABLE_BACKEND_TEST_PAGE=false
```

## Do not expose these to the frontend

These are backend-only and must never be prefixed with `NEXT_PUBLIC_` or
referenced from any frontend code:

- `JWT_SECRET`
- `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY`
