'use client';

import { useEffect, useState } from 'react';
import { getAnalyticsData } from './actions';

type AnalyticsPeriod = 'week' | 'month' | 'year';

const PERIOD_OPTIONS: { key: AnalyticsPeriod; label: string }[] = [
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
];

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<AnalyticsPeriod>('week');

  useEffect(() => {
    setLoading(true);
    getAnalyticsData(period).then(res => {
      setData(res);
      setLoading(false);
    });
  }, [period]);

  if (loading) return <div className="p-12 text-center text-gray-500 font-black animate-pulse">Gathering Golden Insights...</div>;

  const maxCallCount = Math.max(...data.peakCallHours, 1);
  const maxResCount = Math.max(...data.peakResHours, 1);
  const peakReservationHour = data.peakResHours.indexOf(Math.max(...data.peakResHours));
  const activeLanguages = Object.entries(data.languages).filter(([, count]: [string, any]) => count > 0);

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Performance Analytics</h2>
          <p className="text-gray-400 mt-1">AI agent interactions and bookings for {data.period.label.toLowerCase()}.</p>
        </div>
        <div className="inline-flex bg-gray-900 border border-gray-800 rounded-2xl p-1 w-full sm:w-auto">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setPeriod(option.key)}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                period === option.key
                  ? 'bg-orange-600 text-white shadow-lg shadow-orange-950/30'
                  : 'text-gray-500 hover:text-white hover:bg-gray-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {Object.values(data.errors || {}).some(Boolean) && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-2xl p-4 text-sm">
          Some analytics sources could not be loaded. Check server logs for details.
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl shadow-xl">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total Calls</p>
          <h4 className="text-4xl font-black text-white">{data.summary.totalCalls}</h4>
          <p className="text-[10px] text-green-500 mt-2 font-bold">{data.summary.todayCalls} today</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl shadow-xl">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Conversion Rate</p>
          <h4 className="text-4xl font-black text-orange-500">{data.summary.conversionRate}%</h4>
          <p className="text-[10px] text-gray-500 mt-2 font-bold italic">{data.summary.confirmedReservations} confirmed reservations</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl shadow-xl">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Handoffs</p>
          <h4 className="text-4xl font-black text-blue-500">{data.summary.handoffRate}%</h4>
          <p className="text-[10px] text-gray-500 mt-2 font-bold italic">{data.summary.handoffs} requested human support</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl shadow-xl">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Customers</p>
          <h4 className="text-4xl font-black text-red-500">{data.summary.totalCustomers}</h4>
          <p className="text-[10px] text-gray-500 mt-2 font-bold italic">{data.summary.cancellations} cancellations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Hourly Traffic Chart (CSS based) */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 p-8 rounded-3xl shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Hourly Call Traffic</h3>
            <span className="text-[10px] text-gray-500 font-bold">{data.summary.todayReservations} reservations today</span>
          </div>
          <div className="flex items-end justify-between h-48 gap-1">
            {data.peakCallHours.map((count: number, h: number) => (
              <div key={h} className="flex-1 flex flex-col items-center group">
                <div 
                  className="w-full bg-orange-600/20 group-hover:bg-orange-500 transition-all rounded-t-lg relative"
                  style={{ height: `${(count / maxCallCount) * 100}%` }}
                >
                  {count > 0 && <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-black text-orange-500">{count}</span>}
                </div>
                <span className="text-[8px] text-gray-600 mt-2 font-bold">{h}h</span>
              </div>
            ))}
          </div>
        </div>

        {/* Language & Handoff Info */}
        <div className="lg:col-span-1 bg-gray-900 border border-gray-800 p-8 rounded-3xl shadow-2xl space-y-8">
          <div>
            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6">Language Distribution</h3>
            <div className="space-y-4">
              {(activeLanguages.length ? activeLanguages : Object.entries(data.languages)).map(([lang, count]: [string, any]) => (
                <div key={lang}>
                  <div className="flex justify-between text-[10px] font-black mb-1">
                    <span className="text-white">{lang}</span>
                    <span className="text-gray-500">{count} Calls</span>
                  </div>
                  <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-orange-500 h-full" style={{ width: `${(count / data.summary.totalCalls * 100) || 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-8 border-t border-gray-800">
            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Peak Reservation Time</h3>
            <p className="text-3xl font-black text-white">
              {maxResCount > 0 ? `${peakReservationHour}:00` : 'N/A'}
            </p>
            <p className="text-[10px] text-gray-500 italic mt-1">Most requested slot for dining.</p>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl shadow-2xl">
        <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6">Recent Activity</h3>
        {data.recentActivity.length === 0 ? (
          <p className="text-gray-500 italic text-sm">No activity recorded yet.</p>
        ) : (
          <div className="divide-y divide-gray-800">
            {data.recentActivity.map((item: any, index: number) => (
              <div key={`${item.type}-${index}`} className="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <span className="text-[10px] text-orange-500 bg-orange-500/10 border border-orange-500/20 rounded px-2 py-1 font-black uppercase">{item.type}</span>
                  <h4 className="text-white font-bold mt-3">{item.title || 'Unknown'}</h4>
                  <p className="text-sm text-gray-400 mt-1">{item.detail}</p>
                </div>
                <span className="text-[10px] text-gray-500 font-mono">{new Date(item.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
