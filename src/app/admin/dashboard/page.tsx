'use client';

import { useEffect, useState } from 'react';
import { getDashboardStats } from './actions';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardStats()
      .then(res => {
        setStats(res);
        setLoading(false);
      })
      .catch(err => {
        console.error('Dashboard Error:', err);
        setError('Veriler yüklenirken bir sorun oluştu. Lütfen Ngrok bağlantınızı kontrol edin.');
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-500 font-black text-xs uppercase tracking-[0.3em]">Golden Meat Loading...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-black p-6">
      <div className="bg-red-900/20 border border-red-500/30 p-8 rounded-[40px] max-w-md text-center">
        <h3 className="text-red-500 font-black text-xl mb-2">Bağlantı Hatası</h3>
        <p className="text-gray-400 text-sm mb-6">{error}</p>
        <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest">Sistemi Yenile</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Executive Dashboard</h2>
          <p className="text-gray-400 mt-1 italic">Real-time pulse of Golden Meat.</p>
        </div>
        <div className="hidden md:block text-[10px] text-gray-500 font-black uppercase tracking-widest bg-gray-900/50 border border-gray-800 px-4 py-2 rounded-2xl">
          System Status: <span className="text-green-500 ml-1">● Optimal</span>
        </div>
      </header>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-900 border border-gray-800 p-8 rounded-[40px] shadow-2xl hover:border-orange-500/30 transition-all">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Total Guests</p>
          <h4 className="text-5xl font-black text-white">{stats.totalCustomers}</h4>
        </div>

        <div className="bg-gray-900 border border-gray-800 p-8 rounded-[40px] shadow-2xl hover:border-orange-500/30 transition-all">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Active Tables</p>
          <h4 className="text-5xl font-black text-orange-500">{stats.activeTables}</h4>
          <p className="text-[10px] text-gray-600 font-bold mt-1">out of {stats.totalTables} tables</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 p-8 rounded-[40px] shadow-2xl hover:border-orange-500/30 transition-all">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Today's Bookings</p>
          <h4 className="text-5xl font-black text-white">{stats.todayReservations}</h4>
        </div>

        <div className="bg-gray-900 border border-gray-800 p-8 rounded-[40px] shadow-2xl hover:border-orange-500/30 transition-all">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Menu Catalog</p>
          <h4 className="text-5xl font-black text-white">{stats.menuItems}</h4>
          <p className="text-[10px] text-gray-600 font-bold mt-1">active items</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 p-10 rounded-[50px] shadow-2xl">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-8 flex items-center">
            <span className="w-2 h-2 bg-orange-500 rounded-full mr-3 animate-ping"></span>
            Recent Activity
          </h3>
          <div className="space-y-6">
            {stats.recentReservations?.length > 0 ? stats.recentReservations.map((res: any) => (
              <div key={res.id} className="flex items-center justify-between p-4 bg-gray-800/20 rounded-3xl border border-gray-800 hover:border-gray-700 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-800 rounded-2xl flex items-center justify-center text-lg">🍖</div>
                  <div>
                    <p className="text-white font-bold text-sm">{res.customers?.full_name || 'Guest'}</p>
                    <p className="text-[10px] text-gray-500">{res.reservation_date} at {res.reservation_time}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-3 py-1 bg-orange-500/10 text-orange-500 rounded-full text-[9px] font-black uppercase tracking-widest">
                    {res.party_size} Pax
                  </span>
                </div>
              </div>
            )) : <p className="text-gray-600 italic text-sm">Henüz aktivite bulunmuyor.</p>}
          </div>
        </div>

        <div className="lg:col-span-1 bg-orange-600 p-10 rounded-[50px] shadow-2xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/20 transition-all"></div>
          <div>
            <h3 className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] mb-4">AI Insight</h3>
            <p className="text-3xl font-black text-white leading-tight">Your AI Agent is active and learning.</p>
          </div>
          <p className="text-white/80 text-xs mt-6 font-medium italic">"Müşterileriniz en çok hafta sonu akşam saatlerini soruyor."</p>
        </div>
      </div>
    </div>
  );
}
