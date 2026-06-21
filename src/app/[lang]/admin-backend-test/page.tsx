/**
 * Dev-only page for exercising the new backend's auth + dashboard endpoints
 * in isolation (Phase 9 — see AGENTS.md). Not linked from the production
 * admin nav and does not touch the existing Supabase admin session.
 *
 * Gated: only reachable when NODE_ENV !== "production" AND
 * NEXT_PUBLIC_ENABLE_BACKEND_TEST_PAGE === "true" (see docs/frontend-env.md).
 * Otherwise renders a 404, so it can never accidentally ship live.
 */
import { notFound } from 'next/navigation';
import BackendAdminTestClient from './BackendAdminTestClient';

export default function BackendAdminTestPage() {
  const isTestPageEnabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ENABLE_BACKEND_TEST_PAGE === 'true';

  if (!isTestPageEnabled) {
    notFound();
  }

  return <BackendAdminTestClient />;
}
