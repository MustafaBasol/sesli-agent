'use client';

import { useEffect, useState } from 'react';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import {
  getDashboardCounts,
  getDashboardRecent,
  getDashboardSummary,
  type BackendLoginResponse,
  type DashboardCounts,
  type DashboardRecent,
  type DashboardSummary,
} from '@/lib/backend-endpoints';

type Status = 'idle' | 'loading' | 'error';

export default function BackendAdminBetaClient() {
  const [session, setSession] = useState<BackendLoginResponse | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<Status>('idle');
  const [loginError, setLoginError] = useState('');

  const [dashboardStatus, setDashboardStatus] = useState<Status>('idle');
  const [dashboardError, setDashboardError] = useState('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recent, setRecent] = useState<DashboardRecent | null>(null);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);

  // Restore an existing backend session/restaurant selection on mount.
  useEffect(() => {
    const token = backendAuth.getToken();
    const user = backendAuth.getUser();
    if (token && user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSession({ token, user, accessibleRestaurantIds: backendAuth.getAccessibleRestaurantIds() });
      const savedRestaurantId = backendAuth.getSelectedRestaurantId();
      if (savedRestaurantId) setRestaurantId(savedRestaurantId);
    }
    setBootstrapped(true);
  }, []);

  useEffect(() => {
    if (!session || !restaurantId) return;

    let isActive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDashboardStatus('loading');
    setDashboardError('');

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
        setDashboardStatus('idle');
      })
      .catch((err) => {
        if (!isActive) return;
        setDashboardError(err instanceof BackendApiError ? err.message : 'Failed to load dashboard data');
        setDashboardStatus('error');
      });

    return () => {
      isActive = false;
    };
  }, [session, restaurantId]);

  const handleLogin = async () => {
    setLoginStatus('loading');
    setLoginError('');
    try {
      const result = await backendAuth.login(email, password);
      setSession(result);
      if (result.accessibleRestaurantIds.length === 1) {
        selectRestaurant(result.accessibleRestaurantIds[0]);
      }
      setLoginStatus('idle');
    } catch (err) {
      setLoginError(err instanceof BackendApiError ? err.message : 'Login failed');
      setLoginStatus('error');
    }
  };

  const selectRestaurant = (id: string) => {
    backendAuth.setSelectedRestaurantId(id);
    setRestaurantId(id);
  };

  const handleLogout = () => {
    backendAuth.logout();
    setSession(null);
    setRestaurantId('');
    setSummary(null);
    setRecent(null);
    setCounts(null);
  };

  if (!bootstrapped) return null;

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--p-bg)' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="page-label">Beta</p>
            <h2 className="page-title">Backend Admin (Beta)</h2>
            <p className="page-subtitle">
              Preview dashboard powered by the new backend API. Separate from the production Supabase admin.
            </p>
          </div>
          {session && (
            <button onClick={handleLogout} className="btn-primary shrink-0">
              Sign out
            </button>
          )}
        </header>

        {!session ? (
          <LoginCard
            email={email}
            password={password}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={handleLogin}
            status={loginStatus}
            error={loginError}
          />
        ) : !restaurantId ? (
          <RestaurantPicker
            session={session}
            onSelect={selectRestaurant}
          />
        ) : (
          <DashboardView
            session={session}
            restaurantId={restaurantId}
            onChangeRestaurant={() => setRestaurantId('')}
            status={dashboardStatus}
            error={dashboardError}
            summary={summary}
            recent={recent}
            counts={counts}
          />
        )}
      </div>
    </div>
  );
}

function LoginCard({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  status,
  error,
}: {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  status: Status;
  error: string;
}) {
  return (
    <div className="card p-8 max-w-sm">
      <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--p-text-1)' }}>
        Backend login
      </h3>
      <div className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
          style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-1)' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
          style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-1)' }}
        />
        {error && (
          <p className="text-xs font-medium" style={{ color: '#ef4444' }}>
            {error}
          </p>
        )}
        <button onClick={onSubmit} disabled={status === 'loading'} className="btn-primary w-full justify-center">
          {status === 'loading' ? 'Signing in...' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}

function RestaurantPicker({
  session,
  onSelect,
}: {
  session: BackendLoginResponse;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="card p-6 max-w-lg">
      <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--p-text-1)' }}>
        Select a restaurant
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--p-text-4)' }}>
        Signed in as {session.user.email} ({session.user.globalRole ?? 'no role'})
      </p>

      {session.accessibleRestaurantIds.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>
          No accessible restaurants for this account.
        </p>
      ) : (
        <div className="space-y-2">
          {session.accessibleRestaurantIds.map((id) => (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-lg text-left"
              style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border-2)', color: 'var(--p-text-2)' }}
            >
              <span className="text-sm font-medium truncate">{id}</span>
              <span className="badge badge-gray shrink-0">Select</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-5">
      <div className="text-3xl font-bold tabular-nums mb-0.5" style={{ color: 'var(--p-text-1)' }}>
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
            <SummaryCard label="New reservation requests" value={summary.reservationRequests.new} />
            <SummaryCard label="Pending info requests" value={summary.reservationRequests.pendingInfo} />
            <SummaryCard label="Confirmed reservation requests" value={summary.reservationRequests.confirmed} />
            <SummaryCard label="Total customers" value={summary.customers.total} />
            <SummaryCard label="Open conversations" value={summary.conversations.open} />
            <SummaryCard label="Active integrations" value={summary.integrations.active} />
            <SummaryCard label="Integration errors" value={summary.integrations.error} />
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
              <CountBadge label="Integration errors" value={counts.integrationErrors} />
              <CountBadge label="Today's messages" value={counts.todayMessages} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <RecentListCard
              title="Recent reservation requests"
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
              badge={(item) => item.status}
            />
            <RecentListCard
              title="Recent customers"
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
            />
          </div>
        </>
      )}
    </div>
  );
}

function CountBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold tabular-nums" style={{ color: 'var(--p-text-1)' }}>{value}</div>
      <div className="text-[10px] font-medium" style={{ color: 'var(--p-text-5)' }}>{label}</div>
    </div>
  );
}

function RecentListCard<T extends { id: string }>({
  title,
  items,
  renderItem,
  badge,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  badge?: (item: T) => string;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">{title}</h3>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--p-border-2)' }}>
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">{renderItem(item)}</div>
              {badge && <span className="badge badge-gray shrink-0">{badge(item)}</span>}
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No data yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
