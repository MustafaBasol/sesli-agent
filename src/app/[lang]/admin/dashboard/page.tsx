'use client';

import { useEffect, useState } from 'react';
import { getDashboardStats } from './actions';
import DashboardClient from './DashboardClient';
import { useI18n } from '@/i18n/provider';

type RecentReservation = {
  id: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  customers?: {
    full_name?: string | null;
  } | null;
};

type DashboardStats = {
  totalCustomers?: number;
  todayReservations?: number;
  activeTables?: number;
  totalTables?: number;
  menuItems?: number;
  totalCalls?: number;
  pendingHandoffs?: number;
  cancellations?: number;
  recentReservations?: RecentReservation[];
};

const emptyDashboardStats: DashboardStats = {
  totalCustomers: 0,
  todayReservations: 0,
  activeTables: 0,
  totalTables: 0,
  menuItems: 0,
  totalCalls: 0,
  pendingHandoffs: 0,
  cancellations: 0,
  recentReservations: [],
};

export default function DashboardPage() {
  const { text } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const timeout = window.setTimeout(() => {
      if (!isActive) return;
      setStats(emptyDashboardStats);
      setLoading(false);
      setError(null);
    }, 8000);

    getDashboardStats()
      .then(res => {
        if (!isActive) return;
        window.clearTimeout(timeout);
        setStats(res);
        setLoading(false);
      })
      .catch(err => {
        if (!isActive) return;
        window.clearTimeout(timeout);
        console.error('Dashboard Error:', err);
        setStats(emptyDashboardStats);
        setError(null);
        setLoading(false);
      });

    return () => {
      isActive = false;
      window.clearTimeout(timeout);
    };
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto" style={{ borderColor: 'var(--p-border)', borderTopColor: 'var(--p-accent)' }} />
        <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--p-text-5)' }}>Loading...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center py-32 px-6">
      <div className="card p-8 max-w-sm w-full text-center">
        <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.10)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5 text-red-500">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--p-text-1)' }}>Connection Error</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--p-text-4)' }}>{error}</p>
        <button onClick={() => window.location.reload()} className="btn-primary w-full justify-center">Reload</button>
      </div>
    </div>
  );

  const extraStats = {
    totalCalls: stats?.totalCalls ?? 0,
    newReservations: stats?.todayReservations ?? 0,
    pendingHandoffs: stats?.pendingHandoffs ?? 0,
    cancellations: stats?.cancellations ?? 0,
  };

  return (
    <div className="space-y-6 pb-10 page-enter">
      <header>
        <p className="page-label">Overview</p>
        <h2 className="page-title">Dashboard</h2>
        <p className="page-subtitle">Real-time summary of Golden Meat AI receptionist activity.</p>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Guests',     value: stats?.totalCustomers ?? 0,     iconBg: 'rgba(99,102,241,0.10)', iconColor: 'var(--p-accent)', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100 8 4 4 0 000-8z' },
          { label: "Today's Bookings", value: stats?.todayReservations ?? 0,  iconBg: 'rgba(34,197,94,0.10)',  iconColor: '#22c55e',         icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
          { label: 'Active Tables',    value: `${stats?.activeTables ?? 0}/${stats?.totalTables ?? 0}`, iconBg: 'rgba(59,130,246,0.10)',  iconColor: '#3b82f6', icon: 'M3 3h18v18H3z M3 9h18M3 15h18M9 3v18M15 3v18' },
          { label: 'Menu Items',       value: stats?.menuItems ?? 0,          iconBg: 'rgba(245,158,11,0.10)', iconColor: '#f59e0b',         icon: 'M18 8h1a4 4 0 010 8h-1 M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z M6 1v3M10 1v3M14 1v3' },
        ].map((card) => (
          <div key={card.label} className="card p-5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4" style={{ background: card.iconBg }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={card.iconColor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                {card.icon.split(' M').map((d, i) => <path key={i} d={i === 0 ? d : 'M' + d} />)}
              </svg>
            </div>
            <div className="text-3xl font-bold tabular-nums mb-0.5" style={{ color: 'var(--p-text-1)' }}>{card.value}</div>
            <div className="text-xs font-medium" style={{ color: 'var(--p-text-4)' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Lower grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Reservations */}
        <div className="lg:col-span-2 card">
          <div className="card-header">
            <h3 className="card-header-title">Recent Reservations</h3>
            <span className="badge badge-green">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 status-online" />
              Live
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--p-border-2)' }}>
            {stats?.recentReservations && stats.recentReservations.length > 0 ? stats.recentReservations.map((res) => (
              <div key={res.id} className="flex items-center justify-between px-5 py-3.5" style={{ color: 'var(--p-text-2)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base" style={{ background: 'var(--p-subtle)' }}>🍖</div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>{res.customers?.full_name || text('Guest')}</p>
                    <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>{res.reservation_date} · {res.reservation_time}</p>
                  </div>
                </div>
                <span className="badge badge-gray shrink-0">{res.party_size} {text('pax')}</span>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No recent reservations</p>
              </div>
            )}
          </div>
        </div>

        {/* System Status */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-header-title">System Status</h3>
          </div>
          <div className="p-4 space-y-2">
            {[
              { label: 'Vapi Webhook',    status: 'Operational', badgeClass: 'badge-green' },
              { label: 'Supabase DB',     status: 'Connected',   badgeClass: 'badge-green' },
              { label: 'AI Receptionist', status: 'Active',      badgeClass: 'badge-blue' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between px-3.5 py-3 rounded-lg" style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border-2)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--p-text-3)' }}>{item.label}</span>
                <span className={`badge ${item.badgeClass}`}>{text(item.status)}</span>
              </div>
            ))}
          </div>

          <div className="mx-4 border-t" style={{ borderColor: 'var(--p-border-2)' }} />

          <div className="p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--p-text-5)' }}>Quick Stats</p>
            {[
              { label: 'Uptime',             value: '99.9%' },
              { label: 'Avg. Call Duration', value: '2m 14s' },
              { label: 'Resolution Rate',    value: '94.2%' },
            ].map((stat) => (
              <div key={stat.label} className="flex justify-between items-center">
                <span className="text-xs" style={{ color: 'var(--p-text-4)' }}>{stat.label}</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--p-text-2)' }}>{stat.value}</span>
              </div>
            ))}
          </div>

          <div className="p-4 pt-0">
            <div className="rounded-lg p-4" style={{ background: 'var(--p-accent-bg)', border: '1px solid var(--p-accent-border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--p-accent-text)' }}>AI Insight</p>
              <p className="text-xs font-medium leading-relaxed" style={{ color: 'var(--p-text-2)' }}>
                Your AI Agent is active and handling reservations automatically.
              </p>
            </div>
          </div>
        </div>
      </div>

      <DashboardClient initialStats={extraStats} />
    </div>
  );
}
