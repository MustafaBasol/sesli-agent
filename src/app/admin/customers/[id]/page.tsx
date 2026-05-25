'use client';

import { useEffect, useState } from 'react';
import { getCustomerDetail } from './actions';
import { useParams } from 'next/navigation';

function getNestedValue(source: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], source);
    if (value) return value;
  }
  return null;
}

function firstUrl(...values: any[]) {
  for (const value of values) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}

function formatTranscript(transcript: any) {
  if (!transcript) return null;
  if (typeof transcript === 'string') return transcript;
  if (Array.isArray(transcript)) {
    return transcript
      .map((item) => {
        const speaker = item.role || item.speaker || item.type || 'message';
        const text = item.message || item.content || item.text || '';
        const time = typeof item.time === 'number' ? ` ${item.time.toFixed(1)}s` : '';
        return text ? `[${speaker}${time}] ${text}` : null;
      })
      .filter(Boolean)
      .join('\n');
  }
  return JSON.stringify(transcript, null, 2);
}

function getCallArtifacts(call: any) {
  const raw = call.raw_payload || {};
  const message = raw.message || raw;
  const artifact = message.artifact || raw.artifact || {};

  return {
    callId: call.vapi_call_id || message.call?.id || raw.call?.id || null,
    phone: call.caller_phone || message.customer?.number || message.call?.customer?.number || null,
    startedAt: call.started_at || message.startedAt || null,
    endedAt: call.ended_at || message.endedAt || null,
    endedReason: message.endedReason || call.outcome || null,
    cost: message.cost ?? null,
    recordingUrl: firstUrl(
      message.recordingUrl,
      message.artifact?.recordingUrl,
      message.artifact?.recording?.mono?.combinedUrl,
      message.artifact?.recording?.stereoUrl,
      message.stereoRecordingUrl,
      raw.recordingUrl,
      raw.artifact?.recordingUrl,
      raw.artifact?.recording?.mono?.combinedUrl,
      raw.artifact?.recording?.stereoUrl,
      raw.stereoRecordingUrl
    ),
    logUrl: getNestedValue(raw, [
      'message.artifact.logUrl',
      'message.logUrl',
      'artifact.logUrl',
      'logUrl',
    ]),
    transcript: formatTranscript(
      getNestedValue(raw, [
        'message.transcript',
        'message.artifact.transcript',
        'message.artifact.messages',
        'artifact.transcript',
        'artifact.messages',
        'transcript',
      ])
    ),
    structuredData: message.analysis?.structuredData || raw.analysis?.structuredData || null,
    raw,
  };
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<any>(null);

  useEffect(() => {
    if (id) fetchDetail();
  }, [id]);

  async function fetchDetail() {
    setLoading(true);
    const detail = await getCustomerDetail(id as string);
    setData(detail);
    setLoading(false);
  }

  if (loading) return <div className="p-12 text-center text-gray-500 font-bold animate-pulse">Loading Golden Profile...</div>;
  if (!data?.profile) return <div className="p-12 text-center text-red-500">Customer not found.</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Profile Card */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 sticky top-8 shadow-2xl">
          <div className="w-20 h-20 bg-orange-600 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-lg shadow-orange-900/40 font-black text-white">
            {data.profile.full_name?.charAt(0) || 'U'}
          </div>
          <h2 className="text-2xl font-black text-white">{data.profile.full_name || 'Anonymous'}</h2>
          <p className="text-orange-500 font-mono mt-1">{data.profile.phone_number}</p>
          
          <div className="mt-8 space-y-4 border-t border-gray-800 pt-8">
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-widest">Total Visits</span>
              <span className="text-white font-black">{(data.reservations || []).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs font-bold uppercase tracking-widest">Last Visit</span>
              <span className="text-white font-black">{data.profile.last_visit_at?.split('T')[0] || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="lg:col-span-2 space-y-8">
        <section>
          <h3 className="text-xl font-black text-white mb-4 flex items-center">
            <span className="mr-3 text-orange-500">📅</span> Reservation History
          </h3>
          <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-800/50 text-gray-400 uppercase text-[10px] font-black tracking-widest">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Table</th>
                  <th className="px-6 py-4">Party</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {(!data.reservations || data.reservations.length === 0) ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-600 italic">No reservation history.</td></tr>
                ) : data.reservations.map((res: any) => (
                  <tr key={res.id} className="hover:bg-gray-800/20 transition-all">
                    <td className="px-6 py-4 text-white font-bold">{res.reservation_date} @ {res.reservation_time}</td>
                    <td className="px-6 py-4">
                      {res.tables ? <span className="text-orange-500 font-black">T-{res.tables.table_number}</span> : <span className="text-gray-700">-</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-400 font-black">👥 {res.party_size}</td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] uppercase font-black text-green-500 border border-green-500/20 px-2 py-1 rounded bg-green-500/5">{res.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="text-xl font-black text-white mb-4 flex items-center">
            <span className="mr-3 text-blue-500">📞</span> AI Call Logs
          </h3>
          <div className="space-y-4">
            {(!data.calls || data.calls.length === 0) ? (
              <p className="text-gray-600 italic py-8 text-center bg-gray-900 rounded-3xl border border-gray-800">No calls recorded yet.</p>
            ) : data.calls.map((call: any) => (
              <button
                key={call.id}
                type="button"
                onClick={() => setSelectedCall(call)}
                className="w-full text-left bg-gray-900 border border-gray-800 p-6 rounded-3xl hover:border-blue-500/50 hover:bg-gray-800/40 transition-all"
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] bg-blue-600/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded font-black uppercase tracking-tighter">{call.intent}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{new Date(call.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed italic font-serif">"{call.summary}"</p>
                <div className="mt-4 text-[10px] text-gray-600 font-black uppercase">Outcome: {call.outcome || 'N/A'}</div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {selectedCall && (() => {
        const artifacts = getCallArtifacts(selectedCall);
        const isFallback = selectedCall.source === 'reservation';

        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-4xl max-h-[88vh] overflow-y-auto bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl">
              <div className="sticky top-0 bg-gray-950/95 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-white">Call Details</h3>
                  <p className="text-xs text-gray-500 font-mono mt-1">{artifacts.callId || selectedCall.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCall(null)}
                  className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600"
                  aria-label="Close call details"
                >
                  X
                </button>
              </div>

              <div className="p-6 space-y-6">
                {isFallback && (
                  <div className="border border-yellow-500/20 bg-yellow-500/10 text-yellow-200 rounded-xl p-4 text-sm">
                    Bu kayıt rezervasyondan oluşturulmuş özet kaydıdır. Gerçek Vapi çağrı raporu olmadığı için ses kaydı ve transkript bulunmuyor.
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {[
                    ['Intent', selectedCall.intent || '-'],
                    ['Outcome', artifacts.endedReason || '-'],
                    ['Phone', artifacts.phone || data.profile.phone_number || '-'],
                    ['Cost', artifacts.cost !== null ? `$${artifacts.cost}` : '-'],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{label}</div>
                      <div className="text-sm text-white font-bold mt-2 break-words">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-3">Summary</div>
                  <p className="text-gray-200 text-sm leading-relaxed">{selectedCall.summary || 'No summary saved.'}</p>
                </div>

                {selectedCall.details && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-3">Reservation Data</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="text-gray-400">Date: <span className="text-white">{selectedCall.details.reservation_date}</span></div>
                      <div className="text-gray-400">Time: <span className="text-white">{selectedCall.details.reservation_time}</span></div>
                      <div className="text-gray-400">Party: <span className="text-white">{selectedCall.details.party_size}</span></div>
                      <div className="text-gray-400">Table: <span className="text-white">{selectedCall.details.table_number ? `T-${selectedCall.details.table_number}` : '-'}</span></div>
                    </div>
                  </div>
                )}

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-3">Recording</div>
                  {artifacts.recordingUrl ? (
                    <div className="space-y-3">
                      <audio controls className="w-full" src={artifacts.recordingUrl} />
                      <a className="text-sm text-blue-400 hover:text-blue-300" href={artifacts.recordingUrl} target="_blank" rel="noreferrer">Open recording</a>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No recording URL saved for this entry.</p>
                  )}
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-3">Transcript</div>
                  {artifacts.transcript ? (
                    <pre className="whitespace-pre-wrap text-sm text-gray-200 leading-relaxed font-mono">{artifacts.transcript}</pre>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No transcript saved for this entry.</p>
                  )}
                </div>

                {artifacts.structuredData && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-3">Structured Data</div>
                    <pre className="whitespace-pre-wrap text-xs text-gray-300 font-mono">{JSON.stringify(artifacts.structuredData, null, 2)}</pre>
                  </div>
                )}

                <details className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <summary className="cursor-pointer text-sm text-blue-400 font-bold">Raw Vapi Payload</summary>
                  <pre className="mt-4 whitespace-pre-wrap text-xs text-gray-400 font-mono">{JSON.stringify(artifacts.raw, null, 2)}</pre>
                </details>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
