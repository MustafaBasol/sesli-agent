'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import {
  getCustomerDetail,
  listCustomers,
  updateCustomer,
  type BackendLoginResponse,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerListResponse,
} from '@/lib/backend-endpoints';
import { LoginCard, RestaurantPicker } from '../BackendAdminBetaClient';
import BackendAdminNav from '../BackendAdminNav';

type Status = 'idle' | 'loading' | 'error';

export default function CustomersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [session, setSession] = useState<BackendLoginResponse | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<Status>('idle');
  const [loginError, setLoginError] = useState('');

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
        setListError(err instanceof BackendApiError ? err.message : 'Failed to load customers');
        setListStatus('error');
      });
  }, [session, restaurantId, searchInput, page]);

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
        setDetailError(err instanceof BackendApiError ? err.message : 'Failed to load customer');
        setDetailStatus('error');
      });
  }, [session, restaurantId, selectedCustomerId]);

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
      setActionMessage('Customer updated.');
      refreshAll();
    } catch (err) {
      setActionError(err instanceof BackendApiError ? err.message : 'Update failed');
      setActionStatus('error');
    }
  };

  if (!bootstrapped) return null;

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--p-bg)' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="page-label">Beta</p>
            <h2 className="page-title">Customers (Beta)</h2>
            <p className="page-subtitle">
              Customers from the new backend API. Separate from the production Supabase admin.
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
                searchInput={searchInput}
                onSearchInputChange={setSearchInput}
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
                selectedCustomerId={selectedCustomerId}
                onSelect={openDetail}
                onPageChange={setPage}
              />
            </div>
            <div className="lg:col-span-2">
              {selectedCustomerId ? (
                <DetailPanel
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
                <div className="card p-8 text-center">
                  <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>
                    Select a customer to view details.
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
  searchInput,
  onSearchInputChange,
  onApply,
  onRefresh,
}: {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
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
      <div className="flex-1 min-w-[160px]">
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          Search
        </label>
        <input
          type="text"
          placeholder="Name, phone, or email"
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
    </div>
  );
}

function ListPanel({
  status,
  error,
  result,
  selectedCustomerId,
  onSelect,
  onPageChange,
}: {
  status: Status;
  error: string;
  result: CustomerListResponse | null;
  selectedCustomerId: string;
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
          Failed to load customers
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
      </div>
    );
  }

  if (!result || result.data.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No customers found.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="divide-y" style={{ borderColor: 'var(--p-border-2)' }}>
        {result.data.map((item) => (
          <ListRow key={item.id} item={item} isSelected={item.id === selectedCustomerId} onSelect={onSelect} />
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
  item: CustomerListItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const label = item.fullName || item.phoneNumber || item.email || 'Unnamed';
  const lastActivity = item.lastContactAt ?? item.lastVisitAt ?? item.createdAt;

  return (
    <button
      onClick={() => onSelect(item.id)}
      className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left"
      style={isSelected ? { background: 'var(--p-subtle)' } : undefined}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>{label}</p>
        <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
          {item.phoneNumber ?? '—'}
          {item.email ? ` · ${item.email}` : ''}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="badge badge-gray">
          {item.reservationRequestCount} request{item.reservationRequestCount === 1 ? '' : 's'}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>
          {lastActivity ? new Date(lastActivity).toLocaleString() : '—'}
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
          Failed to load customer
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
          <h3 className="card-header-title">Customer</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--p-text-5)' }}>{detail.id}</p>
        </div>
        <button onClick={onClose} className="text-xs font-semibold" style={{ color: 'var(--p-accent-text)' }}>
          Close
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
          <Field label="Total reservations" value={String(detail.totalReservations)} />
          <Field label="Last visit" value={detail.lastVisitAt ? new Date(detail.lastVisitAt).toLocaleString() : '—'} />
          <Field label="Created" value={new Date(detail.createdAt).toLocaleString()} />
          <Field label="Updated" value={new Date(detail.updatedAt).toLocaleString()} />
        </div>

        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            Edit safe fields
          </p>
          <div>
            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Full name</label>
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
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Phone number</label>
              <input
                type="text"
                value={editPhoneNumber}
                onChange={(e) => onEditPhoneNumberChange(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Email</label>
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
            <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Notes</label>
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
            Save changes
          </button>
        </div>

        {detail.reservationRequests.length > 0 && (
          <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              Recent reservation requests
            </p>
            <div className="space-y-1.5">
              {detail.reservationRequests.slice(0, 5).map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-2 text-xs">
                  <span style={{ color: 'var(--p-text-3)' }}>
                    {req.reservationDate ? req.reservationDate.slice(0, 10) : '—'} · {req.reservationTime ?? '—'} ·{' '}
                    {req.partySize ?? '—'} pax
                  </span>
                  <span className="badge badge-gray shrink-0">{req.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {detail.conversations.length > 0 && (
          <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              Recent conversations
            </p>
            <div className="space-y-1.5">
              {detail.conversations.slice(0, 5).map((conv) => (
                <div key={conv.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate" style={{ color: 'var(--p-text-3)' }}>
                    {conv.lastMessagePreview || conv.channel}
                  </span>
                  <span className="badge badge-gray shrink-0">{conv.status}</span>
                </div>
              ))}
            </div>
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
