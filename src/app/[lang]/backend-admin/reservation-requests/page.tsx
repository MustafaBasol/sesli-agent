/**
 * Beta reservation requests screen, powered by the dedicated backend's
 * Phase 5 reservation-request API (see AGENTS.md Phase 11). Parallel to the
 * production Supabase admin reservations screen — does not replace it, is
 * not linked from it, and does not touch its session.
 *
 * Gated behind NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA (default disabled, see
 * docs/frontend-env.md). When disabled, this route 404s so it can never ship
 * live by accident.
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ReservationRequestsClient from './ReservationRequestsClient';

export default function BackendAdminReservationRequestsPage() {
  const isBetaEnabled = process.env.NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA === 'true';

  if (!isBetaEnabled) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <ReservationRequestsClient />
    </Suspense>
  );
}
