'use client';

import { useEffect, useState } from 'react';
import { getReservationChanges } from './actions';
import { useI18n } from '@/i18n/provider';

type ReservationChange = {
  id: string;
  customer_name: string;
  phone_number: string;
  original_reservation_date: string;
  original_reservation_time: string;
  new_reservation_date: string;
  new_reservation_time: string;
  status: string;
};

export default function ChangesPage() {
  const { text } = useI18n();
  const [items, setItems] = useState<ReservationChange[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchItems() {
    setLoading(true);
    try {
      const data = await getReservationChanges();
      setItems(data || []);
    } catch (error) {
      console.error('[CHANGES PAGE ERROR]', error);
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
        <h2 className="page-title">Modification Requests</h2>
        <p className="page-subtitle">Changes to existing reservations made by the AI.</p>
      </header>

      <div className="card">
        <div className="hidden sm:block table-container">
          <table className="admin-table">
            <thead>
              <tr>
                {['Customer', 'Original', 'New Date', 'Status'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-12 text-sm" style={{ color: 'var(--p-text-5)' }}>Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-16 text-sm" style={{ color: 'var(--p-text-5)' }}>No modification requests</td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="font-semibold text-sm" style={{ color: 'var(--p-text-1)' }}>{item.customer_name}</div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--p-text-5)' }}>{item.phone_number}</div>
                  </td>
                  <td className="text-sm" style={{ color: 'var(--p-text-4)' }}>{item.original_reservation_date} {item.original_reservation_time}</td>
                  <td className="text-sm font-semibold" style={{ color: 'var(--p-accent-text)' }}>{item.new_reservation_date} {item.new_reservation_time}</td>
                  <td>
                    <span className="badge badge-blue">{text(item.status)}</span>
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
                <span className="badge badge-blue">{text(item.status)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="form-label">Original</p>
                  <p className="text-xs" style={{ color: 'var(--p-text-3)' }}>{item.original_reservation_date} {item.original_reservation_time}</p>
                </div>
                <div>
                  <p className="form-label">New</p>
                  <p className="text-xs font-semibold" style={{ color: 'var(--p-accent-text)' }}>{item.new_reservation_date} {item.new_reservation_time}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
