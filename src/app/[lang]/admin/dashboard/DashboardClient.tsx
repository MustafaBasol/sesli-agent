'use client';

import { useI18n } from '@/i18n/provider';

const statCards = [
  {
    label: 'Total Calls Today',
    key: 'totalCalls',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .82h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
      </svg>
    ),
    iconBg: 'rgba(59,130,246,0.10)',
    iconColor: '#3b82f6',
    trend: '+12%',
    trendUp: true,
  },
  {
    label: 'New Reservations',
    key: 'newReservations',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    iconBg: 'rgba(34,197,94,0.10)',
    iconColor: '#22c55e',
    trend: '+8%',
    trendUp: true,
  },
  {
    label: 'Pending Handoffs',
    key: 'pendingHandoffs',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    iconBg: 'rgba(239,68,68,0.10)',
    iconColor: '#ef4444',
    trend: '-3%',
    trendUp: false,
  },
  {
    label: 'Cancellations',
    key: 'cancellations',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    ),
    iconBg: 'rgba(245,158,11,0.10)',
    iconColor: '#f59e0b',
    trend: '+2%',
    trendUp: false,
  },
];

type DashboardClientStats = Record<string, number>;

export default function DashboardClient({ initialStats }: { initialStats: DashboardClientStats }) {
  const { text } = useI18n();

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <p className="page-label">Overview</p>
        <h2 className="page-title">Dashboard</h2>
        <p className="page-subtitle">Real-time summary of Golden Meat AI receptionist activity.</p>
      </header>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.key} className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: card.iconBg }}>
                <span style={{ color: card.iconColor }}>{card.icon}</span>
              </div>
              <span className={`flex items-center gap-1 text-[11px] font-bold ${card.trendUp ? 'text-emerald-500' : 'text-red-400'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-3 h-3 ${!card.trendUp ? 'rotate-180' : ''}`}>
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                </svg>
                {card.trend}
              </span>
            </div>
            <div className="text-3xl font-bold tabular-nums mb-0.5" style={{ color: 'var(--p-text-1)' }}>
              {initialStats[card.key] ?? 0}
            </div>
            <div className="text-xs font-medium" style={{ color: 'var(--p-text-4)' }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Lower grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Latest Activity */}
        <div className="lg:col-span-2 card">
          <div className="card-header">
            <h3 className="card-header-title">Latest Activity</h3>
            <span className="badge badge-green">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 status-online" />
              Live
            </span>
          </div>
          <div className="p-6">
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--p-subtle)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5" style={{ color: 'var(--p-text-5)' }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No recent activity to display</p>
              <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>Activity will appear here as calls come in</p>
            </div>
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
              <div
                key={item.label}
                className="flex items-center justify-between px-3.5 py-3 rounded-lg"
                style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border-2)' }}
              >
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
        </div>
      </div>
    </div>
  );
}
