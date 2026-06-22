/**
 * Beta integration settings screen, powered by the dedicated backend's
 * Phase 7 integration API (see AGENTS.md Phase 14). Parallel to the
 * production Supabase admin settings screens — does not replace them, is
 * not linked from them, and does not touch their session.
 *
 * Gated behind NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA (default disabled, see
 * docs/frontend-env.md). When disabled, this route 404s so it can never ship
 * live by accident.
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import IntegrationsClient from './IntegrationsClient';

export default function BackendAdminIntegrationsPage() {
  const isBetaEnabled = process.env.NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA === 'true';

  if (!isBetaEnabled) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <IntegrationsClient />
    </Suspense>
  );
}
