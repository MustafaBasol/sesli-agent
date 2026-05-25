'use client';

import { useEffect, useState } from 'react';
import { getMonthlyReservations } from './actions';
import { getBlackoutDates, toggleBlackoutDate } from '../settings/actions';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [blackouts, setBlackouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  async function fetchData() {
    setLoading(true);
    const [resData, blackoutData] = await Promise.all([
      getMonthlyReservations(currentDate.getFullYear(), currentDate.getMonth()),
      getBlackoutDates()
    ]);
    setReservations(resData || []);
    setBlackouts(blackoutData || []);
    setLoading(false);
  }

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const padding = Array.from({ length: firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1 }, (_, i) => null);

  const getDayStatus = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isBlackout = blackouts.some(b => b.date === dateStr);
    const dayRes = reservations.filter(r => r.reservation_date === dateStr);
    return { isBlackout, dayRes, dateStr };
  };

  const selectedDayReservations = reservations.filter(r => r.reservation_date === selectedDate);
  const isSelectedDateBlackout = blackouts.some(b => b.date === selectedDate);

  async function handleToggleBlackout() {
    if (selectedDate && confirm(`${selectedDate} tarihini kapatmak/açmak istediğinize emin misiniz?`)) {
      await toggleBlackoutDate(selectedDate, 'Closed by admin');
      fetchData();
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
      {/* Left: Calendar Grid */}
      <div className="lg:col-span-3">
        <header className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Booking Calendar</h2>
            <p className="text-gray-400 mt-1">Select a day to view daily schedule.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <input 
              type="date" 
              className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-orange-500"
              value={currentDate.toISOString().split('T')[0]}
              onChange={(e) => {
                const newDate = new Date(e.target.value);
                setCurrentDate(newDate);
                setSelectedDate(e.target.value);
              }}
            />
            <div className="flex gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800">
              <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="hover:bg-gray-800 px-3 py-1 rounded-lg transition-all text-white font-black">◀</button>
              <span className="font-bold text-white min-w-[120px] text-center flex items-center justify-center text-xs sm:text-sm">
                {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="hover:bg-gray-800 px-3 py-1 rounded-lg transition-all text-white font-black">▶</button>
            </div>
          </div>
        </header>

        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-3 sm:p-6 shadow-2xl overflow-hidden">
          <div className="grid grid-cols-7 mb-4 border-b border-gray-800 pb-4">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="text-center text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-widest">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-2">
            {padding.map((_, i) => <div key={`p-${i}`} className="h-14 sm:h-24 md:h-32 bg-gray-800/10 rounded-xl sm:rounded-2xl" />)}
            {days.map(day => {
              const { isBlackout, dayRes, dateStr } = getDayStatus(day);
              const isSelected = selectedDate === dateStr;
              return (
                <div 
                  key={day} 
                  onClick={() => setSelectedDate(dateStr)}
                  className={`h-14 sm:h-24 md:h-32 p-1.5 sm:p-3 rounded-xl sm:rounded-2xl border cursor-pointer transition-all relative ${
                    isSelected ? 'ring-2 ring-orange-500 border-transparent shadow-[0_0_20px_rgba(249,115,22,0.2)]' : 
                    isBlackout ? 'bg-red-900/10 border-red-900/30' : 
                    'bg-gray-800/30 border-gray-800/50 hover:bg-gray-800/50'
                  }`}
                >
                  <span className={`text-xs sm:text-sm font-black ${isSelected ? 'text-orange-500' : isBlackout ? 'text-red-800' : 'text-gray-600'}`}>{day}</span>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {isBlackout && <div className="h-1 w-full bg-red-600 rounded-full" />}
                    {dayRes.length > 0 && <span className="hidden sm:block text-[10px] text-orange-500 font-bold mt-1">{dayRes.length}</span>}
                    {dayRes.length > 0 && <div className="block sm:hidden w-1.5 h-1.5 bg-orange-500 rounded-full mt-0.5" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Day Detail Panel */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-4 sm:p-6 lg:sticky lg:top-8 shadow-2xl lg:h-[calc(100vh-120px)] flex flex-col">
          <header className="mb-4 sm:mb-6 border-b border-gray-800 pb-4">
            <h3 className="text-lg sm:text-xl font-black text-white">{selectedDate || 'Select a day'}</h3>
            <p className="text-gray-500 text-xs font-bold uppercase mt-1">Daily Schedule</p>
          </header>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {isSelectedDateBlackout ? (
              <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-2xl text-center">
                <p className="text-red-500 font-bold text-sm">Restaurant Closed</p>
                <p className="text-red-700 text-[10px] mt-1">No reservations allowed for this date.</p>
              </div>
            ) : selectedDayReservations.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 italic text-sm">No reservations for this day.</p>
              </div>
            ) : selectedDayReservations.map((res: any) => (
              <a 
                key={res.id} 
                href={`/admin/customers/${res.customer_id}`}
                className="block bg-gray-800/50 border border-gray-700/50 p-4 rounded-2xl hover:border-orange-500/50 hover:bg-gray-800 transition-all group"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-orange-500 font-black text-sm">{res.reservation_time}</span>
                  <span className="text-[10px] font-black text-gray-500 uppercase group-hover:text-orange-500 transition-colors">Details ➔</span>
                </div>
                <p className="text-white font-bold text-sm">{res.customer_name}</p>
                <p className="text-[10px] text-gray-500 font-mono mt-1">{res.phone_number}</p>
                {res.tables && (
                  <div className="mt-3 inline-block bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded border border-orange-500/20 text-[10px] font-black">
                    TABLE {res.tables.table_number}
                  </div>
                )}
              </a>
            ))}
          </div>

          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-800">
            <button 
              onClick={handleToggleBlackout}
              className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                isSelectedDateBlackout ? 'bg-green-600/10 text-green-500 border border-green-500/20 hover:bg-green-600/20' : 
                'bg-red-600/10 text-red-500 border border-red-500/20 hover:bg-red-600/20'
              }`}
            >
              {isSelectedDateBlackout ? 'Open Restaurant' : 'Close This Day'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
