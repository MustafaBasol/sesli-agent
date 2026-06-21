/**
 * Beta admin dashboard powered by the dedicated backend (Phase 10, see
 * AGENTS.md). Parallel to the production Supabase admin at /admin — does not
 * replace it, is not linked from it, and does not touch its session.
 *
 * Gated behind NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA (default disabled, see
 * docs/frontend-env.md). When disabled, this route 404s so it can never ship
 * live by accident.
 */
import { notFound } from 'next/navigation';
import BackendAdminBetaClient from './BackendAdminBetaClient';

export default function BackendAdminBetaPage() {
  const isBetaEnabled = process.env.NEXT_PUBLIC_ENABLE_BACKEND_ADMIN_BETA === 'true';

  if (!isBetaEnabled) {
    notFound();
  }

  return <BackendAdminBetaClient />;
}
