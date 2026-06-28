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
  getCustomerDetail,
  listCustomers,
  updateCustomer,
  type BackendLoginResponse,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerListResponse,
} from '@/lib/backend-endpoints';

type Status = 'idle' | 'loading' | 'error';

export default function CustomersClient() {
  const params = useParams();
  const t = getBackendAdminDict(params.lang).customers;

  return (
    <BackendAdminShell label={t.label} title={t.title} subtitle={t.subtitle}>
      {({ session, restaurantId }) => <CustomersContent session={session} restaurantId={restaurantId} />}
    </BackendAdminShell>
  );
}

function CustomersContent({ session, restaurantId }: { session: BackendLoginResponse; restaurantId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const t = getBackendAdminDict(params.lang);
  const ui = getBackendAdminUi(params.lang);

  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const [listStatus, setListStatus] = useState<Status>('idle');
  const [listError, setListError] = useState('');
  const [listResult, setListResult] = useState<CustomerListResponse | null>(null);

  const selectedCustomerId = searchParams.get('customerId') ?? '';
  const [detailStatus, setDetailStatus] = useState<Status>('idle');
  const [detailError, setDetailError] = useState('');
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  const [actionStatus, setActionStatus] = useState<Status>('idle');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const loadList = useCallback(() => {
    setListStatus('loading');
    setListError('');
    listCustomers(restaurantId, session.token, {
      search: searchInput || undefined,
      page,
      pageSize: 20,
    })
      .then((result) => {
        setListResult(result);
        setListStatus('idle');
      })
      .catch((err) => {
        setListError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadCustomers);
        setListStatus('error');
      });
  }, [session, restaurantId, searchInput, page, ui]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(() => {
    if (!session || !restaurantId || !selectedCustomerId) {
      setDetail(null);
      return;
    }
    setDetailStatus('loading');
    setDetailError('');
    getCustomerDetail(restaurantId, session.token, selectedCustomerId)
      .then((result) => {
        setDetail(result);
        setEditFullName(result.fullName ?? '');
        setEditPhoneNumber(result.phoneNumber ?? '');
        setEditEmail(result.email ?? '');
        setEditNotes(result.notes ?? '');
        setDetailStatus('idle');
      })
      .catch((err) => {
        setDetailError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadCustomer);
        setDetailStatus('error');
      });
  }, [session, restaurantId, selectedCustomerId, ui]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail();
  }, [loadDetail]);

  const openDetail = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('customerId', id);
    router.push(`?${params.toString()}`);
  };

  const closeDetail = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('customerId');
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
      await updateCustomer(restaurantId, session.token, detail.id, {
        fullName: editFullName.trim() ? editFullName.trim() : null,
        phoneNumber: editPhoneNumber.trim() ? editPhoneNumber.trim() : null,
        email: editEmail.trim() ? editEmail.trim() : null,
        notes: editNotes.trim() ? editNotes.trim() : null,
      });
      setActionStatus('idle');
      setActionMessage(ui.messages.customerUpdated);
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
                searchInput={searchInput}
                onSearchInputChange={setSearchInput}
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
                selectedCustomerId={selectedCustomerId}
                onSelect={openDetail}
                onPageChange={setPage}
              />
            </div>
            <div className="lg:col-span-2">
              {selectedCustomerId ? (
                <DetailPanel
                  t={t}
                  status={detailStatus}
                  error={detailError}
                  detail={detail}
                  onClose={closeDetail}
                  actionStatus={actionStatus}
                  actionError={actionError}
                  actionMessage={actionMessage}
                  editFullName={editFullName}
                  onEditFullNameChange={setEditFullName}
                  editPhoneNumber={editPhoneNumber}
                  onEditPhoneNumberChange={setEditPhoneNumber}
                  editEmail={editEmail}
                  onEditEmailChange={setEditEmail}
                  editNotes={editNotes}
                  onEditNotesChange={setEditNotes}
                  onSaveEdits={handleSaveEdits}
                />
              ) : (
                <div className="card ba-empty">
                  <div className="ba-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--p-text-3)' }}>
                    {t.customers.selectPrompt}
                  </p>
                </div>
              )}
            </div>
          </div>
  );
}

function Filters({
  t,
  searchInput,
  onSearchInputChange,
  onApply,
  onRefresh,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
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
      <div className="flex-1 min-w-[160px]">
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          {t.common.search}
        </label>
        <input
          type="text"
          placeholder={t.customers.searchPlaceholder}
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
    </div>
  );
}

function ListPanel({
  t,
  status,
  error,
  result,
  selectedCustomerId,
  onSelect,
  onPageChange,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  status: Status;
  error: string;
  result: CustomerListResponse | null;
  selectedCustomerId: string;
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
          {ui.messages.failedToLoadCustomers}
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
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--p-text-2)' }}>{t.customers.emptyTitle}</p>
        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>{t.customers.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="ba-divide">
        {result.data.map((item) => (
          <ListRow key={item.id} t={t} item={item} isSelected={item.id === selectedCustomerId} onSelect={onSelect} />
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
  item: CustomerListItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const label = item.fullName || item.phoneNumber || item.email || t.common.guest;
  const lastActivity = item.lastContactAt ?? item.lastVisitAt ?? item.createdAt;

  return (
    <button
      onClick={() => onSelect(item.id)}
      className={`ba-row text-left ${isSelected ? 'ba-row-selected' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>{label}</p>
        <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
          {item.phoneNumber ?? '—'}
          {item.email ? ` · ${item.email}` : ''}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="badge badge-blue">{item.reservationRequestCount}</span>
        <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>
          {lastActivity ? new Date(lastActivity).toLocaleString() : '—'}
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
  editFullName,
  onEditFullNameChange,
  editPhoneNumber,
  onEditPhoneNumberChange,
  editEmail,
  onEditEmailChange,
  editNotes,
  onEditNotesChange,
  onSaveEdits,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  status: Status;
  error: string;
  detail: CustomerDetail | null;
  onClose: () => void;
  actionStatus: Status;
  actionError: string;
  actionMessage: string;
  editFullName: string;
  onEditFullNameChange: (value: string) => void;
  editPhoneNumber: string;
  onEditPhoneNumberChange: (value: string) => void;
  editEmail: string;
  onEditEmailChange: (value: string) => void;
  editNotes: string;
  onEditNotesChange: (value: string) => void;
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
          {ui.messages.failedToLoadCustomer}
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
          <h3 className="card-header-title">{t.customers.detailTitle}</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--p-text-5)' }}>{detail.id}</p>
        </div>
        <button onClick={onClose} className="text-xs font-semibold" style={{ color: 'var(--p-accent-text)' }}>
          {t.common.close}
        </button>
      </div>

      <div className="p-5 space-y-4">
        {actionMessage && (
          <p className="text-xs font-medium" style={{ color: '#15803d' }}>{actionMessage}</p>
        )}
        {actionStatus === 'error' && (
          <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{actionError}</p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label={ui.labels.totalReservations} value={String(detail.totalReservations)} />
          <Field label={ui.labels.lastVisit} value={detail.lastVisitAt ? new Date(detail.lastVisitAt).toLocaleString() : '—'} />
          <Field label={ui.labels.created} value={new Date(detail.createdAt).toLocaleString()} />
          <Field label={ui.labels.updated} value={new Date(detail.updatedAt).toLocaleString()} />
        </div>

        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            {t.common.editSafeFields}
          </p>
          <div>
            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.fullName}</label>
            <input
              type="text"
              value={editFullName}
              onChange={(e) => onEditFullNameChange(e.target.value)}
              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.phoneNumber}</label>
              <input
                type="text"
                value={editPhoneNumber}
                onChange={(e) => onEditPhoneNumberChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.email}</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => onEditEmailChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.notes}</label>
            <textarea
              value={editNotes}
              onChange={(e) => onEditNotesChange(e.target.value)}
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
            {t.common.save}
          </button>
        </div>

        {detail.reservationRequests.length > 0 && (
          <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              {t.customers.recentRequests}
            </p>
            <div className="space-y-1.5">
              {detail.reservationRequests.slice(0, 5).map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-2 text-xs">
                  <span style={{ color: 'var(--p-text-3)' }}>
                    {req.reservationDate ? req.reservationDate.slice(0, 10) : '—'} · {req.reservationTime ?? '—'} ·{' '}
                    {req.partySize ?? '—'} {t.common.pax}
                  </span>
                  <span className="badge badge-gray shrink-0">{formatBackendAdminStatus(params.lang, req.status)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {detail.conversations.length > 0 && (
          <RecentConversations t={t} conversations={detail.conversations} />
        )}
      </div>
    </div>
  );
}

function RecentConversations({
  t,
  conversations,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  conversations: CustomerDetail['conversations'];
}) {
  const params = useParams();
  const lang = typeof params.lang === 'string' ? params.lang : 'en';

  return (
    <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
        {t.customers.recentConversations}
      </p>
      <div className="space-y-1.5">
        {conversations.slice(0, 5).map((conv) => (
          <Link
            key={conv.id}
            href={`/${lang}/backend-admin/conversations?conversationId=${conv.id}`}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="truncate" style={{ color: 'var(--p-accent-text)' }}>
              {conv.lastMessagePreview || formatBackendAdminChannel(params.lang, conv.channel)}
            </span>
            <span className="badge badge-gray shrink-0">{formatBackendAdminStatus(params.lang, conv.status)}</span>
          </Link>
        ))}
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
