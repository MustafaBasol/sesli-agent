'use client';

import { useEffect, useState } from 'react';
import { getCalls } from './actions';

export default function CallsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItems();
  }, []);

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

  return (
    <div>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white">Call History</h2>
        <p className="text-gray-400 mt-1">Full list of inbound calls handled by the receptionist.</p>
      </header>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs font-bold">
            <tr>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Intent</th>
              <th className="px-6 py-4">Outcome</th>
              <th className="px-6 py-4">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading calls...</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-gray-400">{new Date(item.created_at).toLocaleString()}</td>
                <td className="px-6 py-4">
                  <div className="text-white font-medium">{item.customer_name || 'Unknown'}</div>
                  <div className="text-xs text-gray-500">{item.caller_phone}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-gray-800 rounded text-xs border border-gray-700">{item.intent}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                    item.outcome === 'completed' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                  }`}>{item.outcome}</span>
                </td>
                <td className="px-6 py-4 max-w-xs truncate text-gray-400" title={item.summary}>{item.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
