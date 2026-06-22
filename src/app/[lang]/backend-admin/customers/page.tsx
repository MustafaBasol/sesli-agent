/**
 * Beta customers screen, powered by the dedicated backend's Phase 6 customer
 * API (see AGENTS.md Phase 12). Parallel to the production Supabase admin
 * customers screen — does not replace it, is not linked from it, and does
 * not touch its session.
 *
 * Gated behind NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA (default disabled, see
 * docs/frontend-env.md). When disabled, this route 404s so it can never ship
 * live by accident.
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import CustomersClient from './CustomersClient';

export default function BackendAdminCustomersPage() {
  const isBetaEnabled = process.env.NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA === 'true';

  if (!isBetaEnabled) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <CustomersClient />
    </Suspense>
  );
}
