'use client';

import { useEffect, useState } from 'react';
import { getSettings, updateDaySettings, updateRule, getBlackoutDates, toggleBlackoutDate } from './actions';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export default function SettingsPage() {
  const [data, setData] = useState<{ weekly: any[], rules: any[] }>({ weekly: [], rules: [] });
  const [blackouts, setBlackouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [editingRuleKey, setEditingRuleKey] = useState<string | null>(null);
  const [tempRuleValue, setTempRuleValue] = useState('');
  const [newHoliday, setNewHoliday] = useState({ date: '', reason: '' });

  useEffect(() => { fetchSettings(); }, []);

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
    } catch {
      alert('Save failed. Ensure open_time and close_time columns are TEXT type in Supabase.');
    }
  }

  async function handleSaveRule(key: string) {
    await updateRule(key, tempRuleValue);
    setEditingRuleKey(null);
    fetchSettings();
  }

  const ActionBtns = ({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) => (
    <div className="flex gap-1 shrink-0">
      <button onClick={onSave} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all" style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.20)', color: '#4ade80' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#22c55e'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(34,197,94,0.10)'; (e.currentTarget as HTMLElement).style.color = '#4ade80'; }}
      ><CheckIcon /></button>
      <button onClick={onCancel} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all" style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-4)' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--p-text-1)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--p-text-4)'}
      ><XIcon /></button>
    </div>
  );

  return (
    <div className="space-y-6 pb-20">
      <header>
        <p className="page-label">System</p>
        <h2 className="page-title">Restaurant Configuration</h2>
        <p className="page-subtitle">
          Note: For multi-slot hours, ensure open_time &amp; close_time columns are TEXT type in Supabase.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Operating Hours */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" style={{ color: 'var(--p-accent)' }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <h3 className="card-header-title">Operating Hours</h3>
            </div>
            <span className="text-[10px] font-mono" style={{ color: 'var(--p-text-5)' }}>12:00-14:00</span>
          </div>
          <div className="p-4 space-y-2">
            {loading ? (
              [...Array(7)].map((_, i) => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: 'var(--p-subtle)' }} />)
            ) : data.weekly.map((day) => {
              const isEditing = editingId === day.id;
              const displayValue = day.open_time.includes(':') && !day.open_time.includes('-')
                ? `${day.open_time.slice(0,5)}-${day.close_time.slice(0,5)}`
                : day.open_time;

              return (
                <div key={day.id} className="rounded-lg p-3 transition-all" style={{
                  background: isEditing ? 'var(--p-accent-bg)' : 'var(--p-subtle)',
                  border: `1px solid ${isEditing ? 'var(--p-accent-border)' : 'var(--p-border)'}`,
                }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--p-accent)' }}>{DAYS[day.day_of_week]}</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Closed</span>
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={day.is_closed}
                          onChange={(e) => updateDaySettings(day.id, { is_closed: e.target.checked }).then(fetchSettings)}
                          className="sr-only peer"
                        />
                        <div className="w-7 h-4 rounded-full peer peer-checked:after:translate-x-3 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-red-500/70" style={{ background: 'var(--p-border)' }} />
                      </div>
                    </label>
                  </div>
                  {!day.is_closed && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        disabled={!isEditing}
                        className="form-input flex-1"
                        style={{ fontFamily: 'monospace', fontSize: '0.75rem', padding: '0.375rem 0.625rem', opacity: isEditing ? 1 : 0.5 }}
                        value={isEditing ? tempValue : displayValue}
                        onChange={(e) => setTempValue(e.target.value)}
                      />
                      {isEditing ? (
                        <ActionBtns onSave={() => handleSave(day.id)} onCancel={() => setEditingId(null)} />
                      ) : (
                        <button
                          onClick={() => { setEditingId(day.id); setTempValue(displayValue); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0"
                          style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-4)' }}
                        >
                          <EditIcon />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Policies */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" style={{ color: 'var(--p-accent)' }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <h3 className="card-header-title">Policies</h3>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {data.rules.map((rule) => {
              const isEditingRule = editingRuleKey === rule.key;
              return (
                <div key={rule.id} className="rounded-lg p-4 transition-all" style={{
                  background: isEditingRule ? 'var(--p-accent-bg)' : 'var(--p-subtle)',
                  border: `1px solid ${isEditingRule ? 'var(--p-accent-border)' : 'var(--p-border)'}`,
                }}>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--p-accent)' }}>
                    {rule.key.replace(/_/g, ' ')}
                  </label>
                  <p className="text-[10px] italic mb-3" style={{ color: 'var(--p-text-5)' }}>{rule.description}</p>
                  <div className="flex items-center gap-2">
                    {rule.key === 'auto_confirm' && isEditingRule ? (
                      <select className="form-input flex-1" style={{ fontSize: '0.75rem', padding: '0.375rem 0.625rem' }} value={tempRuleValue} onChange={(e) => setTempRuleValue(e.target.value)}>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        disabled={!isEditingRule}
                        className="form-input flex-1"
                        style={{ fontFamily: 'monospace', fontSize: '0.75rem', padding: '0.375rem 0.625rem', opacity: isEditingRule ? 1 : 0.5 }}
                        value={isEditingRule ? tempRuleValue : rule.value}
                        onChange={(e) => setTempRuleValue(e.target.value)}
                      />
                    )}
                    {isEditingRule ? (
                      <ActionBtns onSave={() => handleSaveRule(rule.key)} onCancel={() => setEditingRuleKey(null)} />
                    ) : (
                      <button
                        onClick={() => { setEditingRuleKey(rule.key); setTempRuleValue(rule.value); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0"
                        style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-4)' }}
                      >
                        <EditIcon />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Special Closures */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" style={{ color: 'var(--p-accent)' }}>
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <h3 className="card-header-title">Special Closures</h3>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)' }}>
              <input
                type="date"
                className="form-input"
                value={newHoliday.date}
                onChange={e => setNewHoliday({...newHoliday, date: e.target.value})}
              />
              <input
                placeholder="Reason (e.g. Public Holiday)"
                className="form-input"
                value={newHoliday.reason}
                onChange={e => setNewHoliday({...newHoliday, reason: e.target.value})}
              />
              <button
                onClick={async () => { if (!newHoliday.date) return; await toggleBlackoutDate(newHoliday.date, newHoliday.reason); setNewHoliday({ date: '', reason: '' }); fetchSettings(); }}
                className="btn-primary w-full justify-center"
              >
                Add Closure
              </button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {blackouts.length === 0 ? (
                <p className="text-xs italic px-1" style={{ color: 'var(--p-text-5)' }}>No closures scheduled.</p>
              ) : blackouts.map(b => (
                <div key={b.id} className="flex justify-between items-center rounded-lg px-4 py-3 group transition-all" style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)' }}>
                  <div>
                    <p className="text-xs font-bold" style={{ color: 'var(--p-text-1)' }}>{b.date}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--p-text-4)' }}>{b.reason || 'Special Closure'}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveHoliday(b.date)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    style={{ background: 'var(--p-subtle)', color: 'var(--p-text-4)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#ef4444'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--p-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--p-text-4)'; }}
                  >
                    <XIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  async function handleRemoveHoliday(date: string) {
    await toggleBlackoutDate(date);
    fetchSettings();
  }
}
