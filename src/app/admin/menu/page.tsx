'use client';

import { useEffect, useState } from 'react';
import { getMenuItems, getCategories, addCategory, deleteCategory, addMenuItem, updateMenuItem } from './actions';

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

export default function MenuPage() {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [formData, setFormData] = useState({ name: '', category: '', price: 0, description: '', is_available: true, currency: 'EUR' });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [menuData, catData] = await Promise.all([getMenuItems(), getCategories()]);
      setItems(menuData || []);
      setCategories(catData || []);
      if (catData && catData.length > 0 && !formData.category) {
        setFormData(prev => ({ ...prev, category: catData[0].name }));
      }
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  }

  const startEdit = (item: any) => {
    setFormData({ name: item.name, category: item.category, price: item.price, description: item.description || '', is_available: item.is_available, currency: item.currency || 'EUR' });
    setEditingId(item.id);
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  async function handleSave() {
    try {
      if (editingId) {
        await updateMenuItem(editingId, formData);
      } else {
        await addMenuItem(formData);
      }
      setShowAdd(false);
      setEditingId(null);
      fetchData();
      setFormData({ name: '', category: categories[0]?.name || '', price: 0, description: '', is_available: true, currency: 'EUR' });
    } catch {
      alert('Error saving dish');
    }
  }

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="page-label">Operations</p>
          <h2 className="page-title">Menu Management</h2>
          <p className="page-subtitle">Manage dishes and categories.</p>
        </div>
        <div className="flex gap-2 self-start">
          <button onClick={() => setShowCatMgr(!showCatMgr)} className="btn-ghost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            Categories
          </button>
          <button
            onClick={() => { setShowAdd(!showAdd); setEditingId(null); setFormData({ name: '', category: categories[0]?.name || '', price: 0, description: '', is_available: true, currency: 'EUR' }); }}
            className={showAdd ? 'btn-ghost' : 'btn-primary'}
          >
            {showAdd ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Cancel
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Item
              </>
            )}
          </button>
        </div>
      </header>

      {/* Category Manager */}
      {showCatMgr && (
        <div className="card p-5">
          <p className="form-label mb-4">Manage Categories</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg group" style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)' }}>
                <span className="text-sm" style={{ color: 'var(--p-text-2)' }}>{cat.name}</span>
                <button
                  onClick={async () => { if (confirm('Delete category?')) { await deleteCategory(cat.id); fetchData(); } }}
                  className="opacity-0 group-hover:opacity-100 transition-all"
                  style={{ color: 'var(--p-text-5)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ef4444'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--p-text-5)'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 max-w-sm">
            <input
              placeholder="New category name..."
              className="form-input"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newCatName && (addCategory(newCatName).then(() => { setNewCatName(''); fetchData(); }))}
            />
            <button
              onClick={async () => { await addCategory(newCatName); setNewCatName(''); fetchData(); }}
              className="btn-primary"
              style={{ whiteSpace: 'nowrap' }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--p-text-4)' }}><SearchIcon /></span>
          <input
            className="form-input"
            style={{ paddingLeft: '2.25rem' }}
            placeholder="Search dishes..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['All', ...categories.map(c => c.name)].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
              style={selectedCategory === cat
                ? { background: 'var(--p-accent)', color: '#fff' }
                : { background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-4)' }
              }
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAdd && (
        <div className="card">
          <div className="card-header" style={{ background: 'var(--p-accent-bg)', borderColor: 'var(--p-accent-border)' }}>
            <h3 className="card-header-title">{editingId ? 'Edit Dish' : 'Add New Dish'}</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Dish Name</label>
                <input className="form-input" placeholder="e.g. Ribeye Steak" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Category</label>
                <select className="form-input" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                  {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Price (EUR)</label>
                <input type="number" step="0.01" className="form-input" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} />
              </div>
              <div className="md:col-span-3">
                <label className="form-label">Description</label>
                <textarea rows={3} className="form-input resize-none" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Short description..." />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={handleSave} className="btn-primary">{editingId ? 'Update Item' : 'Save Item'}</button>
              <button onClick={() => { setShowAdd(false); setEditingId(null); }} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Menu Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-44 rounded-xl animate-pulse" style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)' }} />)}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--p-subtle)' }}>
            <span style={{ color: 'var(--p-text-5)' }}><SearchIcon /></span>
          </div>
          <p className="text-sm" style={{ color: 'var(--p-text-5)' }}>No dishes found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="card p-5 group cursor-pointer"
              style={{ opacity: item.is_available ? 1 : 0.6 }}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="badge badge-gray">{item.category}</span>
                {!item.is_available && <span className="badge badge-red">Unavailable</span>}
              </div>
              <h4 className="text-base font-bold leading-tight mb-2" style={{ color: 'var(--p-text-1)' }}>{item.name}</h4>
              <p className="text-xs line-clamp-2 min-h-[32px]" style={{ color: 'var(--p-text-5)' }}>{item.description || 'No description.'}</p>
              <div className="mt-4 flex justify-between items-center">
                <span className="text-xl font-bold" style={{ color: 'var(--p-text-1)' }}>{item.price.toFixed(2)} €</span>
                <button
                  onClick={() => startEdit(item)}
                  className="btn-ghost opacity-0 group-hover:opacity-100"
                  style={{ padding: '0.3125rem 0.75rem', fontSize: '0.75rem' }}
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
