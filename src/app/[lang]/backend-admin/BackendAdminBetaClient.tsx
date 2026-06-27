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

const STAT_ICONS: Record<string, React.ReactNode> = {
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 20l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  ),
  plug: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
};

function SummaryCard({
  label,
  value,
  icon,
  tile = 'gray',
}: {
  label: string;
  value: number;
  icon: keyof typeof STAT_ICONS;
  tile?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray';
}) {
  return (
    <div className="stat-card">
      <div>
        <div className="text-2xl font-bold tabular-nums mb-0.5" style={{ color: 'var(--p-text-1)' }}>
          {value}
        </div>
        <div className="text-xs font-medium" style={{ color: 'var(--p-text-4)' }}>
          {label}
        </div>
      </div>
      <div className={`icon-tile icon-tile-${tile}`}>{STAT_ICONS[icon]}</div>
    </div>
  );
}

function QuickActionCard({
  href,
  title,
  subtitle,
  icon,
  color,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: keyof typeof STAT_ICONS;
  color: 'blue' | 'green' | 'amber' | 'purple';
}) {
  return (
    <Link href={href} className={`quick-action quick-action-${color}`}>
      <span className="quick-action-icon">{STAT_ICONS[icon]}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs opacity-85 mt-0.5">{subtitle}</span>
      </span>
    </Link>
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
            <SummaryCard label="New requests" value={summary.reservationRequests.new} icon="inbox" tile="blue" />
            <SummaryCard label="Pending info" value={summary.reservationRequests.pendingInfo} icon="clock" tile="amber" />
            <SummaryCard label="Confirmed requests" value={summary.reservationRequests.confirmed} icon="check" tile="green" />
            <SummaryCard label="Total customers" value={summary.customers.total} icon="users" tile="purple" />
            <SummaryCard label="Open conversations" value={summary.conversations.open} icon="chat" tile="blue" />
            <SummaryCard label="Active integrations" value={summary.integrations.active} icon="plug" tile="green" />
            <SummaryCard label="Integration errors" value={summary.integrations.error} icon="alert" tile={summary.integrations.error > 0 ? 'red' : 'gray'} />
            <SummaryCard label="Today's messages" value={summary.conversations.todayMessagesCount} icon="bolt" tile="amber" />
          </div>

          <div>
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--p-text-1)' }}>Quick actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <QuickActionCard
                href={`/${lang}/backend-admin/reservation-requests`}
                title="Review requests"
                subtitle="Triage new reservation requests"
                icon="inbox"
                color="blue"
              />
              <QuickActionCard
                href={`/${lang}/backend-admin/availability`}
                title="Manage availability"
                subtitle="Hours, slots & blackout dates"
                icon="clock"
                color="green"
              />
              <QuickActionCard
                href={`/${lang}/backend-admin/customers`}
                title="View customers"
                subtitle="Browse guest profiles"
                icon="users"
                color="purple"
              />
              <QuickActionCard
                href={`/${lang}/backend-admin/conversations`}
                title="Open conversations"
                subtitle="Reply across channels"
                icon="chat"
                color="amber"
              />
            </div>
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
