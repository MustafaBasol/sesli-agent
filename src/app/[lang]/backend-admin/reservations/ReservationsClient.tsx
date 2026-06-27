'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BackendApiError } from '@/lib/backend-api';
import {
  getReservationDetail,
  listReservations,
  listTables,
  updateReservation,
  RESERVATION_STATUSES,
  type BackendLoginResponse,
  type ReservationDetail,
  type ReservationListItem,
  type ReservationListResponse,
  type ReservationStatus,
  type RestaurantTableListItem,
} from '@/lib/backend-endpoints';
import BackendAdminShell, { type BackendAdminShellCtx } from '../BackendAdminShell';
import {
  formatBackendAdminChannel,
  formatBackendAdminStatus,
  getBackendAdminDict,
  getBackendAdminUi,
} from '../locale';

type Status = 'idle' | 'loading' | 'error';

const STATUS_BADGE: Record<ReservationStatus, string> = {
  pending: 'badge-amber',
  confirmed: 'badge-green',
  cancelled: 'badge-red',
  no_show: 'badge-gray',
  completed: 'badge-purple',
};

function StatusBadge({ status, lang }: { status: string; lang: unknown }) {
  const cls = STATUS_BADGE[status as ReservationStatus] ?? 'badge-gray';
  return <span className={`badge ${cls}`}>{formatBackendAdminStatus(lang, status)}</span>;
}

export default function ReservationsClient() {
  const params = useParams();
  const t = getBackendAdminDict(params.lang).reservations;

  return (
    <BackendAdminShell
      label={t.label}
      title={t.title}
      subtitle={t.subtitle}
      contentClass="max-w-7xl mx-auto space-y-6"
    >
      {(ctx) => <ReservationsContent {...ctx} />}
    </BackendAdminShell>
  );
}

function ReservationsContent({ session, restaurantId }: BackendAdminShellCtx) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const t = getBackendAdminDict(params.lang);
  const ui = getBackendAdminUi(params.lang);

  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [listStatus, setListStatus] = useState<Status>('idle');
  const [listError, setListError] = useState('');
  const [listResult, setListResult] = useState<ReservationListResponse | null>(null);

  const selectedReservationId = searchParams.get('reservationId') ?? '';
  const [detailStatus, setDetailStatus] = useState<Status>('idle');
  const [detailError, setDetailError] = useState('');
  const [detail, setDetail] = useState<ReservationDetail | null>(null);

  const [actionStatus, setActionStatus] = useState<Status>('idle');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const [editStatus, setEditStatus] = useState<ReservationStatus>('confirmed');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editPartySize, setEditPartySize] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editAssignedTableId, setEditAssignedTableId] = useState('');

  const [tables, setTables] = useState<RestaurantTableListItem[]>([]);

  const loadList = useCallback(() => {
    if (!session || !restaurantId) return;
    setListStatus('loading');
    setListError('');
    listReservations(restaurantId, session.token, {
      status: (statusFilter as ReservationStatus) || undefined,
      search: searchInput || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize: 20,
    })
      .then((result) => {
        setListResult(result);
        setListStatus('idle');
      })
      .catch((err) => {
        setListError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadReservations);
        setListStatus('error');
      });
  }, [session, restaurantId, statusFilter, searchInput, dateFrom, dateTo, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, [loadList]);

  const loadTables = useCallback(() => {
    if (!session || !restaurantId) return;
    listTables(restaurantId, session.token, { pageSize: 100 })
      .then((result) => setTables(result.data))
      .catch(() => setTables([]));
  }, [session, restaurantId]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const loadDetail = useCallback(() => {
    if (!session || !restaurantId || !selectedReservationId) {
      setDetail(null);
      return;
    }
    setDetailStatus('loading');
    setDetailError('');
    getReservationDetail(restaurantId, session.token, selectedReservationId)
      .then((result) => {
        setDetail(result);
        setEditStatus(result.status);
        setEditDate(result.reservationDate.slice(0, 10));
        setEditTime(result.reservationTime);
        setEditPartySize(String(result.partySize));
        setEditNote(result.internalNote ?? '');
        setEditAssignedTableId(result.assignedTableId ?? '');
        setDetailStatus('idle');
      })
      .catch((err) => {
        setDetailError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadReservation);
        setDetailStatus('error');
      });
  }, [session, restaurantId, selectedReservationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail();
  }, [loadDetail]);

  const openDetail = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('reservationId', id);
    router.push(`?${params.toString()}`);
  };

  const closeDetail = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('reservationId');
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
      await updateReservation(restaurantId, session.token, detail.id, {
        status: editStatus,
        reservationDate: editDate || undefined,
        reservationTime: editTime || undefined,
        partySize: editPartySize ? Number(editPartySize) : undefined,
        internalNote: editNote || null,
        assignedTableId: editAssignedTableId || null,
      });
      setActionStatus('idle');
      setActionMessage(ui.messages.reservationUpdated);
      refreshAll();
    } catch (err) {
      setActionError(err instanceof BackendApiError ? err.message : ui.messages.updateFailed);
      setActionStatus('error');
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
                dateFrom={dateFrom}
                onDateFromChange={setDateFrom}
                dateTo={dateTo}
                onDateToChange={setDateTo}
                onApply={() => {
                  setPage(1);
                  loadList();
                }}
                onRefresh={loadList}
              />
              <ListPanel
                t={t}
                status={listStatus}
                error={listError}
                result={listResult}
                selectedReservationId={selectedReservationId}
                onSelect={openDetail}
                onPageChange={setPage}
              />
            </div>
            <div className="lg:col-span-2">
              {selectedReservationId ? (
                <DetailPanel
                  t={t}
                  status={detailStatus}
                  error={detailError}
                  detail={detail}
                  onClose={closeDetail}
                  actionStatus={actionStatus}
                  actionError={actionError}
                  actionMessage={actionMessage}
                  editStatus={editStatus}
                  onEditStatusChange={setEditStatus}
                  editDate={editDate}
                  onEditDateChange={setEditDate}
                  editTime={editTime}
                  onEditTimeChange={setEditTime}
                  editPartySize={editPartySize}
                  onEditPartySizeChange={setEditPartySize}
                  editNote={editNote}
                  onEditNoteChange={setEditNote}
                  tables={tables}
                  editAssignedTableId={editAssignedTableId}
                  onEditAssignedTableIdChange={setEditAssignedTableId}
                  onSaveEdits={handleSaveEdits}
                />
              ) : (
                <div className="card ba-empty">
                  <div className="ba-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--p-text-3)' }}>
                    {t.reservations.selectPrompt}
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
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onApply,
  onRefresh,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  onApply: () => void;
  onRefresh: () => void;
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
          {t.common.status}
        </label>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        >
          <option value="">{t.common.all}</option>
          {RESERVATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
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
          placeholder="Customer name or phone"
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onApply()}
          className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          {t.common.from}
        </label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          {t.common.to}
        </label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        />
      </div>
      <button onClick={onApply} className="btn-primary">
        {t.common.apply}
      </button>
      <button onClick={onRefresh} className="btn-ghost">
        {t.common.refresh}
      </button>
    </div>
  );
}

function ListPanel({
  t,
  status,
  error,
  result,
  selectedReservationId,
  onSelect,
  onPageChange,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  status: Status;
  error: string;
  result: ReservationListResponse | null;
  selectedReservationId: string;
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
          Failed to load reservations
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
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--p-text-2)' }}>{t.reservations.emptyTitle}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="ba-divide">
        {result.data.map((item) => (
          <ListRow key={item.id} t={t} item={item} isSelected={item.id === selectedReservationId} onSelect={onSelect} />
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
  item: ReservationListItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const params = useParams();
  const customerLabel = item.customerName || item.phoneNumber || t.common.guest;

  return (
    <button
      onClick={() => onSelect(item.id)}
      className={`ba-row text-left ${isSelected ? 'ba-row-selected' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>{customerLabel}</p>
        <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
          {item.reservationDate.slice(0, 10)} · {item.reservationTime} · {item.partySize} {t.common.pax} · {item.sourceChannel}
          {item.tableName ? ` · Table ${item.tableName}` : ''}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={item.status} lang={params.lang} />
        <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>
          {new Date(item.createdAt).toLocaleString()}
        </span>
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
  editStatus,
  onEditStatusChange,
  editDate,
  onEditDateChange,
  editTime,
  onEditTimeChange,
  editPartySize,
  onEditPartySizeChange,
  editNote,
  onEditNoteChange,
  tables,
  editAssignedTableId,
  onEditAssignedTableIdChange,
  onSaveEdits,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  status: Status;
  error: string;
  detail: ReservationDetail | null;
  onClose: () => void;
  actionStatus: Status;
  actionError: string;
  actionMessage: string;
  editStatus: ReservationStatus;
  onEditStatusChange: (value: ReservationStatus) => void;
  editDate: string;
  onEditDateChange: (value: string) => void;
  editTime: string;
  onEditTimeChange: (value: string) => void;
  editPartySize: string;
  onEditPartySizeChange: (value: string) => void;
  editNote: string;
  onEditNoteChange: (value: string) => void;
  tables: RestaurantTableListItem[];
  editAssignedTableId: string;
  onEditAssignedTableIdChange: (value: string) => void;
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
          {ui.messages.failedToLoadReservation}
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
          <h3 className="card-header-title">Reservation</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--p-text-5)' }}>{detail.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={detail.status} lang={params.lang} />
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
          <CustomerField customerId={detail.customerId} value={detail.customer?.fullName || '—'} />
          <Field label="Phone" value={detail.customer?.phoneNumber || '—'} />
          <Field label="Source" value={detail.sourceChannel} />
          <Field label="Table" value={detail.table ? `${detail.table.tableNumber} (${detail.table.capacity} pax)` : '—'} />
          <Field label="Created" value={new Date(detail.createdAt).toLocaleString()} />
          <Field label="Updated" value={new Date(detail.updatedAt).toLocaleString()} />
        </div>

        {detail.reservationRequest && (
          <ReservationRequestSummaryLink
            requestId={detail.reservationRequest.id}
            status={detail.reservationRequest.status}
            specialRequest={detail.reservationRequest.specialRequest}
          />
        )}

        {detail.conversation && (
          <ConversationSummaryLink conversationId={detail.conversation.id} status={detail.conversation.status} />
        )}

        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            {t.common.editSafeFields}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Status</label>
              <select
                value={editStatus}
                onChange={(e) => onEditStatusChange(e.target.value as ReservationStatus)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              >
                {RESERVATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Party size</label>
              <input
                type="number"
                min={1}
                max={100}
                value={editPartySize}
                onChange={(e) => onEditPartySizeChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Date</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => onEditDateChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Time</label>
              <input
                type="time"
                value={editTime}
                onChange={(e) => onEditTimeChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Internal note</label>
            <textarea
              value={editNote}
              onChange={(e) => onEditNoteChange(e.target.value)}
              rows={2}
              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Table</label>
            <select
              value={editAssignedTableId}
              onChange={(e) => onEditAssignedTableIdChange(e.target.value)}
              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            >
              <option value="">Unassigned</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  Table {t.tableNumber} ({t.capacity} pax{t.location ? `, ${t.location}` : ''})
                </option>
              ))}
            </select>
          </div>
          <button onClick={onSaveEdits} disabled={actionStatus === 'loading'} className="btn-ghost">
            {actionStatus === 'loading' ? t.common.saving : t.common.save}
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

function CustomerField({ customerId, value }: { customerId: string | null; value: string }) {
  const params = useParams();
  const lang = typeof params.lang === 'string' ? params.lang : 'en';

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>Customer</p>
      {customerId ? (
        <Link
          href={`/${lang}/backend-admin/customers?customerId=${customerId}`}
          className="text-sm font-medium truncate block"
          style={{ color: 'var(--p-accent-text)' }}
        >
          {value}
        </Link>
      ) : (
        <p className="text-sm font-medium truncate" style={{ color: 'var(--p-text-1)' }}>{value}</p>
      )}
    </div>
  );
}

function ReservationRequestSummaryLink({
  requestId,
  status,
  specialRequest,
}: {
  requestId: string;
  status: string;
  specialRequest: string | null;
}) {
  const params = useParams();
  const lang = typeof params.lang === 'string' ? params.lang : 'en';

  return (
    <div className="space-y-1">
      <Link
        href={`/${lang}/backend-admin/reservation-requests?requestId=${requestId}`}
        className="text-xs block"
        style={{ color: 'var(--p-accent-text)' }}
      >
        Originating request: {status.replace('_', ' ')}
      </Link>
      {specialRequest && (
        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>Special request: {specialRequest}</p>
      )}
    </div>
  );
}

function ConversationSummaryLink({ conversationId, status }: { conversationId: string; status: string }) {
  const params = useParams();
  const lang = typeof params.lang === 'string' ? params.lang : 'en';

  return (
    <Link
      href={`/${lang}/backend-admin/conversations?conversationId=${conversationId}`}
      className="text-xs block"
      style={{ color: 'var(--p-accent-text)' }}
    >
      Conversation: {status}
    </Link>
  );
}
