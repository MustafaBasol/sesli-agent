'use client';

import { useEffect, useState } from 'react';
import { getReservationChanges } from './actions';

export default function ChangesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItems();
  }, []);

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

  return (
    <div>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white">Modification Requests</h2>
        <p className="text-gray-400 mt-1">Changes to existing reservations.</p>
      </header>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs font-bold">
            <tr>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Original Date</th>
              <th className="px-6 py-4">New Date</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">Loading changes...</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-bold text-white">{item.customer_name}</div>
                  <div className="text-xs text-gray-500">{item.phone_number}</div>
                </td>
                <td className="px-6 py-4 text-gray-400">
                  {item.original_reservation_date} {item.original_reservation_time}
                </td>
                <td className="px-6 py-4 text-orange-400 font-bold">
                  {item.new_reservation_date} {item.new_reservation_time}
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-500/10 text-blue-500">
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
