/**
 * Beta team/role management screen, powered by the dedicated backend's
 * Phase 17 team API (see AGENTS.md Phase 17). Parallel to the production
 * Supabase admin — does not replace it, is not linked from it, and does not
 * touch its session.
 *
 * Gated behind NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA (default disabled, see
 * docs/frontend-env.md). When disabled, this route 404s so it can never ship
 * live by accident.
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import TeamClient from './TeamClient';

export default function BackendAdminTeamPage() {
  const isBetaEnabled = process.env.NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA === 'true';

  if (!isBetaEnabled) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <TeamClient />
    </Suspense>
  );
}
