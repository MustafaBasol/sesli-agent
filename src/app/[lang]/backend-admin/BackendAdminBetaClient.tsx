'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BackendApiError } from '@/lib/backend-api';
import BackendAdminShell from './BackendAdminShell';
import {
  getDashboardCounts,
  getDashboardRecent,
  getDashboardSummary,
  type BackendLoginResponse,
  type DashboardCounts,
  type DashboardRecent,
  type DashboardSummary,
} from '@/lib/backend-endpoints';

// Re-export so pages that imported from here keep working during transition
export { LoginCard, RestaurantPicker } from './BackendAdminShell';

type Status = 'idle' | 'loading' | 'error';

const REQUEST_STATUS_BADGE: Record<string, string> = {
  new: 'badge-blue',
  pending_info: 'badge-amber',
  confirmed: 'badge-green',
  rejected: 'badge-red',
  cancelled: 'badge-gray',
  done: 'badge-purple',
};

const CONVERSATION_STATUS_BADGE: Record<string, string> = {
  open: 'badge-green',
  closed: 'badge-gray',
  resolved: 'badge-blue',
};

export default function BackendAdminBetaClient() {
  return (
    <BackendAdminShell
      label="Admin"
      title="Dashboard"
      subtitle="Backend platform overview."
      contentClass="max-w-7xl mx-auto space-y-4"
    >
      {({ session, restaurantId, onChangeRestaurant }) => (
        <DashboardContent
          session={session}
          restaurantId={restaurantId}
          onChangeRestaurant={onChangeRestaurant}
        />
      )}
    </BackendAdminShell>
  );
}

function DashboardContent({
  session,
  restaurantId,
  onChangeRestaurant,
}: {
  session: BackendLoginResponse;
  restaurantId: string;
  onChangeRestaurant: () => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recent, setRecent] = useState<DashboardRecent | null>(null);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);

  useEffect(() => {
    let isActive = true;
    setStatus('loading');
    setError('');

    Promise.all([
      getDashboardSummary(restaurantId, session.token),
      getDashboardRecent(restaurantId, session.token, 5),
      getDashboardCounts(restaurantId, session.token),
    ])
      .then(([summaryResult, recentResult, countsResult]) => {
        if (!isActive) return;
        setSummary(summaryResult);
        setRecent(recentResult);
        setCounts(countsResult);
        setStatus('idle');
      })
      .catch((err) => {
        if (!isActive) return;
        setError(err instanceof BackendApiError ? err.message : 'Failed to load dashboard data');
        setStatus('error');
      });

    return () => {
      isActive = false;
    };
  }, [session, restaurantId]);

  return (
    <DashboardView
      session={session}
      restaurantId={restaurantId}
      onChangeRestaurant={onChangeRestaurant}
      status={status}
      error={error}
      summary={summary}
      recent={recent}
      counts={counts}
    />
  );
}

function SummaryCard({ label, value, variant = 'default' }: { label: string; value: number; variant?: 'default' | 'accent' | 'warning' | 'error' }) {
  const valueColor =
    variant === 'error' ? '#ef4444' :
    variant === 'warning' ? '#f59e0b' :
    variant === 'accent' ? 'var(--p-accent-text)' :
    'var(--p-text-1)';

  return (
    <div className="card p-5">
      <div className="text-3xl font-bold tabular-nums mb-0.5" style={{ color: valueColor }}>
        {value}
      </div>
      <div className="text-xs font-medium" style={{ color: 'var(--p-text-4)' }}>
        {label}
      </div>
    </div>
  );
}

function DashboardView({
  session,
  restaurantId,
  onChangeRestaurant,
  status,
  error,
  summary,
  recent,
  counts,
}: {
  session: BackendLoginResponse;
  restaurantId: string;
  onChangeRestaurant: () => void;
  status: Status;
  error: string;
  summary: DashboardSummary | null;
  recent: DashboardRecent | null;
  counts: DashboardCounts | null;
}) {
  const params = useParams();
  const lang = typeof params.lang === 'string' ? params.lang : 'en';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs" style={{ color: 'var(--p-text-4)' }}>
          Restaurant <span className="font-semibold" style={{ color: 'var(--p-text-2)' }}>{restaurantId}</span>
          {' · '}
          {session.user.email}
        </p>
        <button
          onClick={onChangeRestaurant}
          className="text-xs font-semibold"
          style={{ color: 'var(--p-accent-text)' }}
        >
          Change restaurant
        </button>
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center space-y-4">
            <div
              className="w-10 h-10 border-2 rounded-full animate-spin mx-auto"
              style={{ borderColor: 'var(--p-border)', borderTopColor: 'var(--p-accent)' }}
            />
            <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--p-text-5)' }}>
              Loading...
            </p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="card p-8 max-w-sm text-center">
          <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--p-text-1)' }}>
            Dashboard fetch failed
          </h3>
          <p className="text-xs" style={{ color: 'var(--p-text-4)' }}>{error}</p>
        </div>
      )}

      {status === 'idle' && summary && counts && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard label="New requests" value={summary.reservationRequests.new} variant="accent" />
            <SummaryCard label="Pending info" value={summary.reservationRequests.pendingInfo} variant="warning" />
            <SummaryCard label="Confirmed requests" value={summary.reservationRequests.confirmed} variant="default" />
            <SummaryCard label="Total customers" value={summary.customers.total} />
            <SummaryCard label="Open conversations" value={summary.conversations.open} />
            <SummaryCard label="Active integrations" value={summary.integrations.active} />
            <SummaryCard label="Integration errors" value={summary.integrations.error} variant={summary.integrations.error > 0 ? 'error' : 'default'} />
            <SummaryCard label="Today's messages" value={summary.conversations.todayMessagesCount} />
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-header-title">Live counts</h3>
              <span className="badge badge-green">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 status-online" />
                Live
              </span>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-5 gap-4">
              <CountBadge label="New requests" value={counts.newReservationRequests} />
              <CountBadge label="Pending info" value={counts.pendingInfoReservationRequests} />
              <CountBadge label="Open conversations" value={counts.openConversations} />
              <CountBadge label="Integration errors" value={counts.integrationErrors} urgent={counts.integrationErrors > 0} />
              <CountBadge label="Today's messages" value={counts.todayMessages} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <RecentListCard
              title="Recent requests"
              viewAllHref={`/${lang}/backend-admin/reservation-requests`}
              items={recent?.recentReservationRequests ?? []}
              renderItem={(item) => (
                <>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>
                    {item.customer.fullName || 'Guest'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>
                    {item.reservationDate} · {item.reservationTime} · {item.partySize} pax
                  </p>
                </>
              )}
              badge={(item) => item.status.replace('_', ' ')}
              badgeClass={(item) => REQUEST_STATUS_BADGE[item.status] ?? 'badge-gray'}
              href={(item) => `/${lang}/backend-admin/reservation-requests?requestId=${item.id}`}
            />
            <RecentListCard
              title="Recent customers"
              viewAllHref={`/${lang}/backend-admin/customers`}
              items={recent?.recentCustomers ?? []}
              renderItem={(item) => (
                <>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>
                    {item.fullName || 'Unnamed'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>{item.phoneNumber || item.email || '—'}</p>
                </>
              )}
            />
            <RecentListCard
              title="Recent conversations"
              viewAllHref={`/${lang}/backend-admin/conversations`}
              items={recent?.recentConversations ?? []}
              renderItem={(item) => (
                <>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>
                    {item.customer.fullName || 'Guest'}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
                    {item.lastMessageSummary || item.channel}
                  </p>
                </>
              )}
              badge={(item) => item.status}
              badgeClass={(item) => CONVERSATION_STATUS_BADGE[item.status] ?? 'badge-gray'}
            />
          </div>
        </>
      )}
    </div>
  );
}

function CountBadge({ label, value, urgent = false }: { label: string; value: number; urgent?: boolean }) {
  return (
    <div className="text-center">
      <div
        className="text-xl font-bold tabular-nums"
        style={{ color: urgent ? '#ef4444' : 'var(--p-text-1)' }}
      >
        {value}
      </div>
      <div className="text-[10px] font-medium" style={{ color: 'var(--p-text-5)' }}>{label}</div>
    </div>
  );
}

function RecentListCard<T extends { id: string }>({
  title,
  viewAllHref,
  items,
  renderItem,
  badge,
  badgeClass,
  href,
}: {
  title: string;
  viewAllHref?: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  badge?: (item: T) => string;
  badgeClass?: (item: T) => string;
  href?: (item: T) => string;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">{title}</h3>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-[10px] font-semibold"
            style={{ color: 'var(--p-accent-text)' }}
          >
            View all →
          </Link>
        )}
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--p-border-2)' }}>
        {items.length > 0 ? (
          items.map((item) => {
            const cls = badge && badgeClass ? badgeClass(item) : 'badge-gray';
            const row = (
              <div className="min-w-0 flex items-center justify-between gap-3 w-full">
                <div className="min-w-0">{renderItem(item)}</div>
                {badge && <span className={`badge ${cls} shrink-0`}>{badge(item)}</span>}
              </div>
            );
            return href ? (
              <Link
                key={item.id}
                href={href(item)}
                className="flex items-center px-5 py-3.5 transition-colors"
                style={{ color: 'inherit' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--p-subtle)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
              >
                {row}
              </Link>
            ) : (
              <div key={item.id} className="flex items-center px-5 py-3.5">
                {row}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No data yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
