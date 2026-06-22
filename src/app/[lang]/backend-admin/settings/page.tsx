/**
 * Beta restaurant/organization settings screen, powered by the dedicated
 * backend's Phase 18 settings API (see AGENTS.md Phase 18). Parallel to the
 * production Supabase admin — does not replace it, is not linked from it, and
 * does not touch its session.
 *
 * Gated behind NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA (default disabled, see
 * docs/frontend-env.md). When disabled, this route 404s so it can never ship
 * live by accident.
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import SettingsClient from './SettingsClient';

export default function BackendAdminSettingsPage() {
  const isBetaEnabled = process.env.NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA === 'true';

  if (!isBetaEnabled) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <SettingsClient />
    </Suspense>
  );
}
