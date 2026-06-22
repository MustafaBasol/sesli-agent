'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import {
  confirmReservationRequest,
  getReservationRequestDetail,
  listReservationRequests,
  rejectReservationRequest,
  updateReservationRequest,
  RESERVATION_REQUEST_STATUSES,
  type BackendLoginResponse,
  type ReservationRequestDetail,
  type ReservationRequestListItem,
  type ReservationRequestListResponse,
  type ReservationRequestStatus,
} from '@/lib/backend-endpoints';
import { LoginCard, RestaurantPicker } from '../BackendAdminBetaClient';
import BackendAdminNav from '../BackendAdminNav';

type Status = 'idle' | 'loading' | 'error';

const STATUS_BADGE: Record<ReservationRequestStatus, string> = {
  new: 'badge-blue',
  pending_info: 'badge-amber',
  confirmed: 'badge-green',
  rejected: 'badge-red',
  cancelled: 'badge-gray',
  done: 'badge-purple',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status as ReservationRequestStatus] ?? 'badge-gray';
  return <span className={`badge ${cls}`}>{status.replace('_', ' ')}</span>;
}

export default function ReservationRequestsClient() {
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [listStatus, setListStatus] = useState<Status>('idle');
  const [listError, setListError] = useState('');
  const [listResult, setListResult] = useState<ReservationRequestListResponse | null>(null);

  const selectedRequestId = searchParams.get('requestId') ?? '';
  const [detailStatus, setDetailStatus] = useState<Status>('idle');
  const [detailError, setDetailError] = useState('');
  const [detail, setDetail] = useState<ReservationRequestDetail | null>(null);

  const [actionStatus, setActionStatus] = useState<Status>('idle');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const [editNote, setEditNote] = useState('');
  const [editPartySize, setEditPartySize] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editSpecialRequest, setEditSpecialRequest] = useState('');

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
    listReservationRequests(restaurantId, session.token, {
      status: (statusFilter as ReservationRequestStatus) || undefined,
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
        setListError(err instanceof BackendApiError ? err.message : 'Failed to load reservation requests');
        setListStatus('error');
      });
  }, [session, restaurantId, statusFilter, searchInput, dateFrom, dateTo, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(() => {
    if (!session || !restaurantId || !selectedRequestId) {
      setDetail(null);
      return;
    }
    setDetailStatus('loading');
    setDetailError('');
    getReservationRequestDetail(restaurantId, session.token, selectedRequestId)
      .then((result) => {
        setDetail(result);
        setEditNote(result.internalNote ?? '');
        setEditPartySize(result.partySize ? String(result.partySize) : '');
        setEditDate(result.reservationDate ? result.reservationDate.slice(0, 10) : '');
        setEditTime(result.reservationTime ?? '');
        setEditSpecialRequest(result.specialRequest ?? '');
        setDetailStatus('idle');
      })
      .catch((err) => {
        setDetailError(err instanceof BackendApiError ? err.message : 'Failed to load reservation request');
        setDetailStatus('error');
      });
  }, [session, restaurantId, selectedRequestId]);

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
    params.set('requestId', id);
    router.push(`?${params.toString()}`);
  };

  const closeDetail = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('requestId');
    const query = params.toString();
    router.push(query ? `?${query}` : '?');
  };

  const refreshAll = () => {
    loadList();
    loadDetail();
  };

  const runAction = async (fn: () => Promise<unknown>, successMessage: string) => {
    setActionStatus('loading');
    setActionError('');
    setActionMessage('');
    try {
      await fn();
      setActionStatus('idle');
      setActionMessage(successMessage);
      refreshAll();
    } catch (err) {
      setActionError(err instanceof BackendApiError ? err.message : 'Action failed');
      setActionStatus('error');
    }
  };

  const handleConfirm = () => {
    if (!session || !detail) return;
    void runAction(() => confirmReservationRequest(restaurantId, session.token, detail.id), 'Reservation request confirmed.');
  };

  const handleReject = () => {
    if (!session || !detail) return;
    void runAction(() => rejectReservationRequest(restaurantId, session.token, detail.id), 'Reservation request rejected.');
  };

  const handleSaveEdits = () => {
    if (!session || !detail) return;
    void runAction(
      () =>
        updateReservationRequest(restaurantId, session.token, detail.id, {
          internalNote: editNote || null,
          partySize: editPartySize ? Number(editPartySize) : undefined,
          reservationDate: editDate || undefined,
          reservationTime: editTime || undefined,
          specialRequest: editSpecialRequest || null,
        }),
      'Reservation request updated.'
    );
  };

  if (!bootstrapped) return null;

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--p-bg)' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="page-label">Beta</p>
            <h2 className="page-title">Reservation Requests (Beta)</h2>
            <p className="page-subtitle">
              Reservation requests from the new backend API. Separate from the production Supabase admin.
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
                status={listStatus}
                error={listError}
                result={listResult}
                selectedRequestId={selectedRequestId}
                onSelect={openDetail}
                onPageChange={setPage}
              />
            </div>
            <div className="lg:col-span-2">
              {selectedRequestId ? (
                <DetailPanel
                  status={detailStatus}
                  error={detailError}
                  detail={detail}
                  onClose={closeDetail}
                  actionStatus={actionStatus}
                  actionError={actionError}
                  actionMessage={actionMessage}
                  onConfirm={handleConfirm}
                  onReject={handleReject}
                  editNote={editNote}
                  onEditNoteChange={setEditNote}
                  editPartySize={editPartySize}
                  onEditPartySizeChange={setEditPartySize}
                  editDate={editDate}
                  onEditDateChange={setEditDate}
                  editTime={editTime}
                  onEditTimeChange={setEditTime}
                  editSpecialRequest={editSpecialRequest}
                  onEditSpecialRequestChange={setEditSpecialRequest}
                  onSaveEdits={handleSaveEdits}
                />
              ) : (
                <div className="card p-8 text-center">
                  <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>
                    Select a reservation request to view details.
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
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onApply,
  onRefresh,
}: {
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
          Status
        </label>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        >
          <option value="">All</option>
          {RESERVATION_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
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
          placeholder="Name or phone"
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onApply()}
          className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          From
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
          To
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
        Apply
      </button>
      <button
        onClick={onRefresh}
        className="text-xs font-semibold px-3 py-2 rounded-lg"
        style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
      >
        Refresh
      </button>
    </div>
  );
}

function ListPanel({
  status,
  error,
  result,
  selectedRequestId,
  onSelect,
  onPageChange,
}: {
  status: Status;
  error: string;
  result: ReservationRequestListResponse | null;
  selectedRequestId: string;
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
          Failed to load reservation requests
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
      </div>
    );
  }

  if (!result || result.data.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No reservation requests found.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="divide-y" style={{ borderColor: 'var(--p-border-2)' }}>
        {result.data.map((item) => (
          <ListRow key={item.id} item={item} isSelected={item.id === selectedRequestId} onSelect={onSelect} />
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
  item: ReservationRequestListItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const customerLabel = item.customer?.fullName || item.customerName || item.phoneNumber || 'Guest';

  return (
    <button
      onClick={() => onSelect(item.id)}
      className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left"
      style={isSelected ? { background: 'var(--p-subtle)' } : undefined}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>{customerLabel}</p>
        <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
          {item.reservationDate ? item.reservationDate.slice(0, 10) : '—'} · {item.reservationTime ?? '—'} ·{' '}
          {item.partySize ?? '—'} pax · {item.channel}
          {item.provider ? ` (${item.provider})` : ''}
        </p>
        {item.specialRequest && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--p-text-5)' }}>{item.specialRequest}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={item.status} />
        <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>
          {new Date(item.createdAt).toLocaleString()}
        </span>
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
  onConfirm,
  onReject,
  editNote,
  onEditNoteChange,
  editPartySize,
  onEditPartySizeChange,
  editDate,
  onEditDateChange,
  editTime,
  onEditTimeChange,
  editSpecialRequest,
  onEditSpecialRequestChange,
  onSaveEdits,
}: {
  status: Status;
  error: string;
  detail: ReservationRequestDetail | null;
  onClose: () => void;
  actionStatus: Status;
  actionError: string;
  actionMessage: string;
  onConfirm: () => void;
  onReject: () => void;
  editNote: string;
  onEditNoteChange: (value: string) => void;
  editPartySize: string;
  onEditPartySizeChange: (value: string) => void;
  editDate: string;
  onEditDateChange: (value: string) => void;
  editTime: string;
  onEditTimeChange: (value: string) => void;
  editSpecialRequest: string;
  onEditSpecialRequestChange: (value: string) => void;
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
          Failed to load reservation request
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
        <button onClick={onClose} className="text-xs font-semibold mt-3" style={{ color: 'var(--p-accent-text)' }}>
          Close
        </button>
      </div>
    );
  }

  const isTerminal = ['rejected', 'cancelled', 'done'].includes(detail.status);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-header-title">Reservation request</h3>
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
          <Field label="Customer" value={detail.customer?.fullName || detail.customerName || '—'} />
          <Field label="Phone" value={detail.customer?.phoneNumber || detail.phoneNumber || '—'} />
          <Field label="Channel" value={`${detail.channel}${detail.provider ? ` (${detail.provider})` : ''}`} />
          <Field label="Created" value={new Date(detail.createdAt).toLocaleString()} />
        </div>

        {detail.conversation && (
          <div className="text-xs" style={{ color: 'var(--p-text-4)' }}>
            Conversation: {detail.conversation.status} · {detail.messages.length} message
            {detail.messages.length === 1 ? '' : 's'}
          </div>
        )}

        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            Edit safe fields
          </p>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div>
            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Special request</label>
            <textarea
              value={editSpecialRequest}
              onChange={(e) => onEditSpecialRequestChange(e.target.value)}
              rows={2}
              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            />
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
          <button
            onClick={onSaveEdits}
            disabled={actionStatus === 'loading'}
            className="text-xs font-semibold px-3 py-2 rounded-lg"
            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
          >
            Save changes
          </button>
        </div>

        {!isTerminal && (
          <div className="flex gap-2 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
            <button onClick={onConfirm} disabled={actionStatus === 'loading'} className="btn-primary flex-1 justify-center">
              Confirm
            </button>
            <button
              onClick={onReject}
              disabled={actionStatus === 'loading'}
              className="flex-1 justify-center text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ border: '1px solid var(--p-border)', color: '#b91c1c' }}
            >
              Reject
            </button>
          </div>
        )}
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
