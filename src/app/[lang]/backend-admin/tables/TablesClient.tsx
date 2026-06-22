'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import {
  createTable,
  getTableDetail,
  listTables,
  updateTable,
  TABLE_STATUSES,
  type BackendLoginResponse,
  type RestaurantTableDetail,
  type RestaurantTableListItem,
  type RestaurantTableListResponse,
  type RestaurantTableStatus,
} from '@/lib/backend-endpoints';
import { LoginCard, RestaurantPicker } from '../BackendAdminBetaClient';
import BackendAdminNav from '../BackendAdminNav';

type Status = 'idle' | 'loading' | 'error';

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'active' ? 'badge-green' : 'badge-gray';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function TablesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [session, setSession] = useState<BackendLoginResponse | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<Status>('idle');
  const [loginError, setLoginError] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const [listStatus, setListStatus] = useState<Status>('idle');
  const [listError, setListError] = useState('');
  const [listResult, setListResult] = useState<RestaurantTableListResponse | null>(null);

  const selectedTableId = searchParams.get('tableId') ?? '';
  const [detailStatus, setDetailStatus] = useState<Status>('idle');
  const [detailError, setDetailError] = useState('');
  const [detail, setDetail] = useState<RestaurantTableDetail | null>(null);

  const [actionStatus, setActionStatus] = useState<Status>('idle');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const [editTableNumber, setEditTableNumber] = useState('');
  const [editCapacity, setEditCapacity] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editStatus, setEditStatus] = useState<RestaurantTableStatus>('active');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTableNumber, setCreateTableNumber] = useState('');
  const [createCapacity, setCreateCapacity] = useState('');
  const [createLocation, setCreateLocation] = useState('');
  const [createStatus, setCreateStatus] = useState<RestaurantTableStatus>('active');
  const [createActionStatus, setCreateActionStatus] = useState<Status>('idle');
  const [createActionError, setCreateActionError] = useState('');

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

  const loadList = useCallback(() => {
    if (!session || !restaurantId) return;
    setListStatus('loading');
    setListError('');
    listTables(restaurantId, session.token, {
      status: (statusFilter as RestaurantTableStatus) || undefined,
      search: searchInput || undefined,
      page,
      pageSize: 20,
    })
      .then((result) => {
        setListResult(result);
        setListStatus('idle');
      })
      .catch((err) => {
        setListError(err instanceof BackendApiError ? err.message : 'Failed to load tables');
        setListStatus('error');
      });
  }, [session, restaurantId, statusFilter, searchInput, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(() => {
    if (!session || !restaurantId || !selectedTableId) {
      setDetail(null);
      return;
    }
    setDetailStatus('loading');
    setDetailError('');
    getTableDetail(restaurantId, session.token, selectedTableId)
      .then((result) => {
        setDetail(result);
        setEditTableNumber(result.tableNumber);
        setEditCapacity(String(result.capacity));
        setEditLocation(result.location ?? '');
        setEditStatus(result.status);
        setDetailStatus('idle');
      })
      .catch((err) => {
        setDetailError(err instanceof BackendApiError ? err.message : 'Failed to load table');
        setDetailStatus('error');
      });
  }, [session, restaurantId, selectedTableId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail();
  }, [loadDetail]);

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
    setListResult(null);
    setDetail(null);
  };

  const openDetail = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tableId', id);
    router.push(`?${params.toString()}`);
  };

  const closeDetail = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('tableId');
    const query = params.toString();
    router.push(query ? `?${query}` : '?');
  };

  const refreshAll = () => {
    loadList();
    loadDetail();
  };

  const handleSaveEdits = async () => {
    if (!session || !detail) return;
    setActionStatus('loading');
    setActionError('');
    setActionMessage('');
    try {
      await updateTable(restaurantId, session.token, detail.id, {
        tableNumber: editTableNumber || undefined,
        capacity: editCapacity ? Number(editCapacity) : undefined,
        location: editLocation || null,
        status: editStatus,
      });
      setActionStatus('idle');
      setActionMessage('Table updated.');
      refreshAll();
    } catch (err) {
      setActionError(err instanceof BackendApiError ? err.message : 'Update failed');
      setActionStatus('error');
    }
  };

  const handleCreate = async () => {
    if (!session || !restaurantId) return;
    setCreateActionStatus('loading');
    setCreateActionError('');
    try {
      const created = await createTable(restaurantId, session.token, {
        tableNumber: createTableNumber,
        capacity: Number(createCapacity),
        location: createLocation || null,
        status: createStatus,
      });
      setCreateActionStatus('idle');
      setShowCreateForm(false);
      setCreateTableNumber('');
      setCreateCapacity('');
      setCreateLocation('');
      setCreateStatus('active');
      loadList();
      openDetail(created.id);
    } catch (err) {
      setCreateActionError(err instanceof BackendApiError ? err.message : 'Create failed');
      setCreateActionStatus('error');
    }
  };

  if (!bootstrapped) return null;

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--p-bg)' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="page-label">Beta</p>
            <h2 className="page-title">Tables (Beta)</h2>
            <p className="page-subtitle">
              Restaurant tables from the new backend API. Separate from the production Supabase admin.
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
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 space-y-4">
              <Filters
                statusFilter={statusFilter}
                onStatusFilterChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                searchInput={searchInput}
                onSearchInputChange={setSearchInput}
                onApply={() => {
                  setPage(1);
                  loadList();
                }}
                onRefresh={loadList}
                onAddTable={() => setShowCreateForm((v) => !v)}
              />
              {showCreateForm && (
                <CreateForm
                  tableNumber={createTableNumber}
                  onTableNumberChange={setCreateTableNumber}
                  capacity={createCapacity}
                  onCapacityChange={setCreateCapacity}
                  location={createLocation}
                  onLocationChange={setCreateLocation}
                  status={createStatus}
                  onStatusChange={setCreateStatus}
                  onSave={handleCreate}
                  onCancel={() => setShowCreateForm(false)}
                  actionStatus={createActionStatus}
                  actionError={createActionError}
                />
              )}
              <ListPanel
                status={listStatus}
                error={listError}
                result={listResult}
                selectedTableId={selectedTableId}
                onSelect={openDetail}
                onPageChange={setPage}
              />
            </div>
            <div className="lg:col-span-2">
              {selectedTableId ? (
                <DetailPanel
                  status={detailStatus}
                  error={detailError}
                  detail={detail}
                  onClose={closeDetail}
                  actionStatus={actionStatus}
                  actionError={actionError}
                  actionMessage={actionMessage}
                  editTableNumber={editTableNumber}
                  onEditTableNumberChange={setEditTableNumber}
                  editCapacity={editCapacity}
                  onEditCapacityChange={setEditCapacity}
                  editLocation={editLocation}
                  onEditLocationChange={setEditLocation}
                  editStatus={editStatus}
                  onEditStatusChange={setEditStatus}
                  onSaveEdits={handleSaveEdits}
                />
              ) : (
                <div className="card p-8 text-center">
                  <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>
                    Select a table to view details.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Filters({
  statusFilter,
  onStatusFilterChange,
  searchInput,
  onSearchInputChange,
  onApply,
  onRefresh,
  onAddTable,
}: {
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onApply: () => void;
  onRefresh: () => void;
  onAddTable: () => void;
}) {
  const inputStyle = {
    background: 'var(--p-subtle)',
    border: '1px solid var(--p-border)',
    color: 'var(--p-text-1)',
  };

  return (
    <div className="card p-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          Status
        </label>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        >
          <option value="">All</option>
          {TABLE_STATUSES.map((s) => (
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
          placeholder="Table number or location"
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onApply()}
          className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        />
      </div>
      <button onClick={onApply} className="btn-primary">
        Apply
      </button>
      <button
        onClick={onRefresh}
        className="text-xs font-semibold px-3 py-2 rounded-lg"
        style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
      >
        Refresh
      </button>
      <button
        onClick={onAddTable}
        className="text-xs font-semibold px-3 py-2 rounded-lg ml-auto"
        style={{ background: 'var(--p-accent)', color: 'var(--p-accent-contrast, #fff)' }}
      >
        Add Table
      </button>
    </div>
  );
}

function CreateForm({
  tableNumber,
  onTableNumberChange,
  capacity,
  onCapacityChange,
  location,
  onLocationChange,
  status,
  onStatusChange,
  onSave,
  onCancel,
  actionStatus,
  actionError,
}: {
  tableNumber: string;
  onTableNumberChange: (value: string) => void;
  capacity: string;
  onCapacityChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  status: RestaurantTableStatus;
  onStatusChange: (value: RestaurantTableStatus) => void;
  onSave: () => void;
  onCancel: () => void;
  actionStatus: Status;
  actionError: string;
}) {
  const inputStyle = {
    background: 'var(--p-subtle)',
    border: '1px solid var(--p-border)',
    color: 'var(--p-text-1)',
  };

  return (
    <div className="card p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
        New table
      </p>
      {actionStatus === 'error' && (
        <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{actionError}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Table number</label>
          <input
            type="text"
            value={tableNumber}
            onChange={(e) => onTableNumberChange(e.target.value)}
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Capacity</label>
          <input
            type="number"
            min={1}
            max={100}
            value={capacity}
            onChange={(e) => onCapacityChange(e.target.value)}
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Status</label>
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as RestaurantTableStatus)}
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
            style={inputStyle}
          >
            {TABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={actionStatus === 'loading' || !tableNumber || !capacity}
          className="text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ background: 'var(--p-accent)', color: 'var(--p-accent-contrast, #fff)' }}
        >
          Save table
        </button>
        <button
          onClick={onCancel}
          className="text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ListPanel({
  status,
  error,
  result,
  selectedTableId,
  onSelect,
  onPageChange,
}: {
  status: Status;
  error: string;
  result: RestaurantTableListResponse | null;
  selectedTableId: string;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
}) {
  if (status === 'loading') {
    return (
      <div className="card p-10 flex items-center justify-center">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--p-border)', borderTopColor: 'var(--p-accent)' }}
        />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>
          Failed to load tables
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
      </div>
    );
  }

  if (!result || result.data.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No tables found.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="divide-y" style={{ borderColor: 'var(--p-border-2)' }}>
        {result.data.map((item) => (
          <ListRow key={item.id} item={item} isSelected={item.id === selectedTableId} onSelect={onSelect} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>
          Page {result.pagination.page} of {result.pagination.totalPages} · {result.pagination.total} total
        </p>
        <div className="flex gap-2">
          <button
            disabled={result.pagination.page <= 1}
            onClick={() => onPageChange(result.pagination.page - 1)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-40"
            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
          >
            Prev
          </button>
          <button
            disabled={result.pagination.page >= result.pagination.totalPages}
            onClick={() => onPageChange(result.pagination.page + 1)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-40"
            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function ListRow({
  item,
  isSelected,
  onSelect,
}: {
  item: RestaurantTableListItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(item.id)}
      className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left"
      style={isSelected ? { background: 'var(--p-subtle)' } : undefined}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>
          Table {item.tableNumber}
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
          {item.capacity} pax{item.location ? ` · ${item.location}` : ''}
          {item.upcomingReservationCount > 0 ? ` · ${item.upcomingReservationCount} upcoming` : ''}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={item.status} />
      </div>
    </button>
  );
}

function DetailPanel({
  status,
  error,
  detail,
  onClose,
  actionStatus,
  actionError,
  actionMessage,
  editTableNumber,
  onEditTableNumberChange,
  editCapacity,
  onEditCapacityChange,
  editLocation,
  onEditLocationChange,
  editStatus,
  onEditStatusChange,
  onSaveEdits,
}: {
  status: Status;
  error: string;
  detail: RestaurantTableDetail | null;
  onClose: () => void;
  actionStatus: Status;
  actionError: string;
  actionMessage: string;
  editTableNumber: string;
  onEditTableNumberChange: (value: string) => void;
  editCapacity: string;
  onEditCapacityChange: (value: string) => void;
  editLocation: string;
  onEditLocationChange: (value: string) => void;
  editStatus: RestaurantTableStatus;
  onEditStatusChange: (value: RestaurantTableStatus) => void;
  onSaveEdits: () => void;
}) {
  const inputStyle = {
    background: 'var(--p-subtle)',
    border: '1px solid var(--p-border)',
    color: 'var(--p-text-1)',
  };

  if (status === 'loading') {
    return (
      <div className="card p-10 flex items-center justify-center">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--p-border)', borderTopColor: 'var(--p-accent)' }}
        />
      </div>
    );
  }

  if (status === 'error' || !detail) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>
          Failed to load table
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
        <button onClick={onClose} className="text-xs font-semibold mt-3" style={{ color: 'var(--p-accent-text)' }}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-header-title">Table {detail.tableNumber}</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--p-text-5)' }}>{detail.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={detail.status} />
          <button onClick={onClose} className="text-xs font-semibold" style={{ color: 'var(--p-accent-text)' }}>
            Close
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {actionMessage && (
          <p className="text-xs font-medium" style={{ color: '#15803d' }}>{actionMessage}</p>
        )}
        {actionStatus === 'error' && (
          <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{actionError}</p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Capacity" value={`${detail.capacity} pax`} />
          <Field label="Location" value={detail.location || '—'} />
          <Field label="Created" value={new Date(detail.createdAt).toLocaleString()} />
          <Field label="Updated" value={new Date(detail.updatedAt).toLocaleString()} />
        </div>

        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            Upcoming reservations ({detail.upcomingReservationCount})
          </p>
          {detail.upcomingReservations.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>No upcoming reservations.</p>
          ) : (
            <div className="space-y-1.5">
              {detail.upcomingReservations.map((r) => (
                <div key={r.id} className="text-xs flex items-center justify-between gap-2" style={{ color: 'var(--p-text-3)' }}>
                  <span className="truncate">{r.customerName || 'Guest'} · {r.partySize} pax</span>
                  <span className="shrink-0">{r.reservationDate.slice(0, 10)} {r.reservationTime}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            Edit table
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Table number</label>
              <input
                type="text"
                value={editTableNumber}
                onChange={(e) => onEditTableNumberChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Capacity</label>
              <input
                type="number"
                min={1}
                max={100}
                value={editCapacity}
                onChange={(e) => onEditCapacityChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Location</label>
              <input
                type="text"
                value={editLocation}
                onChange={(e) => onEditLocationChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Status</label>
              <select
                value={editStatus}
                onChange={(e) => onEditStatusChange(e.target.value as RestaurantTableStatus)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              >
                {TABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={onSaveEdits}
            disabled={actionStatus === 'loading'}
            className="text-xs font-semibold px-3 py-2 rounded-lg"
            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>{label}</p>
      <p className="text-sm font-medium truncate" style={{ color: 'var(--p-text-1)' }}>{value}</p>
    </div>
  );
}
