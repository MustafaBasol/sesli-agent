'use client';

import { useEffect, useState } from 'react';
import { getSettings, updateDaySettings, updateRule, getBlackoutDates, toggleBlackoutDate } from './actions';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function SettingsPage() {
  const [data, setData] = useState<{ weekly: any[], rules: any[] }>({ weekly: [], rules: [] });
  const [blackouts, setBlackouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // States for Operating Hours
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState('');
  
  // States for Policies
  const [editingRuleKey, setEditingRuleKey] = useState<string | null>(null);
  const [tempRuleValue, setTempRuleValue] = useState('');
  
  const [newHoliday, setNewHoliday] = useState({ date: '', reason: '' });

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    const [res, blackoutData] = await Promise.all([getSettings(), getBlackoutDates()]);
    setData(res);
    setBlackouts(blackoutData || []);
    setLoading(false);
  }

  async function handleSave(id: string) {
    try {
      await updateDaySettings(id, { open_time: tempValue });
      setEditingId(null);
      fetchSettings();
    } catch (err: any) {
      alert('Hata: Kaydedilemedi. Lütfen Supabase SQL Editor üzerinden open_time ve close_time sütunlarını TEXT tipine çevirin.');
    }
  }

  async function handleSaveRule(key: string) {
    await updateRule(key, tempRuleValue);
    setEditingRuleKey(null);
    fetchSettings();
  }

  async function handleAddHoliday() {
    if (!newHoliday.date) return;
    await toggleBlackoutDate(newHoliday.date, newHoliday.reason);
    setNewHoliday({ date: '', reason: '' });
    fetchSettings();
  }

  async function handleRemoveHoliday(date: string) {
    await toggleBlackoutDate(date);
    fetchSettings();
  }

  return (
    <div className="max-w-6xl space-y-8 pb-20 font-sans">
      <header>
        <h2 className="text-3xl font-black text-white tracking-tight">Restaurant Configuration</h2>
        <p className="text-gray-500 mt-1 font-medium italic underline decoration-orange-500/30">Lütfen çoklu saat dilimi için veritabanı sütunlarını TEXT tipine çevirdiğinizden emin olun.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Weekly Hours */}
        <div className="lg:col-span-1 bg-gray-900 border border-gray-800 rounded-[40px] overflow-hidden shadow-2xl">
          <div className="p-8 border-b border-gray-800 bg-gray-800/20">
            <h3 className="text-lg font-black text-white flex items-center tracking-tight">
              <span className="mr-3 text-2xl">🕒</span> Operating Hours
            </h3>
            <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-widest font-black">Format: 12:00-14:00, 18:00-23:00</p>
          </div>
          <div className="p-8 space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-800/50 rounded-3xl animate-pulse" />
                ))}
              </div>
            ) : data.weekly.map((day) => {
              const isEditing = editingId === day.id;
              const displayValue = day.open_time.includes(':') && !day.open_time.includes('-') 
                ? `${day.open_time.slice(0,5)}-${day.close_time.slice(0,5)}` 
                : day.open_time;

              return (
                <div key={day.id} className={`flex flex-col p-5 rounded-[32px] border transition-all ${isEditing ? 'bg-gray-800/50 border-orange-500/50 shadow-inner' : 'bg-gray-800/20 border-gray-800/50 hover:border-gray-700'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-black text-[10px] text-orange-500 uppercase tracking-widest">{DAYS[day.day_of_week]}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-gray-600 font-black uppercase">Closed</span>
                      <input 
                        type="checkbox" 
                        checked={day.is_closed} 
                        onChange={(e) => updateDaySettings(day.id, { is_closed: e.target.checked }).then(fetchSettings)} 
                        className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-orange-600 focus:ring-0 cursor-pointer" 
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      disabled={!isEditing || day.is_closed}
                      className={`flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-[11px] text-white font-bold transition-all outline-none focus:border-orange-500 ${!isEditing ? 'opacity-40 cursor-not-allowed bg-transparent border-transparent' : 'bg-black'} ${day.is_closed ? 'hidden' : 'block'}`}
                      value={isEditing ? tempValue : displayValue} 
                      onChange={(e) => setTempValue(e.target.value)}
                    />
                    
                    {!day.is_closed && (
                      isEditing ? (
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => handleSave(day.id)} className="bg-green-600 hover:bg-green-500 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-lg shadow-green-900/20">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                          </button>
                          <button onClick={() => setEditingId(null)} className="bg-gray-800 hover:bg-gray-700 text-gray-400 w-8 h-8 rounded-lg flex items-center justify-center transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => { setEditingId(day.id); setTempValue(displayValue); }} 
                          className="bg-gray-800/30 hover:bg-gray-700 text-gray-500 hover:text-orange-500 w-8 h-8 rounded-lg flex items-center justify-center transition-all border border-gray-800"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Global Rules */}
        <div className="lg:col-span-1 bg-gray-900 border border-gray-800 rounded-[40px] overflow-hidden shadow-2xl">
          <div className="p-8 border-b border-gray-800 bg-gray-800/20">
            <h3 className="text-lg font-black text-white flex items-center tracking-tight">
              <span className="mr-3 text-2xl">⚖️</span> Policies
            </h3>
            <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-widest font-black leading-relaxed">System behavior and limits</p>
          </div>
          <div className="p-8 space-y-8">
            {data.rules.map((rule) => {
              const isEditingRule = editingRuleKey === rule.key;
              
              return (
                <div key={rule.id} className={`flex flex-col p-5 rounded-[32px] border transition-all ${isEditingRule ? 'bg-gray-800/50 border-orange-500/50 shadow-inner' : 'bg-gray-800/20 border-gray-800/50 hover:border-gray-700'}`}>
                  <div className="mb-3">
                    <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest block mb-1">{rule.key.replace(/_/g, ' ')}</label>
                    <p className="text-[10px] text-gray-500 font-medium leading-relaxed italic">{rule.description}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {rule.key === 'auto_confirm' && isEditingRule ? (
                      <select 
                        className="flex-1 bg-black border border-gray-800 rounded-xl px-4 py-2.5 text-[11px] text-white font-bold outline-none focus:border-orange-500"
                        value={tempRuleValue}
                        onChange={(e) => setTempRuleValue(e.target.value)}
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    ) : (
                      <input 
                        type="text"
                        disabled={!isEditingRule}
                        className={`flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-[11px] text-white font-bold transition-all outline-none focus:border-orange-500 ${!isEditingRule ? 'opacity-40 cursor-not-allowed bg-transparent border-transparent' : 'bg-black'}`}
                        value={isEditingRule ? tempRuleValue : rule.value}
                        onChange={(e) => setTempRuleValue(e.target.value)}
                      />
                    )}

                    <div className="flex gap-1 shrink-0">
                      {isEditingRule ? (
                        <>
                          <button onClick={() => handleSaveRule(rule.key)} className="bg-green-600 hover:bg-green-500 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                          </button>
                          <button onClick={() => setEditingRuleKey(null)} className="bg-gray-800 hover:bg-gray-700 text-gray-400 w-8 h-8 rounded-lg flex items-center justify-center transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                          </button>
                        </>
                      ) : (
                        <button 
                          onClick={() => { setEditingRuleKey(rule.key); setTempRuleValue(rule.value); }} 
                          className="bg-gray-800/30 hover:bg-gray-700 text-gray-500 hover:text-orange-500 w-8 h-8 rounded-lg flex items-center justify-center transition-all border border-gray-800"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Holiday Closures */}
        <div className="lg:col-span-1 bg-gray-900 border border-gray-800 rounded-[40px] overflow-hidden shadow-2xl">
          <div className="p-8 border-b border-gray-800 bg-gray-800/20">
            <h3 className="text-lg font-black text-white flex items-center tracking-tight">
              <span className="mr-3 text-2xl">🏖️</span> Special Closures
            </h3>
            <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-widest font-black leading-relaxed">Holidays and blackout dates</p>
          </div>
          <div className="p-8 space-y-8">
            <div className="space-y-4 bg-gray-800/20 p-6 rounded-[32px] border border-gray-800">
              <div className="relative group">
                <input 
                  type="date" 
                  className="w-full bg-black border border-gray-800 rounded-2xl px-5 py-4 text-xs text-white font-bold outline-none focus:border-orange-500 appearance-none cursor-pointer" 
                  value={newHoliday.date} 
                  onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} 
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                </div>
              </div>
              <input 
                placeholder="Reason (e.g. Eid, Public Holiday)" 
                className="w-full bg-black border border-gray-800 rounded-2xl px-5 py-4 text-xs text-white font-bold outline-none focus:border-orange-500" 
                value={newHoliday.reason} 
                onChange={e => setNewHoliday({...newHoliday, reason: e.target.value})} 
              />
              <button 
                onClick={handleAddHoliday} 
                className="w-full bg-orange-600 hover:bg-orange-500 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-orange-900/20 active:scale-95"
              >
                Add Closure Period
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest block mb-4">Currently Scheduled:</label>
              {blackouts.length === 0 ? (
                <p className="text-gray-600 italic text-xs pl-2">No holidays scheduled.</p>
              ) : blackouts.map(b => (
                <div key={b.id} className="flex justify-between items-center p-5 bg-orange-600/5 border border-orange-500/10 rounded-[28px] group hover:bg-orange-600/10 transition-all">
                  <div>
                    <p className="text-white font-black text-xs tracking-tight">{b.date}</p>
                    <p className="text-[10px] text-orange-500 font-bold uppercase mt-0.5">{b.reason || 'Special Closure'}</p>
                  </div>
                  <button 
                    onClick={() => handleRemoveHoliday(b.date)} 
                    className="bg-gray-800 hover:bg-red-600 text-gray-500 hover:text-white p-3 rounded-xl transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
