'use client';

import { useEffect, useState } from 'react';
import { getStaffHandoffs } from './actions';
import { useI18n } from '@/i18n/provider';

type StaffHandoff = {
  id: string;
  customer_name?: string | null;
  phone_number?: string | null;
  urgency: string;
  reason?: string | null;
  conversation_summary?: string | null;
  status: string;
};

export default function HandoffsPage() {
  const { text } = useI18n();
  const [items, setItems] = useState<StaffHandoff[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchItems() {
    setLoading(true);
    try {
      const data = await getStaffHandoffs();
      setItems(data || []);
    } catch (error) {
      console.error('[HANDOFFS PAGE ERROR]', error);
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
        <h2 className="page-title">Staff Handoffs</h2>
        <p className="page-subtitle">Urgent requests requiring human assistance.</p>
      </header>

      <div className="card">
        <div className="hidden sm:block table-container">
          <table className="admin-table">
            <thead>
              <tr>
                {['Customer', 'Urgency', 'Reason', 'Summary', 'Status'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-sm" style={{ color: 'var(--p-text-5)' }}>Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-16 text-sm" style={{ color: 'var(--p-text-5)' }}>No handoffs recorded</td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-nowrap">
                    <div className="font-semibold text-sm" style={{ color: 'var(--p-text-1)' }}>{item.customer_name || text('Caller')}</div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--p-text-5)' }}>{item.phone_number}</div>
                  </td>
                  <td>
                    <span className={`badge ${item.urgency === 'high' ? 'badge-red' : 'badge-gray'}`}>
                      {item.urgency === 'high' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 pulse-dot" />}
                      {text(item.urgency)}
                    </span>
                  </td>
                  <td className="font-medium text-sm" style={{ color: 'var(--p-text-1)' }}>{item.reason}</td>
                  <td className="max-w-xs truncate text-xs" style={{ color: 'var(--p-text-4)' }} title={item.conversation_summary || undefined}>
                    {item.conversation_summary}
                  </td>
                  <td>
                    <span className="badge badge-amber">{text(item.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sm:hidden">
          {loading ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--p-text-5)' }}>Loading...</div>
          ) : items.map((item) => (
            <div key={item.id} className="p-4 space-y-2.5" style={{ borderBottom: '1px solid var(--p-border-2)' }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>{item.customer_name || text('Caller')}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--p-text-5)' }}>{item.phone_number}</p>
                </div>
                <div className="flex gap-2">
                  <span className={`badge ${item.urgency === 'high' ? 'badge-red' : 'badge-gray'}`}>{text(item.urgency)}</span>
                  <span className="badge badge-amber">{text(item.status)}</span>
                </div>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--p-text-1)' }}>{item.reason}</p>
              {item.conversation_summary && (
                <p className="text-xs line-clamp-2" style={{ color: 'var(--p-text-4)' }}>{item.conversation_summary}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
