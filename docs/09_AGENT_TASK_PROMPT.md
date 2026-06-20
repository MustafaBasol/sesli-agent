# 09 — Agent Task Prompt

Use this prompt when starting the coding agent on this repository.

```txt
You are working on the `MustafaBasol/sesli-agent` repository.

Before changing code, read:
- AGENTS.md
- docs/00_PROJECT_CONTEXT.md
- docs/01_ARCHITECTURE_DECISIONS.md
- docs/02_TARGET_DATABASE_SCHEMA.md
- docs/03_IMPLEMENTATION_PLAN.md
- docs/04_INTEGRATIONS_GUIDE.md
- docs/05_MIGRATION_FROM_SUPABASE.md
- docs/06_SECURITY_AND_TENANCY_RULES.md
- docs/07_TESTING_AND_ACCEPTANCE.md
- docs/08_ENVIRONMENT_TEMPLATE.md

Goal:
Evolve the current Next.js + Supabase + Vapi restaurant call management app into a multi-tenant restaurant reservation and communication platform.

Hard requirements:
- Do not break the existing Vapi reservation flow.
- Design all new restaurant-specific models with `restaurantId`.
- Integrations must be configurable from the UI.
- Credentials must be encrypted and never logged.
- Provider-specific code must use adapter/service classes.
- Webhooks must resolve the correct restaurant through a secure public webhook key.
- First production usage is one restaurant on one deployment, but the architecture must be multi-tenant.

Start with Phase 1 from `docs/03_IMPLEMENTATION_PLAN.md`:
- create backend foundation;
- add health endpoint;
- add environment validation;
- prepare for Prisma/PostgreSQL;
- do not migrate all features at once.

After each phase:
- summarize changed files;
- list tests/checks run;
- list any existing behavior that might be affected;
- do not proceed to destructive migration without explicit approval.
```
