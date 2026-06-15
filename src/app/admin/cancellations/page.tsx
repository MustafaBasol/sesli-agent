'use client';

import { useEffect, useState } from 'react';
import { getReservationCancellations } from './actions';

export default function CancellationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    setLoading(true);
    try {
      const data = await getReservationCancellations();
      setItems(data || []);
    } catch (error) {
      console.error('[CANCELLATIONS PAGE ERROR]', error);
      setItems([]);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6 pb-10">
      <header>
        <p className="page-label">AI Activity</p>
        <h2 className="page-title">Cancellation Requests</h2>
        <p className="page-subtitle">Reservations that guests wished to cancel.</p>
      </header>

      <div className="card">
        <div className="hidden sm:block table-container">
          <table className="admin-table">
            <thead>
              <tr>
                {['Customer', 'Reservation', 'Reason', 'Status'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-12 text-sm" style={{ color: 'var(--p-text-5)' }}>Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-16 text-sm" style={{ color: 'var(--p-text-5)' }}>No cancellation requests</td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="font-semibold text-sm" style={{ color: 'var(--p-text-1)' }}>{item.customer_name}</div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--p-text-5)' }}>{item.phone_number}</div>
                  </td>
                  <td className="text-sm" style={{ color: 'var(--p-text-3)' }}>{item.reservation_date} {item.reservation_time}</td>
                  <td className="text-sm italic max-w-xs truncate" style={{ color: 'var(--p-text-4)' }} title={item.reason}>
                    {item.reason ? `"${item.reason}"` : <span className="not-italic" style={{ color: 'var(--p-text-5)' }}>—</span>}
                  </td>
                  <td>
                    <span className="badge badge-red">{item.status}</span>
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
            <div key={item.id} className="p-4 space-y-2" style={{ borderBottom: '1px solid var(--p-border-2)' }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>{item.customer_name}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--p-text-5)' }}>{item.phone_number}</p>
                </div>
                <span className="badge badge-red">{item.status}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--p-text-4)' }}>{item.reservation_date} {item.reservation_time}</p>
              {item.reason && <p className="text-xs italic" style={{ color: 'var(--p-text-4)' }}>"{item.reason}"</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
