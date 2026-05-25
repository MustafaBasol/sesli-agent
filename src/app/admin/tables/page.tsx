'use client';

import { useEffect, useState } from 'react';
import { getTables, addTable, updateTable } from './actions';

export default function TablesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ table_number: '', capacity: 2, location: 'Main Hall', is_active: true });

  useEffect(() => {
    fetchItems();
  }, []);

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
    } catch (error) {
      alert('Error saving table');
    }
  }

  const startEdit = (table: any) => {
    setFormData({ 
      table_number: table.table_number, 
      capacity: table.capacity, 
      location: table.location,
      is_active: table.is_active
    });
    setEditingId(table.id);
    setShowAdd(true);
  };

  return (
    <div>
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white">Table Management</h2>
          <p className="text-gray-400 mt-1">Configure your restaurant layout and table features.</p>
        </div>
        <button 
          onClick={() => { setShowAdd(true); setEditingId(null); setFormData({table_number: '', capacity: 2, location: 'Main Hall', is_active: true}); }}
          className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all"
        >
          + Add Table
        </button>
      </header>

      {showAdd && (
        <div className="mb-8 bg-gray-900 border border-orange-500/30 p-6 rounded-2xl animate-in fade-in slide-in-from-top-4">
          <h3 className="text-lg font-bold mb-4">{editingId ? 'Edit Table' : 'New Table'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input 
              placeholder="Number"
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm"
              value={formData.table_number}
              onChange={e => setFormData({...formData, table_number: e.target.value})}
            />
            <input 
              type="number"
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm"
              value={formData.capacity}
              onChange={e => setFormData({...formData, capacity: parseInt(e.target.value)})}
            />
            <select 
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm"
              value={formData.location}
              onChange={e => setFormData({...formData, location: e.target.value})}
            >
              <option value="Main Hall">Main Hall</option>
              <option value="Window Side">Window Side</option>
              <option value="Terrace">Terrace</option>
              <option value="VIP Room">VIP Room</option>
            </select>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={formData.is_active}
                onChange={e => setFormData({...formData, is_active: e.target.checked})}
              />
              <span className="text-sm">Active</span>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleSave} className="bg-orange-600 px-4 py-2 rounded-lg text-xs font-bold">Save Changes</button>
            <button onClick={() => { setShowAdd(false); setEditingId(null); }} className="bg-gray-700 px-4 py-2 rounded-lg text-xs font-bold">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {loading ? (
          <p className="col-span-full text-center py-8 text-gray-500">Loading...</p>
        ) : items.map((table) => (
          <div key={table.id} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl relative group hover:border-gray-600 transition-all">
            <button 
              onClick={() => startEdit(table)}
              className="absolute top-2 right-2 p-1 text-gray-500 hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-all"
            >
              ✏️
            </button>
            <div className="text-3xl font-black text-gray-700 mb-2">{table.table_number}</div>
            <div className="text-sm font-bold text-white">👥 {table.capacity} Person</div>
            <div className="text-xs text-gray-400">📍 {table.location}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
