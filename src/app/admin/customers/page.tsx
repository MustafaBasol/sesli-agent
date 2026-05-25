'use client';

import { useEffect, useState } from 'react';
import { getCustomers, updateCustomer } from './actions';

export default function CustomersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ full_name: '', notes: '' });

  useEffect(() => {
    fetchItems();
  }, []);

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
    } catch (error) {
      alert('Error updating customer');
    }
  }

  const startEdit = (customer: any) => {
    setFormData({ full_name: customer.full_name || '', notes: customer.notes || '' });
    setEditingId(customer.id);
  };

  return (
    <div>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white">Customer Directory</h2>
        <p className="text-gray-400 mt-1">Manage guest history and loyalty data.</p>
      </header>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs font-bold">
            <tr>
              <th className="px-6 py-4">Customer Name</th>
              <th className="px-6 py-4">Phone</th>
              <th className="px-6 py-4">Notes</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  {editingId === item.id ? (
                    <input 
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white w-full"
                      value={formData.full_name}
                      onChange={e => setFormData({...formData, full_name: e.target.value})}
                    />
                  ) : (
                    <a href={`/admin/customers/${item.id}`} className="font-bold text-white hover:text-orange-500 transition-colors">
                      {item.full_name || 'Anonymous'}
                    </a>
                  )}
                </td>
                <td className="px-6 py-4 text-gray-400 font-mono">{item.phone_number}</td>
                <td className="px-6 py-4">
                  {editingId === item.id ? (
                    <input 
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white w-full"
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                    />
                  ) : (
                    <span className="text-xs text-gray-500 italic">{item.notes || '-'}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {editingId === item.id ? (
                    <div className="flex gap-2 justify-end">
                      <button onClick={handleUpdate} className="text-green-500 font-bold text-xs">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-gray-500 font-bold text-xs">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(item)} className="text-orange-500 hover:underline text-xs">Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
