'use client';

import { useEffect, useState } from 'react';
import { getToolLogs } from './actions';

export default function ToolLogsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    setLoading(true);
    try {
      const data = await getToolLogs();
      setItems(data || []);
    } catch (error) {
      console.error('[TOOL LOGS PAGE ERROR]', error);
      setItems([]);
    }
    setLoading(false);
  }

  return (
    <div>
      <header className="mb-6 md:mb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-white">System Tool Logs</h2>
        <p className="text-gray-400 mt-1">Raw request/response data for debugging Vapi tool calls.</p>
      </header>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl text-xs font-mono">
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
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
                  <td className="px-6 py-4"><span className="text-orange-500 font-bold">{item.tool_name}</span></td>
                  <td className="px-6 py-4">
                    <span className={`px-1.5 py-0.5 rounded ${
                      item.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    }`}>{item.status}</span>
                  </td>
                  <td className="px-6 py-4 space-y-2">
                    <details className="cursor-pointer">
                      <summary className="text-blue-400 hover:underline">View Request</summary>
                      <pre className="mt-2 p-2 bg-gray-950 rounded border border-gray-800 overflow-x-auto max-w-lg">{JSON.stringify(item.request_payload, null, 2)}</pre>
                    </details>
                    {item.response_payload && (
                      <details className="cursor-pointer">
                        <summary className="text-purple-400 hover:underline">View Response</summary>
                        <pre className="mt-2 p-2 bg-gray-950 rounded border border-gray-800 overflow-x-auto max-w-lg">{JSON.stringify(item.response_payload, null, 2)}</pre>
                      </details>
                    )}
                    {item.error_message && <div className="text-red-400 mt-1">Error: {item.error_message}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y divide-gray-800">
          {loading ? (
            <div className="px-4 py-10 text-center text-gray-500">Loading logs...</div>
          ) : items.map((item) => (
            <div key={item.id} className="p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-orange-500 font-bold">{item.tool_name}</span>
                <span className={`px-1.5 py-0.5 rounded ${
                  item.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                }`}>{item.status}</span>
              </div>
              <p className="text-gray-500 text-[10px]">{new Date(item.created_at).toLocaleString()}</p>
              <details className="cursor-pointer">
                <summary className="text-blue-400 hover:underline text-[11px]">View Request</summary>
                <pre className="mt-2 p-2 bg-gray-950 rounded border border-gray-800 overflow-x-auto text-[10px]">{JSON.stringify(item.request_payload, null, 2)}</pre>
              </details>
              {item.response_payload && (
                <details className="cursor-pointer">
                  <summary className="text-purple-400 hover:underline text-[11px]">View Response</summary>
                  <pre className="mt-2 p-2 bg-gray-950 rounded border border-gray-800 overflow-x-auto text-[10px]">{JSON.stringify(item.response_payload, null, 2)}</pre>
                </details>
              )}
              {item.error_message && <div className="text-red-400 text-[11px]">Error: {item.error_message}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
