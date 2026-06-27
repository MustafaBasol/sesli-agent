'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BackendApiError } from '@/lib/backend-api';
import BackendAdminShell from '../BackendAdminShell';
import {
  formatBackendAdminChannel,
  formatBackendAdminStatus,
  getBackendAdminDict,
  getBackendAdminUi,
} from '../locale';
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

type Status = 'idle' | 'loading' | 'error';

const STATUS_BADGE: Record<ReservationRequestStatus, string> = {
  new: 'badge-blue',
  pending_info: 'badge-amber',
  confirmed: 'badge-green',
  rejected: 'badge-red',
  cancelled: 'badge-gray',
  done: 'badge-purple',
};

function StatusBadge({ status, lang }: { status: string; lang: unknown }) {
  const cls = STATUS_BADGE[status as ReservationRequestStatus] ?? 'badge-gray';
  return <span className={`badge ${cls}`}>{formatBackendAdminStatus(lang, status)}</span>;
}

export default function ReservationRequestsClient() {
  const params = useParams();
  const t = getBackendAdminDict(params.lang).reservationRequests;

  return (
    <BackendAdminShell label={t.label} title={t.title} subtitle={t.subtitle}>
      {({ session, restaurantId }) => (
        <ReservationRequestsContent session={session} restaurantId={restaurantId} />
      )}
    </BackendAdminShell>
  );
}

function ReservationRequestsContent({
  session,
  restaurantId,
}: {
  session: BackendLoginResponse;
  restaurantId: string;
}) {
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

  const loadList = useCallback(() => {
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
        setListError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadReservationRequests);
        setListStatus('error');
      });
  }, [session, restaurantId, statusFilter, searchInput, dateFrom, dateTo, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(() => {
    if (!selectedRequestId) {
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
        setDetailError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadReservationRequest);
        setDetailStatus('error');
      });
  }, [session, restaurantId, selectedRequestId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail();
  }, [loadDetail]);

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
      setActionError(err instanceof BackendApiError ? err.message : ui.messages.actionFailed);
      setActionStatus('error');
    }
  };

  const handleConfirm = () => {
    if (!detail) return;
    void runAction(() => confirmReservationRequest(restaurantId, session.token, detail.id), ui.messages.requestConfirmed);
  };

  const handleReject = () => {
    if (!detail) return;
    void runAction(() => rejectReservationRequest(restaurantId, session.token, detail.id), ui.messages.requestRejected);
  };

  const handleSaveEdits = () => {
    if (!detail) return;
    void runAction(
      () =>
        updateReservationRequest(restaurantId, session.token, detail.id, {
          internalNote: editNote || null,
          partySize: editPartySize ? Number(editPartySize) : undefined,
          reservationDate: editDate || undefined,
          reservationTime: editTime || undefined,
          specialRequest: editSpecialRequest || null,
        }),
      ui.messages.requestUpdated
    );
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
          selectedRequestId={selectedRequestId}
          onSelect={openDetail}
          onPageChange={setPage}
        />
      </div>
      <div className="lg:col-span-2">
        {selectedRequestId ? (
          <DetailPanel
            t={t}
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
          <div className="card ba-empty">
            <div className="ba-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--p-text-3)' }}>
              {t.reservationRequests.selectPrompt}
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
          {RESERVATION_REQUEST_STATUSES.map((s) => (
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
          placeholder={`${ui.labels.name} / ${ui.labels.phone}`}
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
  selectedRequestId,
  onSelect,
  onPageChange,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  status: Status;
  error: string;
  result: ReservationRequestListResponse | null;
  selectedRequestId: string;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
}) {
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
  if (status === 'loading') {
    return (
      <div className="card p-10 flex flex-col items-center justify-center gap-3">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--p-border)', borderTopColor: 'var(--p-accent)' }}
        />
        <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--p-text-5)' }}>
          Loading…
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>
          {ui.messages.failedToLoadReservationRequests}
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
            <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
          </svg>
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--p-text-2)' }}>{t.reservationRequests.emptyTitle}</p>
        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>{t.reservationRequests.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="ba-divide">
        {result.data.map((item) => (
          <ListRow key={item.id} t={t} item={item} isSelected={item.id === selectedRequestId} onSelect={onSelect} />
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
  item: ReservationRequestListItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const params = useParams();
  const customerLabel = item.customer?.fullName || item.customerName || item.phoneNumber || t.common.guest;

  return (
    <button
      onClick={() => onSelect(item.id)}
      className={`ba-row text-left ${isSelected ? 'ba-row-selected' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>{customerLabel}</p>
        <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
          {item.reservationDate ? item.reservationDate.slice(0, 10) : '—'} · {item.reservationTime ?? '—'} ·{' '}
          {item.partySize ?? '—'} {t.common.pax} · {formatBackendAdminChannel(params.lang, item.channel)}
          {item.provider ? ` (${item.provider})` : ''}
        </p>
        {item.specialRequest && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--p-text-5)' }}>{item.specialRequest}</p>
        )}
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
  t: ReturnType<typeof getBackendAdminDict>;
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
          {ui.messages.failedToLoadReservationRequest}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
        <button onClick={onClose} className="text-xs font-semibold mt-3" style={{ color: 'var(--p-accent-text)' }}>
          {t.common.close}
        </button>
      </div>
    );
  }

  const isTerminal = ['rejected', 'cancelled', 'done'].includes(detail.status);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-header-title">{getBackendAdminDict(params.lang).reservationRequests.title}</h3>
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
          <CustomerField
            customerId={detail.customerId}
            value={detail.customer?.fullName || detail.customerName || '—'}
          />
          <Field label={ui.labels.phone} value={detail.customer?.phoneNumber || detail.phoneNumber || '—'} />
          <Field label={ui.labels.channel} value={`${formatBackendAdminChannel(params.lang, detail.channel)}${detail.provider ? ` (${detail.provider})` : ''}`} />
          <Field label={ui.labels.created} value={new Date(detail.createdAt).toLocaleString()} />
        </div>

        {detail.conversation && (
          <ConversationSummary
            conversationId={detail.conversation.id}
            status={detail.conversation.status}
            messageCount={detail.messages.length}
          />
        )}

        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            {t.common.editSafeFields}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.date}</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => onEditDateChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.time}</label>
              <input
                type="time"
                value={editTime}
                onChange={(e) => onEditTimeChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.partySize}</label>
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
            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.specialRequest}</label>
            <textarea
              value={editSpecialRequest}
              onChange={(e) => onEditSpecialRequestChange(e.target.value)}
              rows={2}
              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.internalNote}</label>
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
            className="btn-ghost"
          >
            {t.common.save}
          </button>
        </div>

        {!isTerminal && (
          <div className="flex gap-2 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
            <button onClick={onConfirm} disabled={actionStatus === 'loading'} className="btn-primary flex-1 justify-center">
              {t.common.confirm}
            </button>
            <button
              onClick={onReject}
              disabled={actionStatus === 'loading'}
              className="btn-danger flex-1 justify-center"
            >
              {t.common.reject}
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

function ConversationSummary({
  conversationId,
  status,
  messageCount,
}: {
  conversationId: string;
  status: string;
  messageCount: number;
}) {
  const params = useParams();
  const lang = typeof params.lang === 'string' ? params.lang : 'en';

  return (
    <Link
      href={`/${lang}/backend-admin/conversations?conversationId=${conversationId}`}
      className="text-xs block"
      style={{ color: 'var(--p-accent-text)' }}
    >
      Conversation: {status} · {messageCount} message{messageCount === 1 ? '' : 's'}
    </Link>
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
