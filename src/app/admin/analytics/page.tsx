'use client';

import { useEffect, useState } from 'react';
import { getAnalyticsData } from './actions';

type AnalyticsPeriod = 'week' | 'month' | 'year';

const PERIOD_OPTIONS: { key: AnalyticsPeriod; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

const metricCards = [
  { key: 'totalCalls',      label: 'Total Calls',      subKey: 'todayCalls',            subLabel: 'today',             iconBg: 'rgba(59,130,246,0.10)',  iconColor: '#3b82f6' },
  { key: 'conversionRate',  label: 'Conversion Rate',  subKey: 'confirmedReservations', subLabel: 'confirmed', suffix: '%', iconBg: 'rgba(99,102,241,0.10)', iconColor: '#6366f1' },
  { key: 'handoffRate',     label: 'Handoff Rate',     subKey: 'handoffs',              subLabel: 'requested support', suffix: '%', iconBg: 'rgba(139,92,246,0.10)', iconColor: '#8b5cf6' },
  { key: 'totalCustomers',  label: 'Total Customers',  subKey: 'cancellations',         subLabel: 'cancellations',     iconBg: 'rgba(34,197,94,0.10)',   iconColor: '#22c55e' },
];

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<AnalyticsPeriod>('week');

  useEffect(() => {
    setLoading(true);
    getAnalyticsData(period).then(res => {
      setData(res);
      setLoading(false);
    });
  }, [period]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3" style={{ color: 'var(--p-text-4)' }}>
        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <span className="text-sm font-medium">Loading analytics...</span>
      </div>
    </div>
  );

  const maxCallCount = Math.max(...data.peakCallHours, 1);
  const peakReservationHour = data.peakResHours.indexOf(Math.max(...data.peakResHours));
  const activeLanguages = Object.entries(data.languages).filter(([, count]: [string, any]) => count > 0);
  const languagesToShow = activeLanguages.length ? activeLanguages : Object.entries(data.languages);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="page-label">Reports</p>
          <h2 className="page-title">Performance Analytics</h2>
          <p className="page-subtitle">AI agent interactions for {data.period.label.toLowerCase()}.</p>
        </div>
        <div className="flex p-1 gap-1 rounded-lg self-start sm:self-auto" style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)' }}>
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => setPeriod(option.key)}
              className="px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all"
              style={period === option.key
                ? { background: 'var(--p-accent)', color: '#fff' }
                : { color: 'var(--p-text-4)' }
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {data.errors && Object.values(data.errors).some(Boolean) && (
        <div className="badge badge-red flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ borderRadius: '0.75rem' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Some analytics sources could not be loaded. Check server logs for details.
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card) => (
          <div key={card.key} className="card p-5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4" style={{ background: card.iconBg }}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: card.iconColor }} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--p-text-5)' }}>{card.label}</p>
            <p className="text-3xl font-bold tabular-nums mb-1" style={{ color: 'var(--p-text-1)' }}>
              {data.summary[card.key]}{(card as any).suffix || ''}
            </p>
            <p className="text-xs font-medium" style={{ color: 'var(--p-text-4)' }}>
              {data.summary[card.subKey]} {card.subLabel}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Hourly Traffic Chart */}
        <div className="lg:col-span-2 card p-5">
          <div className="card-header" style={{ padding: '0 0 1rem 0', border: 'none', marginBottom: '1rem', borderBottom: '1px solid var(--p-border-2)' }}>
            <h3 className="card-header-title">Hourly Call Traffic</h3>
            <span className="text-xs font-medium" style={{ color: 'var(--p-text-4)' }}>
              {data.summary.todayReservations} reservations today
            </span>
          </div>
          <div className="flex items-end justify-between gap-0.5" style={{ height: '160px' }}>
            {data.peakCallHours.map((count: number, h: number) => {
              const pct = (count / maxCallCount) * 100;
              const isActive = count > 0;
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="relative w-full flex items-end" style={{ height: '140px' }}>
                    <div
                      className="w-full rounded-t transition-all duration-300"
                      style={{
                        height: `${Math.max(pct, 3)}%`,
                        background: isActive ? 'var(--p-accent-bg)' : 'var(--p-subtle)',
                        border: isActive ? '1px solid var(--p-accent-border)' : 'none',
                      }}
                    >
                      {count > 0 && (
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap" style={{ color: 'var(--p-accent-text)' }}>
                          {count}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[7px] font-medium" style={{ color: 'var(--p-text-5)' }}>{h}h</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Language & Peak Time */}
        <div className="card p-5 space-y-5">
          <div>
            <h3 className="card-header-title mb-4">Language Distribution</h3>
            <div className="space-y-3">
              {languagesToShow.map(([lang, count]: [string, any]) => {
                const pct = data.summary.totalCalls ? (count / data.summary.totalCalls) * 100 : 0;
                return (
                  <div key={lang}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-medium" style={{ color: 'var(--p-text-2)' }}>{lang}</span>
                      <span style={{ color: 'var(--p-text-5)' }}>{count} calls</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--p-subtle)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct || 0}%`, background: 'var(--p-accent)' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4" style={{ borderTop: '1px solid var(--p-border-2)' }}>
            <h3 className="card-header-title mb-2">Peak Reservation Hour</h3>
            <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--p-text-1)' }}>
              {data.peakResHours && Math.max(...data.peakResHours) > 0 ? `${peakReservationHour}:00` : '—'}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--p-text-5)' }}>Most requested dining slot</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-header-title">Recent Activity</h3>
        </div>
        {data.recentActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--p-subtle)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5" style={{ color: 'var(--p-text-5)' }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <p className="text-sm" style={{ color: 'var(--p-text-5)' }}>No activity recorded yet</p>
          </div>
        ) : (
          <div>
            {data.recentActivity.map((item: any, index: number) => (
              <div key={`${item.type}-${index}`} className="px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2" style={{ borderBottom: '1px solid var(--p-border-2)' }}>
                <div>
                  <span className="badge badge-amber mb-2 inline-block">{item.type}</span>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>{item.title || 'Unknown'}</h4>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--p-text-4)' }}>{item.detail}</p>
                </div>
                <span className="text-xs font-mono shrink-0" style={{ color: 'var(--p-text-5)' }}>
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
