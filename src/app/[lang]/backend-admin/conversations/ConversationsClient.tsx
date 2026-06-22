'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import {
  CONVERSATION_STATUSES,
  getConversationDetail,
  listConversationMessages,
  listConversations,
  type BackendLoginResponse,
  type ConversationDetail,
  type ConversationListItem,
  type ConversationListResponse,
  type ConversationMessage,
  type ConversationStatus,
  type MessageListResponse,
} from '@/lib/backend-endpoints';
import { LoginCard, RestaurantPicker } from '../BackendAdminBetaClient';
import BackendAdminNav from '../BackendAdminNav';

type Status = 'idle' | 'loading' | 'error';

function StatusBadge({ status }: { status: string }) {
  return <span className="badge badge-gray">{status}</span>;
}

export default function ConversationsClient() {
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
  const [channelFilter, setChannelFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const [listStatus, setListStatus] = useState<Status>('idle');
  const [listError, setListError] = useState('');
  const [listResult, setListResult] = useState<ConversationListResponse | null>(null);

  const selectedConversationId = searchParams.get('conversationId') ?? '';
  const [detailStatus, setDetailStatus] = useState<Status>('idle');
  const [detailError, setDetailError] = useState('');
  const [detail, setDetail] = useState<ConversationDetail | null>(null);

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messagesStatus, setMessagesStatus] = useState<Status>('idle');
  const [messagesError, setMessagesError] = useState('');
  const [messagesPagination, setMessagesPagination] = useState<MessageListResponse['pagination'] | null>(null);
  const [messagesPage, setMessagesPage] = useState(1);

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
    listConversations(restaurantId, session.token, {
      status: (statusFilter as ConversationStatus) || undefined,
      channel: channelFilter || undefined,
      provider: providerFilter || undefined,
      search: searchInput || undefined,
      page,
      pageSize: 20,
    })
      .then((result) => {
        setListResult(result);
        setListStatus('idle');
      })
      .catch((err) => {
        setListError(err instanceof BackendApiError ? err.message : 'Failed to load conversations');
        setListStatus('error');
      });
  }, [session, restaurantId, statusFilter, channelFilter, providerFilter, searchInput, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(() => {
    if (!session || !restaurantId || !selectedConversationId) {
      setDetail(null);
      return;
    }
    setDetailStatus('loading');
    setDetailError('');
    getConversationDetail(restaurantId, session.token, selectedConversationId)
      .then((result) => {
        setDetail(result);
        setDetailStatus('idle');
      })
      .catch((err) => {
        setDetailError(err instanceof BackendApiError ? err.message : 'Failed to load conversation');
        setDetailStatus('error');
      });
  }, [session, restaurantId, selectedConversationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail();
  }, [loadDetail]);

  const loadMessages = useCallback(
    (targetPage: number, append: boolean) => {
      if (!session || !restaurantId || !selectedConversationId) {
        setMessages([]);
        setMessagesPagination(null);
        return;
      }
      setMessagesStatus('loading');
      setMessagesError('');
      listConversationMessages(restaurantId, session.token, selectedConversationId, {
        page: targetPage,
        pageSize: 50,
        order: 'asc',
      })
        .then((result) => {
          setMessages((prev) => (append ? [...prev, ...result.data] : result.data));
          setMessagesPagination(result.pagination);
          setMessagesPage(targetPage);
          setMessagesStatus('idle');
        })
        .catch((err) => {
          setMessagesError(err instanceof BackendApiError ? err.message : 'Failed to load messages');
          setMessagesStatus('error');
        });
    },
    [session, restaurantId, selectedConversationId]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMessages(1, false);
  }, [loadMessages]);

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
    setMessages([]);
  };

  const openDetail = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('conversationId', id);
    router.push(`?${params.toString()}`);
  };

  const closeDetail = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('conversationId');
    const query = params.toString();
    router.push(query ? `?${query}` : '?');
  };

  const refreshAll = () => {
    loadList();
    loadDetail();
    loadMessages(1, false);
  };

  if (!bootstrapped) return null;

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--p-bg)' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="page-label">Beta</p>
            <h2 className="page-title">Conversations (Beta)</h2>
            <p className="page-subtitle">
              Conversations and messages from the new backend API. Separate from the production Supabase admin.
              Read-only — replying is not available yet.
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
            <div className="lg:col-span-2 space-y-4">
              <Filters
                statusFilter={statusFilter}
                onStatusFilterChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                channelFilter={channelFilter}
                onChannelFilterChange={(value) => {
                  setChannelFilter(value);
                  setPage(1);
                }}
                providerFilter={providerFilter}
                onProviderFilterChange={(value) => {
                  setProviderFilter(value);
                  setPage(1);
                }}
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
                selectedConversationId={selectedConversationId}
                onSelect={openDetail}
                onPageChange={setPage}
              />
            </div>
            <div className="lg:col-span-3">
              {selectedConversationId ? (
                <DetailPanel
                  status={detailStatus}
                  error={detailError}
                  detail={detail}
                  onClose={closeDetail}
                  onRefresh={refreshAll}
                  messages={messages}
                  messagesStatus={messagesStatus}
                  messagesError={messagesError}
                  messagesPagination={messagesPagination}
                  onLoadMore={() => loadMessages(messagesPage + 1, true)}
                />
              ) : (
                <div className="card p-8 text-center">
                  <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>
                    Select a conversation to view messages.
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
  channelFilter,
  onChannelFilterChange,
  providerFilter,
  onProviderFilterChange,
  searchInput,
  onSearchInputChange,
  onApply,
  onRefresh,
}: {
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  channelFilter: string;
  onChannelFilterChange: (value: string) => void;
  providerFilter: string;
  onProviderFilterChange: (value: string) => void;
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
          {CONVERSATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          Channel
        </label>
        <input
          type="text"
          placeholder="voice, whatsapp..."
          value={channelFilter}
          onChange={(e) => onChannelFilterChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onApply()}
          className="block w-32 rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          Provider
        </label>
        <input
          type="text"
          placeholder="vapi, meta_cloud..."
          value={providerFilter}
          onChange={(e) => onProviderFilterChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onApply()}
          className="block w-32 rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          Search
        </label>
        <input
          type="text"
          placeholder="Name, phone, or handle"
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
  selectedConversationId,
  onSelect,
  onPageChange,
}: {
  status: Status;
  error: string;
  result: ConversationListResponse | null;
  selectedConversationId: string;
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
          Failed to load conversations
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
      </div>
    );
  }

  if (!result || result.data.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No conversations found.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="divide-y" style={{ borderColor: 'var(--p-border-2)' }}>
        {result.data.map((item) => (
          <ListRow key={item.id} item={item} isSelected={item.id === selectedConversationId} onSelect={onSelect} />
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
  item: ConversationListItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const label =
    item.customer?.fullName || item.customerName || item.customerPhone || item.customerHandle || 'Unknown';
  const handle = item.customerPhone || item.customerHandle || '—';

  return (
    <button
      onClick={() => onSelect(item.id)}
      className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left"
      style={isSelected ? { background: 'var(--p-subtle)' } : undefined}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>{label}</p>
        <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
          {handle} · {item.channel}
          {item.provider ? ` (${item.provider})` : ''}
        </p>
        {item.lastMessagePreview && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--p-text-5)' }}>{item.lastMessagePreview}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={item.status} />
        <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>
          {item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleString() : '—'}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>
          {item.messageCount} msg{item.messageCount === 1 ? '' : 's'} · {item.reservationRequestCount} req
          {item.reservationRequestCount === 1 ? '' : 's'}
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
  onRefresh,
  messages,
  messagesStatus,
  messagesError,
  messagesPagination,
  onLoadMore,
}: {
  status: Status;
  error: string;
  detail: ConversationDetail | null;
  onClose: () => void;
  onRefresh: () => void;
  messages: ConversationMessage[];
  messagesStatus: Status;
  messagesError: string;
  messagesPagination: MessageListResponse['pagination'] | null;
  onLoadMore: () => void;
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

  if (status === 'error' || !detail) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>
          Failed to load conversation
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
        <button onClick={onClose} className="text-xs font-semibold mt-3" style={{ color: 'var(--p-accent-text)' }}>
          Close
        </button>
      </div>
    );
  }

  const label = detail.customer?.fullName || detail.customerName || detail.customerPhone || detail.customerHandle || 'Unknown';
  const canLoadMore = messagesPagination ? messagesPagination.page < messagesPagination.totalPages : false;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-header-title">Conversation</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--p-text-5)' }}>{detail.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={detail.status} />
          <button onClick={onRefresh} className="text-xs font-semibold" style={{ color: 'var(--p-accent-text)' }}>
            Refresh
          </button>
          <button onClick={onClose} className="text-xs font-semibold" style={{ color: 'var(--p-accent-text)' }}>
            Close
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Customer" value={label} />
          <Field label="Phone / handle" value={detail.customerPhone || detail.customerHandle || '—'} />
          <Field label="Channel" value={`${detail.channel}${detail.provider ? ` (${detail.provider})` : ''}`} />
          <Field label="Last message" value={detail.lastMessageAt ? new Date(detail.lastMessageAt).toLocaleString() : '—'} />
          <Field label="Created" value={new Date(detail.createdAt).toLocaleString()} />
          <Field label="Updated" value={new Date(detail.updatedAt).toLocaleString()} />
        </div>

        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              Messages
            </p>
            {messagesStatus === 'loading' && (
              <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Loading...</span>
            )}
          </div>

          {messagesStatus === 'error' && (
            <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{messagesError}</p>
          )}

          {messages.length === 0 && messagesStatus !== 'loading' ? (
            <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No messages yet.</p>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto">
              {messages.map((message) => (
                <MessageRow key={message.id} message={message} />
              ))}
            </div>
          )}

          {canLoadMore && (
            <button
              onClick={onLoadMore}
              disabled={messagesStatus === 'loading'}
              className="text-xs font-semibold px-3 py-2 rounded-lg w-full"
              style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
            >
              Load more
            </button>
          )}
        </div>

        <div className="pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <button
            disabled
            title="Reply coming later"
            className="text-xs font-semibold px-3 py-2 rounded-lg w-full opacity-50 cursor-not-allowed"
            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-4)' }}
          >
            Reply coming later
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: ConversationMessage }) {
  const isOutbound = message.direction === 'outbound';
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{
        background: isOutbound ? 'var(--p-accent-soft, var(--p-subtle))' : 'var(--p-subtle)',
        border: '1px solid var(--p-border-2)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          {message.direction} · {message.senderType}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>
          {new Date(message.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: 'var(--p-text-1)' }}>
        {message.messageText || '—'}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>
          {message.channel}
          {message.provider ? ` (${message.provider})` : ''}
        </span>
        {message.status && <span className="badge badge-gray">{message.status}</span>}
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
