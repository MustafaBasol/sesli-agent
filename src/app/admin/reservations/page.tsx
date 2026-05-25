'use client';

import { useEffect, useState } from 'react';
import { getReservations, updateReservation, getAvailableTables, createManualReservation } from './actions';

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [formData, setFormData] = useState({
    customer_name: '',
    phone_number: '',
    reservation_date: '',
    reservation_time: '',
    party_size: 2,
    assigned_table_id: null as string | null
  });

  useEffect(() => {
    fetchReservations();
  }, []);

  useEffect(() => {
    if (formData.reservation_date && formData.reservation_time) {
      getAvailableTables(formData.reservation_date, formData.reservation_time).then(setTables);
    }
  }, [formData.reservation_date, formData.reservation_time]);

  async function fetchReservations() {
    setLoading(true);
    const data = await getReservations();
    setReservations(data || []);
    setLoading(false);
  }

  async function handleSave() {
    try {
      if (editingId) {
        await updateReservation(editingId, formData);
      } else {
        await createManualReservation(formData);
      }
      setEditingId(null);
      setShowAdd(false);
      fetchReservations();
      resetForm();
    } catch (error) {
      alert('Error saving reservation');
    }
  }

  const startEdit = (res: any) => {
    setFormData({
      customer_name: res.customer_name,
      phone_number: res.phone_number,
      reservation_date: res.reservation_date,
      reservation_time: res.reservation_time,
      party_size: res.party_size,
      assigned_table_id: res.assigned_table_id
    });
    setEditingId(res.id);
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setFormData({ customer_name: '', phone_number: '', reservation_date: '', reservation_time: '', party_size: 2, assigned_table_id: null });
  };

  return (
    <div>
      <header className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Reservations</h2>
          <p className="text-gray-400 mt-1">Manage, update, and track all bookings.</p>
        </div>
        <button 
          onClick={() => { setShowAdd(!showAdd); setEditingId(null); resetForm(); }}
          className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2.5 rounded-xl text-sm font-black transition-all self-start sm:self-auto"
        >
          {showAdd ? 'Cancel' : '+ New Booking'}
        </button>
      </header>

      {showAdd && (
        <div className="mb-8 bg-gray-900 border border-orange-500/30 p-8 rounded-3xl animate-in fade-in slide-in-from-top-4">
          <h3 className="text-lg font-bold mb-6 text-white">{editingId ? 'Edit Reservation' : 'New Manual Booking'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-black">Guest Name</label>
              <input className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white" value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-black">Phone Number</label>
              <input className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white" value={formData.phone_number} onChange={e => setFormData({...formData, phone_number: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-black">Party Size</label>
              <input type="number" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white" value={formData.party_size} onChange={e => setFormData({...formData, party_size: parseInt(e.target.value)})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-black">Date</label>
              <input type="date" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white" value={formData.reservation_date} onChange={e => setFormData({...formData, reservation_date: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-black">Time</label>
              <input type="time" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white" value={formData.reservation_time} onChange={e => setFormData({...formData, reservation_time: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-black">Assign Table</label>
              <select className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white" value={formData.assigned_table_id || ''} onChange={e => setFormData({...formData, assigned_table_id: e.target.value || null})}>
                <option value="">No Table Assigned</option>
                {tables.filter(t => t.capacity >= formData.party_size).map(t => (
                  <option key={t.id} value={t.id}>Table {t.table_number} (Cap: {t.capacity})</option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={handleSave} className="mt-8 bg-orange-600 px-8 py-2 rounded-xl text-sm font-black hover:bg-orange-500 transition-all">
            {editingId ? 'Update Reservation' : 'Confirm Booking'}
          </button>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-800/50 text-[10px] font-black uppercase text-gray-500 tracking-widest border-b border-gray-800">
              <tr>
                <th className="px-6 py-4">Guest</th>
                <th className="px-6 py-4">Date & Time</th>
                <th className="px-6 py-4">Party</th>
                <th className="px-6 py-4">Table</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">Fetching reservations...</td></tr>
              ) : reservations.map((res) => (
                <tr key={res.id} className="hover:bg-gray-800/20 transition-all group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-white">{res.customer_name}</div>
                    <div className="text-[10px] text-gray-500 font-mono">{res.phone_number}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-white font-bold">{res.reservation_date}</div>
                    <div className="text-orange-500 text-xs font-black">{res.reservation_time}</div>
                  </td>
                  <td className="px-6 py-4 font-black text-gray-400">👥 {res.party_size}</td>
                  <td className="px-6 py-4">
                    {res.tables ? (
                      <span className="bg-orange-500/10 text-orange-500 px-2 py-1 rounded text-[10px] font-black border border-orange-500/20">
                        TABLE {res.tables.table_number}
                      </span>
                    ) : <span className="text-gray-600 italic">Unassigned</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-black uppercase ${res.status === 'confirmed' ? 'text-green-500' : 'text-orange-500'}`}>
                      {res.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(res)} className="text-xs bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700 hover:text-orange-500">Edit</button>
                      <button 
                        onClick={async () => {
                          if (confirm('Are you sure you want to delete this reservation?')) {
                            const { deleteReservation } = await import('./actions');
                            await deleteReservation(res.id);
                            fetchReservations();
                          }
                        }} 
                        className="text-xs bg-red-900/20 text-red-500 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                      >Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y divide-gray-800">
          {loading ? (
            <div className="px-4 py-10 text-center text-gray-500">Fetching reservations...</div>
          ) : reservations.map((res) => (
            <div key={res.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-white">{res.customer_name}</p>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">{res.phone_number}</p>
                </div>
                <span className={`text-[10px] font-black uppercase ${res.status === 'confirmed' ? 'text-green-500' : 'text-orange-500'}`}>
                  {res.status}
                </span>
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-gray-500 text-[10px] uppercase font-black">Date</span>
                  <p className="text-white font-bold">{res.reservation_date}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-[10px] uppercase font-black">Time</span>
                  <p className="text-orange-500 font-black">{res.reservation_time}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-[10px] uppercase font-black">Party</span>
                  <p className="text-gray-300 font-bold">👥 {res.party_size}</p>
                </div>
              </div>
              {res.tables && (
                <span className="inline-block bg-orange-500/10 text-orange-500 px-2 py-1 rounded text-[10px] font-black border border-orange-500/20">
                  TABLE {res.tables.table_number}
                </span>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => startEdit(res)} className="flex-1 text-xs bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 hover:text-orange-500 transition-all">Edit</button>
                <button 
                  onClick={async () => {
                    if (confirm('Delete this reservation?')) {
                      const { deleteReservation } = await import('./actions');
                      await deleteReservation(res.id);
                      fetchReservations();
                    }
                  }} 
                  className="flex-1 text-xs bg-red-900/20 text-red-500 px-3 py-2 rounded-lg border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                >Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
