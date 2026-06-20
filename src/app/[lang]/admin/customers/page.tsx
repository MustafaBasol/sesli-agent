'use client';

import { useEffect, useState } from 'react';
import { getCustomers, updateCustomer } from './actions';
import { useI18n } from '@/i18n/provider';
import { withLocale } from '@/i18n/config';

type Customer = {
  id: string;
  full_name?: string | null;
  notes?: string | null;
  phone_number?: string | null;
};

export default function CustomersPage() {
  const { locale } = useI18n();
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ full_name: '', notes: '' });

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    setLoading(true);
    const data = await getCustomers();
    setItems(data || []);
    setLoading(false);
  }

  async function handleUpdate() {
    if (!editingId) return;
    try {
      await updateCustomer(editingId, formData);
      setEditingId(null);
      fetchItems();
    } catch {
      alert('Error updating customer');
    }
  }

  const startEdit = (customer: Customer) => {
    setFormData({ full_name: customer.full_name || '', notes: customer.notes || '' });
    setEditingId(customer.id);
  };

  return (
    <div className="space-y-6 pb-10">
      <header>
        <p className="page-label">Operations</p>
        <h2 className="page-title">Customer Directory</h2>
        <p className="page-subtitle">Guest history and loyalty data.</p>
      </header>

      <div className="card">
        {/* Desktop */}
        <div className="hidden sm:block table-container">
          <table className="admin-table">
            <thead>
              <tr>
                {['Customer', 'Phone', 'Notes', ''].map((h, i) => (
                  <th key={i} style={i === 3 ? { textAlign: 'right' } : {}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-12 text-sm" style={{ color: 'var(--p-text-5)' }}>Loading customers...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-16 text-sm" style={{ color: 'var(--p-text-5)' }}>No customers yet</td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {editingId === item.id ? (
                      <input className="form-input" style={{ maxWidth: '200px' }} value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
                    ) : (
                      <a href={withLocale(locale, `/admin/customers/${item.id}`)} className="text-sm font-semibold transition-colors" style={{ color: 'var(--p-text-1)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--p-accent)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--p-text-1)'}
                      >
                        {item.full_name || 'Anonymous'}
                      </a>
                    )}
                  </td>
                  <td className="font-mono text-sm" style={{ color: 'var(--p-text-4)' }}>{item.phone_number}</td>
                  <td>
                    {editingId === item.id ? (
                      <input className="form-input" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Notes..." />
                    ) : (
                      <span className="text-xs italic" style={{ color: 'var(--p-text-5)' }}>{item.notes || '—'}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {editingId === item.id ? (
                      <div className="flex gap-2 justify-end">
                        <button onClick={handleUpdate} className="btn-primary" style={{ padding: '0.3125rem 0.75rem', fontSize: '0.75rem', boxShadow: 'none' }}>Save</button>
                        <button onClick={() => setEditingId(null)} className="btn-ghost" style={{ padding: '0.3125rem 0.75rem', fontSize: '0.75rem' }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(item)} className="btn-ghost" style={{ padding: '0.3125rem 0.75rem', fontSize: '0.75rem' }}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="sm:hidden">
          {loading ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--p-text-5)' }}>Loading...</div>
          ) : items.map((item) => (
            <div key={item.id} className="p-4 space-y-2" style={{ borderBottom: '1px solid var(--p-border-2)' }}>
              <div className="flex justify-between items-start">
                <div className="flex-1 mr-3">
                  {editingId === item.id ? (
                    <input className="form-input" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
                  ) : (
                    <a href={withLocale(locale, `/admin/customers/${item.id}`)} className="text-sm font-semibold block" style={{ color: 'var(--p-text-1)' }}>
                      {item.full_name || 'Anonymous'}
                    </a>
                  )}
                  <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--p-text-5)' }}>{item.phone_number}</p>
                </div>
                {editingId === item.id ? (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={handleUpdate} className="btn-primary" style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem', boxShadow: 'none' }}>Save</button>
                    <button onClick={() => setEditingId(null)} className="btn-ghost" style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(item)} className="btn-ghost" style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}>Edit</button>
                )}
              </div>
              {editingId === item.id ? (
                <input className="form-input" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Notes..." />
              ) : (
                item.notes && <p className="text-xs italic" style={{ color: 'var(--p-text-5)' }}>{item.notes}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
