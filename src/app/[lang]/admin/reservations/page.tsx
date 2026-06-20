'use client';

import { useEffect, useState } from 'react';
import { getReservations, updateReservation, getAvailableTables, createManualReservation } from './actions';
import { useI18n } from '@/i18n/provider';

type Reservation = {
  id: string;
  customer_name: string;
  phone_number: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  assigned_table_id: string | null;
  status: string;
  tables?: {
    table_number: string;
  } | null;
};

type TableOption = {
  id: string;
  table_number: string;
  capacity: number;
};

export default function ReservationsPage() {
  const { text } = useI18n();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [formData, setFormData] = useState({
    customer_name: '',
    phone_number: '',
    reservation_date: '',
    reservation_time: '',
    party_size: 2,
    assigned_table_id: null as string | null,
  });

  useEffect(() => { fetchReservations(); }, []);

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
    } catch {
      alert(text('Error saving reservation'));
    }
  }

  const startEdit = (res: Reservation) => {
    setFormData({
      customer_name: res.customer_name,
      phone_number: res.phone_number,
      reservation_date: res.reservation_date,
      reservation_time: res.reservation_time,
      party_size: res.party_size,
      assigned_table_id: res.assigned_table_id,
    });
    setEditingId(res.id);
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setFormData({ customer_name: '', phone_number: '', reservation_date: '', reservation_time: '', party_size: 2, assigned_table_id: null });
  };

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <p className="page-label">Operations</p>
          <h2 className="page-title">Reservations</h2>
          <p className="page-subtitle">Manage and track all dining bookings.</p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setEditingId(null); resetForm(); }}
          className={showAdd ? 'btn-ghost' : 'btn-primary'}
          style={{ alignSelf: 'flex-start' }}
        >
          {showAdd ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Cancel
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Booking
            </>
          )}
        </button>
      </header>

      {/* Form */}
      {showAdd && (
        <div className="card">
          <div className="card-header" style={{ background: 'rgba(245,158,11,0.04)', borderColor: 'rgba(245,158,11,0.2)' }}>
            <h3 className="card-header-title">{editingId ? 'Edit Reservation' : 'New Manual Booking'}</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Guest Name</label>
                <input className="form-input" placeholder="Full name" value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Phone Number</label>
                <input className="form-input" placeholder="+90 ..." value={formData.phone_number} onChange={e => setFormData({...formData, phone_number: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Party Size</label>
                <input type="number" min={1} className="form-input" value={formData.party_size} onChange={e => setFormData({...formData, party_size: parseInt(e.target.value)})} />
              </div>
              <div>
                <label className="form-label">Date</label>
                <input type="date" className="form-input" value={formData.reservation_date} onChange={e => setFormData({...formData, reservation_date: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Time</label>
                <input type="time" className="form-input" value={formData.reservation_time} onChange={e => setFormData({...formData, reservation_time: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Assign Table</label>
                <select className="form-input" value={formData.assigned_table_id || ''} onChange={e => setFormData({...formData, assigned_table_id: e.target.value || null})}>
                  <option value="">No Table Assigned</option>
                  {tables.filter(t => t.capacity >= formData.party_size).map(t => (
                    <option key={t.id} value={t.id}>{text('Table')} {t.table_number} ({text('Capacity')}: {t.capacity})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button onClick={handleSave} className="btn-primary">
                {editingId ? 'Update Reservation' : 'Confirm Booking'}
              </button>
              <button onClick={() => { setShowAdd(false); setEditingId(null); resetForm(); }} className="btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="hidden sm:block table-container">
          <table className="admin-table">
            <thead>
              <tr>
                {['Guest', 'Date & Time', 'Party', 'Table', 'Status', ''].map((h, i) => (
                  <th key={i} style={i === 5 ? { textAlign: 'right' } : {}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-sm" style={{ color: 'var(--p-text-5)' }}>Loading reservations...</td></tr>
              ) : reservations.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16 text-sm" style={{ color: 'var(--p-text-5)' }}>No reservations found</td></tr>
              ) : reservations.map((res) => (
                <tr key={res.id}>
                  <td>
                    <div className="font-semibold text-sm" style={{ color: 'var(--p-text-1)' }}>{res.customer_name}</div>
                    <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--p-text-5)' }}>{res.phone_number}</div>
                  </td>
                  <td>
                    <div className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>{res.reservation_date}</div>
                    <div className="text-xs font-semibold mt-0.5" style={{ color: 'var(--p-accent-text)' }}>{res.reservation_time}</div>
                  </td>
                  <td className="text-sm font-medium" style={{ color: 'var(--p-text-3)' }}>{res.party_size} {text('guests')}</td>
                  <td>
                    {res.tables ? (
                      <span className="badge badge-amber">{text('Table')} {res.tables.table_number}</span>
                    ) : (
                      <span className="text-xs italic" style={{ color: 'var(--p-text-5)' }}>Unassigned</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${res.status === 'confirmed' ? 'badge-green' : 'badge-amber'}`}>
                      {text(res.status)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(res)} className="btn-ghost" style={{ padding: '0.3125rem 0.75rem', fontSize: '0.75rem' }}>
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm(text('Delete this reservation?'))) {
                            const { deleteReservation } = await import('./actions');
                            await deleteReservation(res.id);
                            fetchReservations();
                          }
                        }}
                        className="btn-danger"
                        style={{ padding: '0.3125rem 0.75rem', fontSize: '0.75rem' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden">
          {loading ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--p-text-5)' }}>Loading reservations...</div>
          ) : reservations.map((res) => (
            <div key={res.id} className="p-4 space-y-3" style={{ borderBottom: '1px solid var(--p-border-2)' }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>{res.customer_name}</p>
                  <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--p-text-5)' }}>{res.phone_number}</p>
                </div>
                <span className={`badge ${res.status === 'confirmed' ? 'badge-green' : 'badge-amber'}`}>{text(res.status)}</span>
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="form-label">Date</span>
                  <p className="text-xs font-semibold" style={{ color: 'var(--p-text-1)' }}>{res.reservation_date}</p>
                </div>
                <div>
                  <span className="form-label">Time</span>
                  <p className="text-xs font-bold" style={{ color: 'var(--p-accent-text)' }}>{res.reservation_time}</p>
                </div>
                <div>
                  <span className="form-label">Party</span>
                  <p className="text-xs font-semibold" style={{ color: 'var(--p-text-2)' }}>{res.party_size} {text('guests')}</p>
                </div>
              </div>
              {res.tables && <span className="badge badge-amber">{text('Table')} {res.tables.table_number}</span>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => startEdit(res)} className="btn-ghost flex-1 justify-center" style={{ fontSize: '0.75rem' }}>Edit</button>
                <button
                  onClick={async () => {
                    if (confirm(text('Delete this reservation?'))) {
                      const { deleteReservation } = await import('./actions');
                      await deleteReservation(res.id);
                      fetchReservations();
                    }
                  }}
                  className="btn-danger flex-1 justify-center"
                  style={{ fontSize: '0.75rem' }}
                >Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
