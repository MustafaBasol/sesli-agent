'use client';

import { useEffect, useState } from 'react';
import { getToolLogs } from './actions';

export default function ToolLogsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchItems(); }, []);

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
    <div className="space-y-6 pb-10">
      <header>
        <p className="page-label">System</p>
        <h2 className="page-title">Tool Logs</h2>
        <p className="page-subtitle">Raw request/response data for Vapi tool calls.</p>
      </header>

      <div className="card font-mono text-xs">
        <div className="hidden sm:block table-container">
          <table className="admin-table">
            <thead>
              <tr>
                {['Timestamp', 'Tool', 'Status', 'Payloads'].map((h) => (
                  <th key={h} style={{ fontFamily: 'inherit' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-12 text-sm" style={{ color: 'var(--p-text-5)', fontFamily: 'inherit' }}>Loading logs...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-16 text-sm" style={{ color: 'var(--p-text-5)', fontFamily: 'inherit' }}>No logs recorded</td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-nowrap text-[11px]" style={{ color: 'var(--p-text-5)' }}>{new Date(item.created_at).toLocaleString()}</td>
                  <td>
                    <span className="font-bold" style={{ color: 'var(--p-accent-text)' }}>{item.tool_name}</span>
                  </td>
                  <td>
                    <span className={`badge ${item.status === 'success' ? 'badge-green' : 'badge-red'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="space-y-2">
                    <details className="cursor-pointer">
                      <summary className="text-[11px] select-none" style={{ color: '#60a5fa' }}>View Request</summary>
                      <pre className="mt-2 p-3 rounded-lg overflow-x-auto max-w-lg leading-relaxed text-[11px]" style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {JSON.stringify(item.request_payload, null, 2)}
                      </pre>
                    </details>
                    {item.response_payload && (
                      <details className="cursor-pointer">
                        <summary className="text-[11px] select-none" style={{ color: '#c084fc' }}>View Response</summary>
                        <pre className="mt-2 p-3 rounded-lg overflow-x-auto max-w-lg leading-relaxed text-[11px]" style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                          {JSON.stringify(item.response_payload, null, 2)}
                        </pre>
                      </details>
                    )}
                    {item.error_message && (
                      <p className="text-[11px] mt-1 text-red-400">Error: {item.error_message}</p>
                    )}
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
              <div className="flex justify-between items-center">
                <span className="font-bold" style={{ color: 'var(--p-accent-text)' }}>{item.tool_name}</span>
                <span className={`badge ${item.status === 'success' ? 'badge-green' : 'badge-red'}`}>{item.status}</span>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{new Date(item.created_at).toLocaleString()}</p>
              <details className="cursor-pointer">
                <summary style={{ color: '#60a5fa' }} className="text-[11px]">View Request</summary>
                <pre className="mt-2 p-2 rounded-lg overflow-x-auto text-[10px]" style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {JSON.stringify(item.request_payload, null, 2)}
                </pre>
              </details>
              {item.response_payload && (
                <details className="cursor-pointer">
                  <summary style={{ color: '#c084fc' }} className="text-[11px]">View Response</summary>
                  <pre className="mt-2 p-2 rounded-lg overflow-x-auto text-[10px]" style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {JSON.stringify(item.response_payload, null, 2)}
                  </pre>
                </details>
              )}
              {item.error_message && <p className="text-red-400 text-[11px]">Error: {item.error_message}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
