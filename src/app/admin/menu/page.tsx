'use client';

import { useEffect, useState } from 'react';
import { getMenuItems, getCategories, addCategory, deleteCategory, addMenuItem, updateMenuItem } from './actions';

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
  
  const [formData, setFormData] = useState({ 
    name: '', 
    category: '', 
    price: 0, 
    description: '', 
    is_available: true,
    currency: 'EUR'
  });

  useEffect(() => {
    fetchData();
  }, []);

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
    setFormData({
      name: item.name,
      category: item.category,
      price: item.price,
      description: item.description || '',
      is_available: item.is_available,
      currency: item.currency || 'EUR'
    });
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
    } catch (error) {
      alert('Error saving dish');
    }
  }

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div>
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white">Menu Management</h2>
          <p className="text-gray-400 mt-1">Manage dishes and categories.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCatMgr(!showCatMgr)} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all">
            📁 Categories
          </button>
          <button 
            onClick={() => { setShowAdd(!showAdd); setEditingId(null); setFormData({ name: '', category: categories[0]?.name || '', price: 0, description: '', is_available: true, currency: 'EUR' }); }}
            className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-xl text-sm font-black transition-all shadow-lg shadow-orange-900/20"
          >
            {showAdd ? 'Cancel' : '+ Add Item'}
          </button>
        </div>
      </header>

      {showCatMgr && (
        <div className="mb-8 bg-gray-900 border border-gray-700 p-6 rounded-3xl animate-in fade-in zoom-in-95">
          <h3 className="text-sm font-black text-gray-500 uppercase mb-4 tracking-widest">Manage Categories</h3>
          <div className="flex flex-wrap gap-2 mb-6">
            {categories.map(cat => (
              <div key={cat.id} className="bg-gray-800 border border-gray-700 px-3 py-1.5 rounded-lg flex items-center gap-2 group">
                <span className="text-sm text-white">{cat.name}</span>
                <button onClick={async () => { if(confirm('Delete?')) { await deleteCategory(cat.id); fetchData(); } }} className="text-red-500 opacity-0 group-hover:opacity-100 transition-all text-xs">✕</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 max-w-md">
            <input placeholder="New Category..." className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
            <button onClick={async () => { await addCategory(newCatName); setNewCatName(''); fetchData(); }} className="bg-green-600 px-4 py-2 rounded-xl text-sm font-bold">Add</button>
          </div>
        </div>
      )}

      <div className="mb-8 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
          <input className="w-full bg-gray-900 border border-gray-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-white focus:border-orange-500 outline-none" placeholder="Search dish..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <select className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-3 text-sm text-white outline-none" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
          <option value="All">All Categories</option>
          {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
        </select>
      </div>

      {showAdd && (
        <div className="mb-8 bg-gray-900 border border-orange-500/30 p-8 rounded-3xl animate-in fade-in slide-in-from-top-4">
          <h3 className="text-lg font-bold mb-6 text-white">{editingId ? 'Edit Dish' : 'Create New Dish'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-black">Dish Name</label>
              <input className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-black">Category</label>
              <select className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-black">Price (EUR)</label>
              <input type="number" step="0.01" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} />
            </div>
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-black">Description</label>
              <textarea className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white h-24" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>
          </div>
          <button onClick={handleSave} className="mt-8 bg-orange-600 px-8 py-2 rounded-xl text-sm font-black hover:bg-orange-500 transition-all">
            {editingId ? 'Update Item' : 'Save Item'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <p className="col-span-full text-center py-24 text-gray-500">Loading...</p>
        ) : filteredItems.map((item) => (
          <div key={item.id} className={`bg-gray-900 border transition-all p-6 rounded-3xl relative group ${
            item.is_available ? 'border-gray-800 hover:border-gray-700' : 'border-red-900/50 opacity-60'
          }`}>
            <div className="flex justify-between items-start mb-3">
              <span className="px-3 py-1 bg-gray-800/50 border border-gray-700/50 text-[9px] rounded-full uppercase font-black text-gray-400 tracking-widest">{item.category}</span>
            </div>
            <h4 className="text-xl font-black text-white leading-tight">{item.name}</h4>
            <p className="text-xs text-gray-500 mt-2 line-clamp-2 italic min-h-[32px]">{item.description || 'No description provided.'}</p>
            <div className="mt-6 flex justify-between items-center">
              <span className="text-2xl font-black text-orange-500">{item.price.toFixed(2)} €</span>
              <div className="flex gap-2 transition-all">
                <button onClick={() => startEdit(item)} className="text-xs bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700 hover:text-orange-500">Edit</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
