'use client';

import { useEffect, useState } from 'react';
import { getCalls } from './actions';
import { useI18n } from '@/i18n/provider';

type CallLog = {
  id: string;
  created_at: string;
  customer_name?: string | null;
  caller_phone?: string | null;
  intent?: string | null;
  outcome?: string | null;
  summary?: string | null;
};

const Spinner = () => (
  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
);

export default function CallsPage() {
  const { locale, text } = useI18n();
  const [items, setItems] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchItems() {
    setLoading(true);
    try {
      const data = await getCalls();
      setItems(data || []);
    } catch (error) {
      console.error('[CALLS PAGE ERROR]', error);
      setItems([]);
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchItems(); }, []);

  return (
    <div className="space-y-6 pb-10">
      <header>
        <p className="page-label">AI Activity</p>
        <h2 className="page-title">Call History</h2>
        <p className="page-subtitle">Full list of inbound calls handled by the AI receptionist.</p>
      </header>

      <div className="card">
        {/* Desktop table */}
        <div className="hidden sm:block table-container">
          <table className="admin-table">
            <thead>
              <tr>
                {['Date', 'Customer', 'Intent', 'Outcome', 'Summary'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <div className="flex items-center justify-center gap-2" style={{ color: 'var(--p-text-4)' }}>
                      <Spinner />
                      <span className="text-sm">Loading calls...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16">
                    <p className="text-sm" style={{ color: 'var(--p-text-5)' }}>No calls recorded yet</p>
                  </td>
                </tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-nowrap font-mono text-xs" style={{ color: 'var(--p-text-4)' }}>
                    {new Date(item.created_at).toLocaleString(locale)}
                  </td>
                  <td>
                    <div className="font-semibold text-sm" style={{ color: 'var(--p-text-1)' }}>{item.customer_name || text('Unknown')}</div>
                    <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--p-text-5)' }}>{item.caller_phone}</div>
                  </td>
                  <td>
                    <span className="badge badge-gray">{text(item.intent || 'N/A')}</span>
                  </td>
                  <td>
                    <span className={`badge ${item.outcome === 'completed' ? 'badge-green' : 'badge-amber'}`}>
                      {text(item.outcome || 'N/A')}
                    </span>
                  </td>
                  <td className="max-w-xs truncate text-xs" style={{ color: 'var(--p-text-4)' }} title={item.summary || undefined}>
                    {item.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y" style={{ '--tw-divide-color': 'var(--p-border-2)' } as React.CSSProperties}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12" style={{ color: 'var(--p-text-4)' }}>
              <Spinner />
              <span className="text-sm">{text('Loading')}</span>
            </div>
          ) : items.map((item) => (
            <div key={item.id} className="p-4 space-y-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>{item.customer_name || text('Unknown')}</p>
                  <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--p-text-5)' }}>{item.caller_phone}</p>
                </div>
                <span className={`badge ${item.outcome === 'completed' ? 'badge-green' : 'badge-amber'}`}>{text(item.outcome || 'N/A')}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="badge badge-gray">{text(item.intent || 'N/A')}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--p-text-5)' }}>{new Date(item.created_at).toLocaleString(locale)}</span>
              </div>
              {item.summary && <p className="text-xs line-clamp-2" style={{ color: 'var(--p-text-4)' }}>{item.summary}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
