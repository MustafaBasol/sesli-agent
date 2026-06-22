/**
 * Beta restaurant availability settings + blackout dates screen, powered by
 * the Phase 24 backend API. Parallel to the production Supabase admin — does
 * not replace it, is not linked from it, and does not touch its session.
 *
 * Gated behind NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA (default disabled, see
 * docs/frontend-env.md). When disabled, this route 404s so it can never ship
 * live by accident.
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import AvailabilityClient from './AvailabilityClient';

export default function BackendAdminAvailabilityPage() {
  const isBetaEnabled = process.env.NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA === 'true';

  if (!isBetaEnabled) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <AvailabilityClient />
    </Suspense>
  );
}
