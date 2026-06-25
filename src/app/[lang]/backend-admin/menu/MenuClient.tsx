'use client';

import { useCallback, useEffect, useState } from 'react';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import {
  createMenuCategory,
  createMenuItem,
  listMenuCategories,
  listMenuItems,
  updateMenuCategory,
  updateMenuItem,
  MENU_STATUSES,
  type BackendLoginResponse,
  type MenuCategoryListItem,
  type MenuCategoryListResponse,
  type MenuItemListItem,
  type MenuItemListResponse,
  type MenuStatus,
} from '@/lib/backend-endpoints';
import { LoginCard, RestaurantPicker } from '../BackendAdminBetaClient';
import BackendAdminNav from '../BackendAdminNav';

type Status = 'idle' | 'loading' | 'error';
type Tab = 'categories' | 'items';

const inputStyle = {
  background: 'var(--p-subtle)',
  border: '1px solid var(--p-border)',
  color: 'var(--p-text-1)',
};

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'active' ? 'badge-green' : 'badge-gray';
  return <span className={`badge ${cls}`}>{status}</span>;
}

function formatPrice(priceCents: number | null, currency: string): string {
  if (priceCents === null) return '—';
  return `${(priceCents / 100).toFixed(2)} ${currency}`;
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export default function MenuClient() {
  const [session, setSession] = useState<BackendLoginResponse | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<Status>('idle');
  const [loginError, setLoginError] = useState('');

  const [tab, setTab] = useState<Tab>('categories');

  // Categories
  const [catStatusFilter, setCatStatusFilter] = useState('');
  const [catSearchInput, setCatSearchInput] = useState('');
  const [catPage, setCatPage] = useState(1);
  const [catListStatus, setCatListStatus] = useState<Status>('idle');
  const [catListError, setCatListError] = useState('');
  const [catListResult, setCatListResult] = useState<MenuCategoryListResponse | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [catActionStatus, setCatActionStatus] = useState<Status>('idle');
  const [catActionError, setCatActionError] = useState('');
  const [catActionMessage, setCatActionMessage] = useState('');

  const [editCatName, setEditCatName] = useState('');
  const [editCatDescription, setEditCatDescription] = useState('');
  const [editCatSortOrder, setEditCatSortOrder] = useState('0');
  const [editCatStatus, setEditCatStatus] = useState<MenuStatus>('active');

  const [showCreateCat, setShowCreateCat] = useState(false);
  const [createCatName, setCreateCatName] = useState('');
  const [createCatSortOrder, setCreateCatSortOrder] = useState('0');
  const [createCatActionStatus, setCreateCatActionStatus] = useState<Status>('idle');
  const [createCatActionError, setCreateCatActionError] = useState('');

  // Items
  const [allCategories, setAllCategories] = useState<MenuCategoryListItem[]>([]);
  const [itemCategoryFilter, setItemCategoryFilter] = useState('');
  const [itemStatusFilter, setItemStatusFilter] = useState('');
  const [itemAvailFilter, setItemAvailFilter] = useState('');
  const [itemSearchInput, setItemSearchInput] = useState('');
  const [itemPage, setItemPage] = useState(1);
  const [itemListStatus, setItemListStatus] = useState<Status>('idle');
  const [itemListError, setItemListError] = useState('');
  const [itemListResult, setItemListResult] = useState<MenuItemListResponse | null>(null);

  const [selectedItemId, setSelectedItemId] = useState('');
  const [itemActionStatus, setItemActionStatus] = useState<Status>('idle');
  const [itemActionError, setItemActionError] = useState('');
  const [itemActionMessage, setItemActionMessage] = useState('');

  const [editItemName, setEditItemName] = useState('');
  const [editItemDescription, setEditItemDescription] = useState('');
  const [editItemCategoryId, setEditItemCategoryId] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemCurrency, setEditItemCurrency] = useState('EUR');
  const [editItemAllergens, setEditItemAllergens] = useState('');
  const [editItemDietary, setEditItemDietary] = useState('');
  const [editItemAliases, setEditItemAliases] = useState('');
  const [editItemAvailable, setEditItemAvailable] = useState(true);
  const [editItemStatus, setEditItemStatus] = useState<MenuStatus>('active');

  const [showCreateItem, setShowCreateItem] = useState(false);
  const [createItemName, setCreateItemName] = useState('');
  const [createItemCategoryId, setCreateItemCategoryId] = useState('');
  const [createItemPrice, setCreateItemPrice] = useState('');
  const [createItemActionStatus, setCreateItemActionStatus] = useState<Status>('idle');
  const [createItemActionError, setCreateItemActionError] = useState('');

  useEffect(() => {
    const token = backendAuth.getToken();
    const user = backendAuth.getUser();
    if (token && user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSession({ token, user, accessibleRestaurantIds: backendAuth.getAccessibleRestaurantIds() });
      const savedRestaurantId = backendAuth.getSelectedRestaurantId();
      if (savedRestaurantId) setRestaurantId(savedRestaurantId);
    }
    setBootstrapped(true);
  }, []);

  const loadCategories = useCallback(() => {
    if (!session || !restaurantId) return;
    setCatListStatus('loading');
    setCatListError('');
    listMenuCategories(restaurantId, session.token, {
      status: (catStatusFilter as MenuStatus) || undefined,
      search: catSearchInput || undefined,
      page: catPage,
      pageSize: 20,
    })
      .then((result) => {
        setCatListResult(result);
        setCatListStatus('idle');
      })
      .catch((err) => {
        setCatListError(err instanceof BackendApiError ? err.message : 'Failed to load categories');
        setCatListStatus('error');
      });
  }, [session, restaurantId, catStatusFilter, catSearchInput, catPage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCategories();
  }, [loadCategories]);

  // Full category list (unfiltered, for the item category-filter/edit dropdowns).
  const loadAllCategories = useCallback(() => {
    if (!session || !restaurantId) return;
    listMenuCategories(restaurantId, session.token, { pageSize: 100 })
      .then((result) => setAllCategories(result.data))
      .catch(() => setAllCategories([]));
  }, [session, restaurantId]);

  useEffect(() => {
    loadAllCategories();
  }, [loadAllCategories]);

  const loadItems = useCallback(() => {
    if (!session || !restaurantId) return;
    setItemListStatus('loading');
    setItemListError('');
    listMenuItems(restaurantId, session.token, {
      categoryId: itemCategoryFilter || undefined,
      status: (itemStatusFilter as MenuStatus) || undefined,
      isAvailable: itemAvailFilter === '' ? undefined : itemAvailFilter === 'true',
      search: itemSearchInput || undefined,
      page: itemPage,
      pageSize: 20,
    })
      .then((result) => {
        setItemListResult(result);
        setItemListStatus('idle');
      })
      .catch((err) => {
        setItemListError(err instanceof BackendApiError ? err.message : 'Failed to load items');
        setItemListStatus('error');
      });
  }, [session, restaurantId, itemCategoryFilter, itemStatusFilter, itemAvailFilter, itemSearchInput, itemPage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems();
  }, [loadItems]);

  const handleLogin = async () => {
    setLoginStatus('loading');
    setLoginError('');
    try {
      const result = await backendAuth.login(email, password);
      setSession(result);
      if (result.accessibleRestaurantIds.length === 1) {
        selectRestaurant(result.accessibleRestaurantIds[0]);
      }
      setLoginStatus('idle');
    } catch (err) {
      setLoginError(err instanceof BackendApiError ? err.message : 'Login failed');
      setLoginStatus('error');
    }
  };

  const selectRestaurant = (id: string) => {
    backendAuth.setSelectedRestaurantId(id);
    setRestaurantId(id);
  };

  const handleLogout = () => {
    backendAuth.logout();
    setSession(null);
    setRestaurantId('');
    setCatListResult(null);
    setItemListResult(null);
  };

  const selectCategory = (category: MenuCategoryListItem) => {
    setSelectedCategoryId(category.id);
    setEditCatName(category.name);
    setEditCatDescription(category.description ?? '');
    setEditCatSortOrder(String(category.sortOrder));
    setEditCatStatus(category.status);
    setCatActionMessage('');
    setCatActionError('');
  };

  const handleSaveCategory = async () => {
    if (!session || !restaurantId || !selectedCategoryId) return;
    setCatActionStatus('loading');
    setCatActionError('');
    setCatActionMessage('');
    try {
      await updateMenuCategory(restaurantId, session.token, selectedCategoryId, {
        name: editCatName || undefined,
        description: editCatDescription || null,
        sortOrder: editCatSortOrder ? Number(editCatSortOrder) : undefined,
        status: editCatStatus,
      });
      setCatActionStatus('idle');
      setCatActionMessage('Category updated.');
      loadCategories();
      loadAllCategories();
    } catch (err) {
      setCatActionError(err instanceof BackendApiError ? err.message : 'Update failed');
      setCatActionStatus('error');
    }
  };

  const handleCreateCategory = async () => {
    if (!session || !restaurantId) return;
    setCreateCatActionStatus('loading');
    setCreateCatActionError('');
    try {
      await createMenuCategory(restaurantId, session.token, {
        name: createCatName,
        sortOrder: createCatSortOrder ? Number(createCatSortOrder) : undefined,
      });
      setCreateCatActionStatus('idle');
      setShowCreateCat(false);
      setCreateCatName('');
      setCreateCatSortOrder('0');
      loadCategories();
      loadAllCategories();
    } catch (err) {
      setCreateCatActionError(err instanceof BackendApiError ? err.message : 'Create failed');
      setCreateCatActionStatus('error');
    }
  };

  const selectItem = (item: MenuItemListItem) => {
    setSelectedItemId(item.id);
    setEditItemName(item.name);
    setEditItemDescription(item.description ?? '');
    setEditItemCategoryId(item.categoryId ?? '');
    setEditItemPrice(item.priceCents !== null ? (item.priceCents / 100).toFixed(2) : '');
    setEditItemCurrency(item.currency);
    setEditItemAllergens(item.allergens.join(', '));
    setEditItemDietary(item.dietaryTags.join(', '));
    setEditItemAliases(item.aliases.join(', '));
    setEditItemAvailable(item.isAvailable);
    setEditItemStatus(item.status);
    setItemActionMessage('');
    setItemActionError('');
  };

  const handleSaveItem = async () => {
    if (!session || !restaurantId || !selectedItemId) return;
    setItemActionStatus('loading');
    setItemActionError('');
    setItemActionMessage('');
    try {
      await updateMenuItem(restaurantId, session.token, selectedItemId, {
        name: editItemName || undefined,
        description: editItemDescription || null,
        categoryId: editItemCategoryId || null,
        priceCents: editItemPrice ? Math.round(Number(editItemPrice) * 100) : null,
        currency: editItemCurrency || undefined,
        allergensJson: parseCsv(editItemAllergens),
        dietaryTagsJson: parseCsv(editItemDietary),
        aliasesJson: parseCsv(editItemAliases),
        isAvailable: editItemAvailable,
        status: editItemStatus,
      });
      setItemActionStatus('idle');
      setItemActionMessage('Item updated.');
      loadItems();
    } catch (err) {
      setItemActionError(err instanceof BackendApiError ? err.message : 'Update failed');
      setItemActionStatus('error');
    }
  };

  const handleCreateItem = async () => {
    if (!session || !restaurantId) return;
    setCreateItemActionStatus('loading');
    setCreateItemActionError('');
    try {
      const created = await createMenuItem(restaurantId, session.token, {
        name: createItemName,
        categoryId: createItemCategoryId || null,
        priceCents: createItemPrice ? Math.round(Number(createItemPrice) * 100) : null,
      });
      setCreateItemActionStatus('idle');
      setShowCreateItem(false);
      setCreateItemName('');
      setCreateItemCategoryId('');
      setCreateItemPrice('');
      loadItems();
      selectItem(created);
    } catch (err) {
      setCreateItemActionError(err instanceof BackendApiError ? err.message : 'Create failed');
      setCreateItemActionStatus('error');
    }
  };

  if (!bootstrapped) return null;

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--p-bg)' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="page-label">Beta</p>
            <h2 className="page-title">Menu (Beta)</h2>
            <p className="page-subtitle">
              Menu categories and items from the new backend API. Separate from the production Supabase admin menu.
              No Vapi tool reads this data yet.
            </p>
          </div>
          {session && <BackendAdminNav onLogout={handleLogout} />}
        </header>

        {!session ? (
          <LoginCard
            email={email}
            password={password}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={handleLogin}
            status={loginStatus}
            error={loginError}
          />
        ) : !restaurantId ? (
          <RestaurantPicker session={session} onSelect={selectRestaurant} />
        ) : (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => setTab('categories')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={
                  tab === 'categories'
                    ? { background: 'var(--p-accent)', color: 'var(--p-accent-contrast, #fff)' }
                    : { border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }
                }
              >
                Categories
              </button>
              <button
                onClick={() => setTab('items')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={
                  tab === 'items'
                    ? { background: 'var(--p-accent)', color: 'var(--p-accent-contrast, #fff)' }
                    : { border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }
                }
              >
                Items
              </button>
            </div>

            {tab === 'categories' ? (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <div className="lg:col-span-3 space-y-4">
                  <div className="card p-4 flex flex-wrap items-end gap-3">
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                        Status
                      </label>
                      <select
                        value={catStatusFilter}
                        onChange={(e) => {
                          setCatStatusFilter(e.target.value);
                          setCatPage(1);
                        }}
                        className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
                        style={inputStyle}
                      >
                        <option value="">All</option>
                        {MENU_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                        Search
                      </label>
                      <input
                        type="text"
                        placeholder="Category name"
                        value={catSearchInput}
                        onChange={(e) => setCatSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (setCatPage(1), loadCategories())}
                        className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                        style={inputStyle}
                      />
                    </div>
                    <button
                      onClick={() => {
                        setCatPage(1);
                        loadCategories();
                      }}
                      className="btn-primary"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setShowCreateCat((v) => !v)}
                      className="text-xs font-semibold px-3 py-2 rounded-lg ml-auto"
                      style={{ background: 'var(--p-accent)', color: 'var(--p-accent-contrast, #fff)' }}
                    >
                      Add Category
                    </button>
                  </div>

                  {showCreateCat && (
                    <div className="card p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                        New category
                      </p>
                      {createCatActionStatus === 'error' && (
                        <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{createCatActionError}</p>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Name</label>
                          <input
                            type="text"
                            value={createCatName}
                            onChange={(e) => setCreateCatName(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Sort order</label>
                          <input
                            type="number"
                            value={createCatSortOrder}
                            onChange={(e) => setCreateCatSortOrder(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateCategory}
                          disabled={createCatActionStatus === 'loading' || !createCatName}
                          className="text-xs font-semibold px-3 py-2 rounded-lg"
                          style={{ background: 'var(--p-accent)', color: 'var(--p-accent-contrast, #fff)' }}
                        >
                          Save category
                        </button>
                        <button
                          onClick={() => setShowCreateCat(false)}
                          className="text-xs font-semibold px-3 py-2 rounded-lg"
                          style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {catListStatus === 'loading' ? (
                    <div className="card p-10 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--p-border)', borderTopColor: 'var(--p-accent)' }} />
                    </div>
                  ) : catListStatus === 'error' ? (
                    <div className="card p-6 text-center">
                      <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>Failed to load categories</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{catListError}</p>
                    </div>
                  ) : !catListResult || catListResult.data.length === 0 ? (
                    <div className="card p-10 text-center">
                      <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No categories found.</p>
                    </div>
                  ) : (
                    <div className="card">
                      <div className="divide-y" style={{ borderColor: 'var(--p-border-2)' }}>
                        {catListResult.data.map((category) => (
                          <button
                            key={category.id}
                            onClick={() => selectCategory(category)}
                            className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left"
                            style={category.id === selectedCategoryId ? { background: 'var(--p-subtle)' } : undefined}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>{category.name}</p>
                              <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
                                {category.itemCount} item{category.itemCount === 1 ? '' : 's'} · sort {category.sortOrder}
                              </p>
                            </div>
                            <StatusBadge status={category.status} />
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>
                          Page {catListResult.pagination.page} of {catListResult.pagination.totalPages} · {catListResult.pagination.total} total
                        </p>
                        <div className="flex gap-2">
                          <button
                            disabled={catListResult.pagination.page <= 1}
                            onClick={() => setCatPage(catListResult.pagination.page - 1)}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-40"
                            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
                          >
                            Prev
                          </button>
                          <button
                            disabled={catListResult.pagination.page >= catListResult.pagination.totalPages}
                            onClick={() => setCatPage(catListResult.pagination.page + 1)}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-40"
                            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2">
                  {!selectedCategoryId ? (
                    <div className="card p-8 text-center">
                      <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>Select a category to edit.</p>
                    </div>
                  ) : (
                    <div className="card">
                      <div className="card-header">
                        <h3 className="card-header-title">Edit category</h3>
                      </div>
                      <div className="p-5 space-y-3">
                        {catActionMessage && <p className="text-xs font-medium" style={{ color: '#15803d' }}>{catActionMessage}</p>}
                        {catActionStatus === 'error' && <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{catActionError}</p>}
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Name</label>
                          <input
                            type="text"
                            value={editCatName}
                            onChange={(e) => setEditCatName(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Description</label>
                          <textarea
                            value={editCatDescription}
                            onChange={(e) => setEditCatDescription(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                            rows={2}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Sort order</label>
                            <input
                              type="number"
                              value={editCatSortOrder}
                              onChange={(e) => setEditCatSortOrder(e.target.value)}
                              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Status</label>
                            <select
                              value={editCatStatus}
                              onChange={(e) => setEditCatStatus(e.target.value as MenuStatus)}
                              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                              style={inputStyle}
                            >
                              {MENU_STATUSES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button
                          onClick={handleSaveCategory}
                          disabled={catActionStatus === 'loading'}
                          className="text-xs font-semibold px-3 py-2 rounded-lg"
                          style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
                        >
                          Save changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <div className="lg:col-span-3 space-y-4">
                  <div className="card p-4 flex flex-wrap items-end gap-3">
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                        Category
                      </label>
                      <select
                        value={itemCategoryFilter}
                        onChange={(e) => {
                          setItemCategoryFilter(e.target.value);
                          setItemPage(1);
                        }}
                        className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
                        style={inputStyle}
                      >
                        <option value="">All</option>
                        {allCategories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                        Status
                      </label>
                      <select
                        value={itemStatusFilter}
                        onChange={(e) => {
                          setItemStatusFilter(e.target.value);
                          setItemPage(1);
                        }}
                        className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
                        style={inputStyle}
                      >
                        <option value="">All</option>
                        {MENU_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                        Available
                      </label>
                      <select
                        value={itemAvailFilter}
                        onChange={(e) => {
                          setItemAvailFilter(e.target.value);
                          setItemPage(1);
                        }}
                        className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
                        style={inputStyle}
                      >
                        <option value="">All</option>
                        <option value="true">Available</option>
                        <option value="false">Unavailable</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                        Search
                      </label>
                      <input
                        type="text"
                        placeholder="Item name or description"
                        value={itemSearchInput}
                        onChange={(e) => setItemSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (setItemPage(1), loadItems())}
                        className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                        style={inputStyle}
                      />
                    </div>
                    <button
                      onClick={() => {
                        setItemPage(1);
                        loadItems();
                      }}
                      className="btn-primary"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setShowCreateItem((v) => !v)}
                      className="text-xs font-semibold px-3 py-2 rounded-lg ml-auto"
                      style={{ background: 'var(--p-accent)', color: 'var(--p-accent-contrast, #fff)' }}
                    >
                      Add Item
                    </button>
                  </div>

                  {showCreateItem && (
                    <div className="card p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                        New item
                      </p>
                      {createItemActionStatus === 'error' && (
                        <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{createItemActionError}</p>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Name</label>
                          <input
                            type="text"
                            value={createItemName}
                            onChange={(e) => setCreateItemName(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Category</label>
                          <select
                            value={createItemCategoryId}
                            onChange={(e) => setCreateItemCategoryId(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                          >
                            <option value="">Uncategorized</option>
                            {allCategories.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Price</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Optional"
                            value={createItemPrice}
                            onChange={(e) => setCreateItemPrice(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateItem}
                          disabled={createItemActionStatus === 'loading' || !createItemName}
                          className="text-xs font-semibold px-3 py-2 rounded-lg"
                          style={{ background: 'var(--p-accent)', color: 'var(--p-accent-contrast, #fff)' }}
                        >
                          Save item
                        </button>
                        <button
                          onClick={() => setShowCreateItem(false)}
                          className="text-xs font-semibold px-3 py-2 rounded-lg"
                          style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {itemListStatus === 'loading' ? (
                    <div className="card p-10 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--p-border)', borderTopColor: 'var(--p-accent)' }} />
                    </div>
                  ) : itemListStatus === 'error' ? (
                    <div className="card p-6 text-center">
                      <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>Failed to load items</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{itemListError}</p>
                    </div>
                  ) : !itemListResult || itemListResult.data.length === 0 ? (
                    <div className="card p-10 text-center">
                      <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No items found.</p>
                    </div>
                  ) : (
                    <div className="card">
                      <div className="divide-y" style={{ borderColor: 'var(--p-border-2)' }}>
                        {itemListResult.data.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => selectItem(item)}
                            className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left"
                            style={item.id === selectedItemId ? { background: 'var(--p-subtle)' } : undefined}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>{item.name}</p>
                              <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
                                {formatPrice(item.priceCents, item.currency)}
                                {!item.isAvailable ? ' · unavailable' : ''}
                              </p>
                            </div>
                            <StatusBadge status={item.status} />
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>
                          Page {itemListResult.pagination.page} of {itemListResult.pagination.totalPages} · {itemListResult.pagination.total} total
                        </p>
                        <div className="flex gap-2">
                          <button
                            disabled={itemListResult.pagination.page <= 1}
                            onClick={() => setItemPage(itemListResult.pagination.page - 1)}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-40"
                            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
                          >
                            Prev
                          </button>
                          <button
                            disabled={itemListResult.pagination.page >= itemListResult.pagination.totalPages}
                            onClick={() => setItemPage(itemListResult.pagination.page + 1)}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-40"
                            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2">
                  {!selectedItemId ? (
                    <div className="card p-8 text-center">
                      <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>Select an item to edit.</p>
                    </div>
                  ) : (
                    <div className="card">
                      <div className="card-header">
                        <h3 className="card-header-title">Edit item</h3>
                      </div>
                      <div className="p-5 space-y-3">
                        {itemActionMessage && <p className="text-xs font-medium" style={{ color: '#15803d' }}>{itemActionMessage}</p>}
                        {itemActionStatus === 'error' && <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{itemActionError}</p>}
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Name</label>
                          <input
                            type="text"
                            value={editItemName}
                            onChange={(e) => setEditItemName(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Description</label>
                          <textarea
                            value={editItemDescription}
                            onChange={(e) => setEditItemDescription(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                            rows={2}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Category</label>
                            <select
                              value={editItemCategoryId}
                              onChange={(e) => setEditItemCategoryId(e.target.value)}
                              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                              style={inputStyle}
                            >
                              <option value="">Uncategorized</option>
                              {allCategories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Status</label>
                            <select
                              value={editItemStatus}
                              onChange={(e) => setEditItemStatus(e.target.value as MenuStatus)}
                              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                              style={inputStyle}
                            >
                              {MENU_STATUSES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Price</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Optional"
                              value={editItemPrice}
                              onChange={(e) => setEditItemPrice(e.target.value)}
                              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Currency</label>
                            <input
                              type="text"
                              value={editItemCurrency}
                              onChange={(e) => setEditItemCurrency(e.target.value)}
                              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                              style={inputStyle}
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--p-text-3)' }}>
                          <input
                            type="checkbox"
                            checked={editItemAvailable}
                            onChange={(e) => setEditItemAvailable(e.target.checked)}
                          />
                          Available
                        </label>
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Allergens (comma-separated)</label>
                          <input
                            type="text"
                            value={editItemAllergens}
                            onChange={(e) => setEditItemAllergens(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Dietary tags (comma-separated)</label>
                          <input
                            type="text"
                            value={editItemDietary}
                            onChange={(e) => setEditItemDietary(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Aliases (comma-separated)</label>
                          <input
                            type="text"
                            value={editItemAliases}
                            onChange={(e) => setEditItemAliases(e.target.value)}
                            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                            style={inputStyle}
                          />
                        </div>
                        <button
                          onClick={handleSaveItem}
                          disabled={itemActionStatus === 'loading'}
                          className="text-xs font-semibold px-3 py-2 rounded-lg"
                          style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
                        >
                          Save changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
