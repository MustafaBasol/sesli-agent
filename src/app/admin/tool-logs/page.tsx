'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ToolLogsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase.from('tool_logs').select('*').order('created_at', { ascending: false });
    if (!error) setItems(data || []);
    setLoading(false);
  }

  return (
    <div>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white">System Tool Logs</h2>
        <p className="text-gray-400 mt-1">Raw request/response data for debugging Vapi tool calls.</p>
      </header>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl text-xs font-mono">
        <table className="w-full text-left">
          <thead className="bg-gray-800/50 text-gray-400 uppercase text-[10px] font-bold">
            <tr>
              <th className="px-6 py-4">Timestamp</th>
              <th className="px-6 py-4">Tool Name</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Payloads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">Loading logs...</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">{new Date(item.created_at).toLocaleString()}</td>
                <td className="px-6 py-4">
                  <span className="text-orange-500 font-bold">{item.tool_name}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-1.5 py-0.5 rounded ${
                    item.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-6 py-4 space-y-2">
                  <details className="cursor-pointer">
                    <summary className="text-blue-400 hover:underline">View Request</summary>
                    <pre className="mt-2 p-2 bg-gray-950 rounded border border-gray-800 overflow-x-auto max-w-lg">
                      {JSON.stringify(item.request_payload, null, 2)}
                    </pre>
                  </details>
                  {item.response_payload && (
                    <details className="cursor-pointer">
                      <summary className="text-purple-400 hover:underline">View Response</summary>
                      <pre className="mt-2 p-2 bg-gray-950 rounded border border-gray-800 overflow-x-auto max-w-lg">
                        {JSON.stringify(item.response_payload, null, 2)}
                      </pre>
                    </details>
                  )}
                  {item.error_message && (
                    <div className="text-red-400 mt-1">Error: {item.error_message}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
