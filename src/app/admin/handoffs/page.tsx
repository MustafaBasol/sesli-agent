'use client';

import { useEffect, useState } from 'react';
import { getStaffHandoffs } from './actions';

export default function HandoffsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItems();
  }, []);

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

  return (
    <div>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white">Staff Handoffs</h2>
        <p className="text-gray-400 mt-1">Urgent requests for human assistance.</p>
      </header>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs font-bold">
            <tr>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Urgency</th>
              <th className="px-6 py-4">Reason</th>
              <th className="px-6 py-4">Summary</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading handoffs...</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-bold text-white">{item.customer_name || 'Caller'}</div>
                  <div className="text-xs text-gray-500">{item.phone_number}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                    item.urgency === 'high' ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {item.urgency}
                  </span>
                </td>
                <td className="px-6 py-4 text-white font-medium">{item.reason}</td>
                <td className="px-6 py-4 max-w-xs truncate text-gray-400">{item.conversation_summary}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-orange-500/10 text-orange-500">
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
