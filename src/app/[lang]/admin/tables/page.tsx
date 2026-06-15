'use client';

import { useEffect, useState } from 'react';
import { getTables, addTable, updateTable } from './actions';

const LOCATIONS = ['Main Hall', 'Window Side', 'Terrace', 'VIP Room'];

const locationBadgeClass: Record<string, string> = {
  'Main Hall':   'badge-blue',
  'Window Side': 'badge-green',
  'Terrace':     'badge-amber',
  'VIP Room':    'badge-purple',
};

const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

export default function TablesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ table_number: '', capacity: 2, location: 'Main Hall', is_active: true });

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    setLoading(true);
    const data = await getTables();
    setItems(data || []);
    setLoading(false);
  }

  async function handleSave() {
    try {
      if (editingId) {
        await updateTable(editingId, formData);
      } else {
        await addTable(formData);
      }
      setShowAdd(false);
      setEditingId(null);
      fetchItems();
    } catch {
      alert('Error saving table');
    }
  }

  const startEdit = (table: any) => {
    setFormData({ table_number: table.table_number, capacity: table.capacity, location: table.location, is_active: table.is_active });
    setEditingId(table.id);
    setShowAdd(true);
  };

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <p className="page-label">Operations</p>
          <h2 className="page-title">Table Management</h2>
          <p className="page-subtitle">Configure your restaurant layout and seating.</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null); setFormData({ table_number: '', capacity: 2, location: 'Main Hall', is_active: true }); }}
          className="btn-primary"
          style={{ alignSelf: 'flex-start' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Table
        </button>
      </header>

      {showAdd && (
        <div className="card">
          <div className="card-header" style={{ background: 'rgba(245,158,11,0.04)', borderColor: 'rgba(245,158,11,0.2)' }}>
            <h3 className="card-header-title">{editingId ? 'Edit Table' : 'Add New Table'}</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="form-label">Table Number</label>
                <input className="form-input" placeholder="e.g. 1" value={formData.table_number} onChange={e => setFormData({...formData, table_number: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Capacity</label>
                <input type="number" min={1} className="form-input" value={formData.capacity} onChange={e => setFormData({...formData, capacity: parseInt(e.target.value)})} />
              </div>
              <div>
                <label className="form-label">Location</label>
                <select className="form-input" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})}>
                  {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 pb-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="sr-only peer" />
                  <div className="w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500" style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)' }} />
                </label>
                <span className="text-sm" style={{ color: 'var(--p-text-3)' }}>Active</span>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={handleSave} className="btn-primary">{editingId ? 'Update Table' : 'Add Table'}</button>
              <button onClick={() => { setShowAdd(false); setEditingId(null); }} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)' }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {items.map((table) => (
            <div
              key={table.id}
              className="card relative group p-5 cursor-pointer"
              style={{ opacity: table.is_active ? 1 : 0.55 }}
              onClick={() => startEdit(table)}
            >
              <button
                className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-4)' }}
              >
                <EditIcon />
              </button>

              <div className="text-3xl font-bold tabular-nums mb-3" style={{ color: 'var(--p-text-1)' }}>{table.table_number}</div>

              <div className="flex items-center gap-1.5 text-sm mb-2" style={{ color: 'var(--p-text-4)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
                </svg>
                <span className="font-medium">{table.capacity}</span>
              </div>

              <span className={`badge ${locationBadgeClass[table.location] || 'badge-gray'}`}>
                {table.location}
              </span>

              {!table.is_active && (
                <div className="mt-2">
                  <span className="badge badge-red">Inactive</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
