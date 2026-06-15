'use client';

import { useEffect, useState } from 'react';
import { getMonthlyReservations } from './actions';
import { getBlackoutDates, toggleBlackoutDate } from '../settings/actions';

const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [blackouts, setBlackouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, [currentDate]);

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

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  async function handleToggleBlackout() {
    if (selectedDate && confirm(`Toggle closure for ${selectedDate}?`)) {
      await toggleBlackoutDate(selectedDate, 'Closed by admin');
      fetchData();
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="page-label">Overview</p>
          <h2 className="page-title">Booking Calendar</h2>
          <p className="page-subtitle">Select a day to view its schedule.</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button onClick={prevMonth} className="btn-ghost" style={{ padding: '0.4375rem' }}><ChevronLeft /></button>
          <span className="min-w-[140px] text-center text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} className="btn-ghost" style={{ padding: '0.4375rem' }}><ChevronRight /></button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Calendar Grid */}
        <div className="lg:col-span-3 card p-4 sm:p-5">
          <div className="grid grid-cols-7 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="text-center text-[9px] font-bold uppercase tracking-wider py-2" style={{ color: 'var(--p-text-5)' }}>{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {padding.map((_, i) => <div key={`p-${i}`} className="aspect-square rounded-lg" />)}
            {days.map(day => {
              const { isBlackout, dayRes, dateStr } = getDayStatus(day);
              const isSelected = selectedDate === dateStr;
              const isToday = dateStr === new Date().toISOString().split('T')[0];

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  className="aspect-square rounded-lg p-1 sm:p-1.5 flex flex-col transition-all relative"
                  style={{
                    background: isSelected ? 'var(--p-accent-bg)' : isBlackout ? 'rgba(239,68,68,0.06)' : 'var(--p-subtle)',
                    border: `1px solid ${isSelected ? 'var(--p-accent-border)' : isBlackout ? 'rgba(239,68,68,0.15)' : 'var(--p-border)'}`,
                    color: isSelected ? 'var(--p-accent-text)' : isBlackout ? '#ef4444' : 'var(--p-text-4)',
                  }}
                >
                  <span className="text-xs font-bold leading-none" style={{ color: isToday && !isSelected ? 'var(--p-accent)' : undefined }}>{day}</span>
                  {dayRes.length > 0 && (
                    <div className="mt-auto flex items-center gap-0.5">
                      <span className="text-[7px] font-bold" style={{ color: isSelected ? 'var(--p-accent-text)' : 'var(--p-text-5)' }}>{dayRes.length}</span>
                      <div className="w-1 h-1 rounded-full" style={{ background: isSelected ? 'var(--p-accent)' : 'var(--p-accent-bg)' }} />
                    </div>
                  )}
                  {isBlackout && <div className="absolute bottom-1 left-1 right-1 h-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.4)' }} />}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-4 flex items-center gap-4 text-[10px]" style={{ borderTop: '1px solid var(--p-border-2)', color: 'var(--p-text-5)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--p-accent)' }} />Today
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--p-accent-bg)', border: '1px solid var(--p-accent-border)' }} />Has reservations
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: 'rgba(239,68,68,0.5)' }} />Closed
            </span>
          </div>
        </div>

        {/* Day Detail */}
        <div className="lg:col-span-1">
          <div className="card lg:sticky lg:top-6">
            <div className="card-header">
              <div>
                <p className="form-label">Selected Day</p>
                <p className="text-sm font-bold" style={{ color: 'var(--p-text-1)' }}>{selectedDate || 'No date selected'}</p>
              </div>
            </div>

            <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
              {isSelectedDateBlackout ? (
                <div className="rounded-lg p-4 text-center" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <p className="text-sm font-semibold text-red-500">Restaurant Closed</p>
                  <p className="text-[11px] mt-1" style={{ color: 'rgba(239,68,68,0.7)' }}>No reservations for this date.</p>
                </div>
              ) : selectedDayReservations.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm" style={{ color: 'var(--p-text-5)' }}>No reservations</p>
                </div>
              ) : selectedDayReservations.map((res: any) => (
                <a
                  key={res.id}
                  href={`/admin/customers/${res.customer_id}`}
                  className="block rounded-lg p-3 transition-all group"
                  style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.3)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--p-border)'; }}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-xs font-bold" style={{ color: 'var(--p-accent-text)' }}>{res.reservation_time}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 transition-colors" style={{ color: 'var(--p-text-5)' }}>
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>{res.customer_name}</p>
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--p-text-5)' }}>{res.phone_number}</p>
                  {res.tables && (
                    <span className="badge badge-amber mt-2">TABLE {res.tables.table_number}</span>
                  )}
                </a>
              ))}
            </div>

            <div className="p-3 pt-0">
              <button
                onClick={handleToggleBlackout}
                className="w-full py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all"
                style={isSelectedDateBlackout
                  ? { background: 'rgba(34,197,94,0.08)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }
                  : { background: 'rgba(239,68,68,0.06)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }
                }
              >
                {isSelectedDateBlackout ? 'Open This Day' : 'Close This Day'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
