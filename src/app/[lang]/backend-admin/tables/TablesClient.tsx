'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
import BackendAdminShell, { type BackendAdminShellCtx } from '../BackendAdminShell';
import { formatBackendAdminStatus, getBackendAdminDict, getBackendAdminUi } from '../locale';

type Status = 'idle' | 'loading' | 'error';

function StatusBadge({ status }: { status: string }) {
  const params = useParams();
  const cls = status === 'active' ? 'badge-green' : 'badge-gray';
  return <span className={`badge ${cls}`}>{formatBackendAdminStatus(params.lang, status)}</span>;
}

export default function TablesClient() {
  const params = useParams();
  const t = getBackendAdminDict(params.lang).tables;

  return (
    <BackendAdminShell
      label={t.label}
      title={t.title}
      subtitle={t.subtitle}
      contentClass="max-w-7xl mx-auto space-y-6"
    >
      {(ctx) => <TablesContent {...ctx} />}
    </BackendAdminShell>
  );
}

function TablesContent({ session, restaurantId }: BackendAdminShellCtx) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const t = getBackendAdminDict(params.lang);
  const ui = getBackendAdminUi(params.lang);

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
        setListError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadTables);
        setListStatus('error');
      });
  }, [session, restaurantId, statusFilter, searchInput, page, ui]);

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
        setDetailError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadTable);
        setDetailStatus('error');
      });
  }, [session, restaurantId, selectedTableId, ui]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail();
  }, [loadDetail]);

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
      setActionMessage(ui.messages.tableUpdated);
      refreshAll();
    } catch (err) {
      setActionError(err instanceof BackendApiError ? err.message : ui.messages.updateFailed);
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
      setCreateActionError(err instanceof BackendApiError ? err.message : ui.messages.createFailed);
      setCreateActionStatus('error');
    }
  };

  return (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 space-y-4">
              <Filters
                t={t}
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
                t={t}
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
                  t={t}
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
                <div className="card ba-empty">
                  <div className="ba-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--p-text-3)' }}>
                    {t.tables.selectPrompt}
                  </p>
                </div>
              )}
            </div>
          </div>
  );
}

function Filters({
  t,
  statusFilter,
  onStatusFilterChange,
  searchInput,
  onSearchInputChange,
  onApply,
  onRefresh,
  onAddTable,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onApply: () => void;
  onRefresh: () => void;
  onAddTable: () => void;
}) {
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
  const inputStyle = {
    background: 'var(--p-subtle)',
    border: '1px solid var(--p-border)',
    color: 'var(--p-text-1)',
  };

  return (
    <div className="card p-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          {t.common.status}
        </label>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        >
          <option value="">{t.common.all}</option>
          {TABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatBackendAdminStatus(params.lang, s)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          {t.common.search}
        </label>
        <input
          type="text"
          placeholder={ui.labels.tableSearchPlaceholder}
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onApply()}
          className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        />
      </div>
      <button onClick={onApply} className="btn-primary">
        {t.common.apply}
      </button>
      <button
        onClick={onRefresh}
        className="text-xs font-semibold px-3 py-2 rounded-lg"
        style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
      >
        {t.common.refresh}
      </button>
      <button
        onClick={onAddTable}
        className="text-xs font-semibold px-3 py-2 rounded-lg ml-auto"
        style={{ background: 'var(--p-accent)', color: 'var(--p-accent-contrast, #fff)' }}
      >
        {t.tables.addTable}
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
  const params = useParams();
  const t = getBackendAdminDict(params.lang);
  const ui = getBackendAdminUi(params.lang);
  const inputStyle = {
    background: 'var(--p-subtle)',
    border: '1px solid var(--p-border)',
    color: 'var(--p-text-1)',
  };

  return (
    <div className="card p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
        {ui.labels.newTable}
      </p>
      {actionStatus === 'error' && (
        <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{actionError}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.tableNumber}</label>
          <input
            type="text"
            value={tableNumber}
            onChange={(e) => onTableNumberChange(e.target.value)}
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.capacity}</label>
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
          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.location}</label>
          <input
            type="text"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{t.common.status}</label>
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as RestaurantTableStatus)}
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
            style={inputStyle}
          >
            {TABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {formatBackendAdminStatus(params.lang, s)}
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
          {ui.labels.saveTable}
        </button>
        <button
          onClick={onCancel}
          className="text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
        >
          {ui.labels.cancel}
        </button>
      </div>
    </div>
  );
}

function ListPanel({
  t,
  status,
  error,
  result,
  selectedTableId,
  onSelect,
  onPageChange,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  status: Status;
  error: string;
  result: RestaurantTableListResponse | null;
  selectedTableId: string;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
}) {
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
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
          {ui.messages.failedToLoadTables}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
      </div>
    );
  }

  if (!result || result.data.length === 0) {
    return (
      <div className="card ba-empty">
        <div className="ba-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--p-text-2)' }}>{t.tables.emptyTitle}</p>
        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>{t.tables.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="ba-divide">
        {result.data.map((item) => (
          <ListRow key={item.id} t={t} item={item} isSelected={item.id === selectedTableId} onSelect={onSelect} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>
          {ui.labels.pageOfTotal(result.pagination.page, result.pagination.totalPages, result.pagination.total)}
        </p>
        <div className="flex gap-2">
          <button
            disabled={result.pagination.page <= 1}
            onClick={() => onPageChange(result.pagination.page - 1)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-40"
            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
          >
            {t.common.prev}
          </button>
          <button
            disabled={result.pagination.page >= result.pagination.totalPages}
            onClick={() => onPageChange(result.pagination.page + 1)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-40"
            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
          >
            {t.common.next}
          </button>
        </div>
      </div>
    </div>
  );
}

function ListRow({
  t,
  item,
  isSelected,
  onSelect,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  item: RestaurantTableListItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={`ba-row text-left ${isSelected ? 'ba-row-selected' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>
          {ui.labels.tablePrefix} {item.tableNumber}
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
          {item.capacity} {t.common.pax}{item.location ? ` · ${item.location}` : ''}
          {item.upcomingReservationCount > 0 ? ` · ${item.upcomingReservationCount} ${ui.labels.upcoming}` : ''}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={item.status} />
      </div>
    </button>
  );
}

function DetailPanel({
  t,
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
  t: ReturnType<typeof getBackendAdminDict>;
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
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
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
          {ui.messages.failedToLoadTable}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
        <button onClick={onClose} className="text-xs font-semibold mt-3" style={{ color: 'var(--p-accent-text)' }}>
          {t.common.close}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-header-title">{ui.labels.tablePrefix} {detail.tableNumber}</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--p-text-5)' }}>{detail.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={detail.status} />
          <button onClick={onClose} className="text-xs font-semibold" style={{ color: 'var(--p-accent-text)' }}>
            {t.common.close}
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
          <Field label={ui.labels.capacity} value={`${detail.capacity} ${t.common.pax}`} />
          <Field label={ui.labels.location} value={detail.location || '—'} />
          <Field label={ui.labels.created} value={new Date(detail.createdAt).toLocaleString()} />
          <Field label={ui.labels.updated} value={new Date(detail.updatedAt).toLocaleString()} />
        </div>

        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            {ui.labels.upcomingReservations} ({detail.upcomingReservationCount})
          </p>
          {detail.upcomingReservations.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>{ui.labels.noUpcomingReservations}</p>
          ) : (
            <div className="space-y-1.5">
              {detail.upcomingReservations.map((r) => (
                <div key={r.id} className="text-xs flex items-center justify-between gap-2" style={{ color: 'var(--p-text-3)' }}>
                  <span className="truncate">{r.customerName || t.common.guest} · {r.partySize} {t.common.pax}</span>
                  <span className="shrink-0">{r.reservationDate.slice(0, 10)} {r.reservationTime}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            {ui.labels.editTable}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.tableNumber}</label>
              <input
                type="text"
                value={editTableNumber}
                onChange={(e) => onEditTableNumberChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.capacity}</label>
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
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.location}</label>
              <input
                type="text"
                value={editLocation}
                onChange={(e) => onEditLocationChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{t.common.status}</label>
              <select
                value={editStatus}
                onChange={(e) => onEditStatusChange(e.target.value as RestaurantTableStatus)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              >
                {TABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {formatBackendAdminStatus(params.lang, s)}
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
            {t.common.save}
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
