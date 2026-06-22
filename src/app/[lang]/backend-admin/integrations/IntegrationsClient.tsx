'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import {
  INTEGRATION_CHANNELS,
  INTEGRATION_PROVIDERS,
  INTEGRATION_STATUSES,
  createIntegration,
  disableIntegration,
  enableIntegration,
  getIntegrationDetail,
  listIntegrations,
  rotateIntegrationWebhookKey,
  testIntegration,
  updateIntegration,
  type BackendLoginResponse,
  type CreateIntegrationPayload,
  type IntegrationChannel,
  type IntegrationDetail,
  type IntegrationProvider,
  type IntegrationStatus,
  type IntegrationSummary,
  type IntegrationTestResult,
} from '@/lib/backend-endpoints';
import { LoginCard, RestaurantPicker } from '../BackendAdminBetaClient';
import BackendAdminNav from '../BackendAdminNav';

type Status = 'idle' | 'loading' | 'error';

function StatusBadge({ status }: { status: string }) {
  const className = status === 'active' ? 'badge badge-green' : status === 'error' ? 'badge badge-red' : 'badge badge-gray';
  return <span className={className}>{status}</span>;
}

export default function IntegrationsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [session, setSession] = useState<BackendLoginResponse | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<Status>('idle');
  const [loginError, setLoginError] = useState('');

  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [listStatus, setListStatus] = useState<Status>('idle');
  const [listError, setListError] = useState('');
  const [items, setItems] = useState<IntegrationSummary[]>([]);
  const [forbidden, setForbidden] = useState(false);

  const selectedIntegrationId = searchParams.get('integrationId') ?? '';
  const [detailStatus, setDetailStatus] = useState<Status>('idle');
  const [detailError, setDetailError] = useState('');
  const [detail, setDetail] = useState<IntegrationDetail | null>(null);

  const [showCreate, setShowCreate] = useState(false);

  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

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
    setForbidden(false);
    listIntegrations(restaurantId, session.token)
      .then((result) => {
        setItems(result.data);
        setListStatus('idle');
      })
      .catch((err) => {
        if (err instanceof BackendApiError && err.status === 403) {
          setForbidden(true);
          setListStatus('idle');
          return;
        }
        setListError(err instanceof BackendApiError ? err.message : 'Failed to load integrations');
        setListStatus('error');
      });
  }, [session, restaurantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(() => {
    if (!session || !restaurantId || !selectedIntegrationId) {
      setDetail(null);
      return;
    }
    setDetailStatus('loading');
    setDetailError('');
    getIntegrationDetail(restaurantId, session.token, selectedIntegrationId)
      .then((result) => {
        setDetail(result);
        setDetailStatus('idle');
      })
      .catch((err) => {
        setDetailError(err instanceof BackendApiError ? err.message : 'Failed to load integration');
        setDetailStatus('error');
      });
  }, [session, restaurantId, selectedIntegrationId]);

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
    setItems([]);
    setDetail(null);
  };

  const openDetail = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('integrationId', id);
    router.push(`?${params.toString()}`);
    setShowCreate(false);
  };

  const closeDetail = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('integrationId');
    const query = params.toString();
    router.push(query ? `?${query}` : '?');
  };

  const refreshAll = () => {
    loadList();
    loadDetail();
  };

  const filteredItems = items.filter((item) => {
    if (channelFilter && item.channel !== channelFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    return true;
  });

  if (!bootstrapped) return null;

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--p-bg)' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="page-label">Beta</p>
            <h2 className="page-title">Integrations (Beta)</h2>
            <p className="page-subtitle">
              Integration connections from the new backend API. Separate from the production Supabase admin.
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
        ) : forbidden ? (
          <div className="card p-8 max-w-md text-center">
            <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--p-text-1)' }}>
              No permission
            </h3>
            <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>
              You do not have permission to manage integrations. This area is restricted to owners and managers.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2 space-y-4">
              <Filters
                channelFilter={channelFilter}
                onChannelFilterChange={setChannelFilter}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                onRefresh={loadList}
                onCreate={() => {
                  setShowCreate(true);
                  closeDetail();
                }}
              />
              <ListPanel
                status={listStatus}
                error={listError}
                items={filteredItems}
                selectedIntegrationId={selectedIntegrationId}
                onSelect={openDetail}
              />
            </div>
            <div className="lg:col-span-3">
              {showCreate ? (
                <CreateForm
                  restaurantId={restaurantId}
                  token={session.token}
                  onCancel={() => setShowCreate(false)}
                  onCreated={(created) => {
                    setShowCreate(false);
                    loadList();
                    openDetail(created.id);
                  }}
                />
              ) : selectedIntegrationId ? (
                <DetailPanel
                  restaurantId={restaurantId}
                  token={session.token}
                  status={detailStatus}
                  error={detailError}
                  detail={detail}
                  onClose={closeDetail}
                  onRefresh={refreshAll}
                  actionMessage={actionMessage}
                  actionError={actionError}
                  setActionMessage={setActionMessage}
                  setActionError={setActionError}
                />
              ) : (
                <div className="card p-8 text-center">
                  <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>
                    Select an integration to view details, or create a new one.
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
  channelFilter,
  onChannelFilterChange,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  onCreate,
}: {
  channelFilter: string;
  onChannelFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
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
          Channel
        </label>
        <select
          value={channelFilter}
          onChange={(e) => onChannelFilterChange(e.target.value)}
          className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        >
          <option value="">All</option>
          {INTEGRATION_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
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
          {INTEGRATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <button onClick={onCreate} className="btn-primary">
        New integration
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
  items,
  selectedIntegrationId,
  onSelect,
}: {
  status: Status;
  error: string;
  items: IntegrationSummary[];
  selectedIntegrationId: string;
  onSelect: (id: string) => void;
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
          Failed to load integrations
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No integrations found.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="divide-y" style={{ borderColor: 'var(--p-border-2)' }}>
        {items.map((item) => (
          <ListRow key={item.id} item={item} isSelected={item.id === selectedIntegrationId} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function ListRow({
  item,
  isSelected,
  onSelect,
}: {
  item: IntegrationSummary;
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
          {item.displayName || `${item.channel} / ${item.provider}`}
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
          {item.channel} · {item.provider}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={item.status} />
        <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>
          {new Date(item.updatedAt).toLocaleString()}
        </span>
      </div>
    </button>
  );
}

function CreateForm({
  restaurantId,
  token,
  onCancel,
  onCreated,
}: {
  restaurantId: string;
  token: string;
  onCancel: () => void;
  onCreated: (created: IntegrationDetail) => void;
}) {
  const [channel, setChannel] = useState<IntegrationChannel>('vapi');
  const [provider, setProvider] = useState<IntegrationProvider>('vapi');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState<IntegrationStatus>('inactive');
  const [credentialKey, setCredentialKey] = useState('');
  const [credentialValue, setCredentialValue] = useState('');
  const [saveStatus, setSaveStatus] = useState<Status>('idle');
  const [saveError, setSaveError] = useState('');

  const handleSubmit = async () => {
    setSaveStatus('loading');
    setSaveError('');
    const payload: CreateIntegrationPayload = {
      channel,
      provider,
      displayName: displayName.trim() ? displayName.trim() : null,
      status,
    };
    if (credentialKey.trim() && credentialValue.trim()) {
      payload.credentials = { [credentialKey.trim()]: credentialValue.trim() };
    }
    try {
      const created = await createIntegration(restaurantId, token, payload);
      setSaveStatus('idle');
      setCredentialKey('');
      setCredentialValue('');
      onCreated(created);
    } catch (err) {
      setSaveError(err instanceof BackendApiError ? err.message : 'Failed to create integration');
      setSaveStatus('error');
    }
  };

  const inputStyle = {
    background: 'var(--p-subtle)',
    border: '1px solid var(--p-border)',
    color: 'var(--p-text-1)',
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">New integration</h3>
        <button onClick={onCancel} className="text-xs font-semibold" style={{ color: 'var(--p-accent-text)' }}>
          Cancel
        </button>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              Channel
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as IntegrationChannel)}
              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            >
              {INTEGRATION_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as IntegrationProvider)}
              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            >
              {INTEGRATION_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            Display name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Vapi production"
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
            style={inputStyle}
          />
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            Initial status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as IntegrationStatus)}
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
            style={inputStyle}
          >
            {INTEGRATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-2 space-y-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            Credential (optional)
          </p>
          <p className="text-xs" style={{ color: 'var(--p-text-4)' }}>
            Stored encrypted on the server. The value is never shown again after saving.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Field name (e.g. apiKey)"
              value={credentialKey}
              onChange={(e) => setCredentialKey(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Secret value"
              value={credentialValue}
              onChange={(e) => setCredentialValue(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>
        </div>

        {saveError && (
          <p className="text-xs font-medium" style={{ color: '#ef4444' }}>
            {saveError}
          </p>
        )}

        <button onClick={handleSubmit} disabled={saveStatus === 'loading'} className="btn-primary w-full justify-center">
          {saveStatus === 'loading' ? 'Creating...' : 'Create integration'}
        </button>
      </div>
    </div>
  );
}

function DetailPanel({
  restaurantId,
  token,
  status,
  error,
  detail,
  onClose,
  onRefresh,
  actionMessage,
  actionError,
  setActionMessage,
  setActionError,
}: {
  restaurantId: string;
  token: string;
  status: Status;
  error: string;
  detail: IntegrationDetail | null;
  onClose: () => void;
  onRefresh: () => void;
  actionMessage: string;
  actionError: string;
  setActionMessage: (value: string) => void;
  setActionError: (value: string) => void;
}) {
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editing, setEditing] = useState(false);
  const [editStatus, setEditStatus] = useState<Status>('idle');
  const [credentialKey, setCredentialKey] = useState('');
  const [credentialValue, setCredentialValue] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [rotateConfirm, setRotateConfirm] = useState(false);
  const [testResult, setTestResult] = useState<IntegrationTestResult | null>(null);

  useEffect(() => {
    if (detail) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditDisplayName(detail.displayName ?? '');
      setEditing(false);
      setRotateConfirm(false);
      setTestResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id]);

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
          Failed to load integration
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
        <button onClick={onClose} className="text-xs font-semibold mt-3" style={{ color: 'var(--p-accent-text)' }}>
          Close
        </button>
      </div>
    );
  }

  const inputStyle = {
    background: 'var(--p-subtle)',
    border: '1px solid var(--p-border)',
    color: 'var(--p-text-1)',
  };

  const runAction = async (
    name: string,
    fn: () => Promise<unknown>,
    successMessage: string
  ) => {
    setBusyAction(name);
    setActionMessage('');
    setActionError('');
    try {
      await fn();
      setActionMessage(successMessage);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof BackendApiError ? err.message : `Failed to ${name}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveEdit = async () => {
    setEditStatus('loading');
    setActionMessage('');
    setActionError('');
    try {
      const payload: { displayName?: string | null; credentials?: Record<string, string> } = {
        displayName: editDisplayName.trim() ? editDisplayName.trim() : null,
      };
      if (credentialKey.trim() && credentialValue.trim()) {
        payload.credentials = { [credentialKey.trim()]: credentialValue.trim() };
      }
      await updateIntegration(restaurantId, token, detail.id, payload);
      setCredentialKey('');
      setCredentialValue('');
      setEditing(false);
      setEditStatus('idle');
      setActionMessage('Integration updated.');
      onRefresh();
    } catch (err) {
      setActionError(err instanceof BackendApiError ? err.message : 'Failed to update integration');
      setEditStatus('error');
    }
  };

  const handleTest = async () => {
    setBusyAction('test');
    setActionMessage('');
    setActionError('');
    try {
      const result = await testIntegration(restaurantId, token, detail.id);
      setTestResult(result);
    } catch (err) {
      setActionError(err instanceof BackendApiError ? err.message : 'Failed to test integration');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRotate = async () => {
    setRotateConfirm(false);
    await runAction('rotate-webhook-key', () => rotateIntegrationWebhookKey(restaurantId, token, detail.id), 'Webhook key rotated. Old webhook URLs are now invalid.');
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-header-title">{detail.displayName || `${detail.channel} / ${detail.provider}`}</h3>
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
        {actionMessage && (
          <p className="text-xs font-medium" style={{ color: '#22c55e' }}>{actionMessage}</p>
        )}
        {actionError && (
          <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{actionError}</p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Channel" value={detail.channel} />
          <Field label="Provider" value={detail.provider} />
          <Field label="Has credentials" value={detail.hasCredentials ? 'Yes' : 'No'} />
          <Field label="Public webhook key" value={detail.publicWebhookKey} />
          <Field label="Created" value={new Date(detail.createdAt).toLocaleString()} />
          <Field label="Updated" value={new Date(detail.updatedAt).toLocaleString()} />
          <Field label="Last connected" value={detail.lastConnectedAt ? new Date(detail.lastConnectedAt).toLocaleString() : '—'} />
          <Field label="Last tested" value={detail.lastTestedAt ? new Date(detail.lastTestedAt).toLocaleString() : '—'} />
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            Webhook URL
          </p>
          <p className="text-xs mt-1 break-all rounded-lg px-3 py-2" style={{ background: 'var(--p-subtle)', color: 'var(--p-text-2)' }}>
            {detail.webhookUrl}
          </p>
        </div>

        {detail.lastError && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              Last error
            </p>
            <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{detail.lastError}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          {detail.isActive ? (
            <button
              onClick={() => runAction('disable', () => disableIntegration(restaurantId, token, detail.id), 'Integration disabled.')}
              disabled={busyAction !== null}
              className="text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
            >
              {busyAction === 'disable' ? 'Disabling...' : 'Disable'}
            </button>
          ) : (
            <button
              onClick={() => runAction('enable', () => enableIntegration(restaurantId, token, detail.id), 'Integration enabled.')}
              disabled={busyAction !== null}
              className="text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
            >
              {busyAction === 'enable' ? 'Enabling...' : 'Enable'}
            </button>
          )}

          <button
            onClick={handleTest}
            disabled={busyAction !== null}
            className="text-xs font-semibold px-3 py-2 rounded-lg"
            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
          >
            {busyAction === 'test' ? 'Testing...' : 'Test connection'}
          </button>

          {!rotateConfirm ? (
            <button
              onClick={() => setRotateConfirm(true)}
              disabled={busyAction !== null}
              className="text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ border: '1px solid var(--p-border)', color: '#ef4444' }}
            >
              Rotate webhook key
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: '1px solid #ef4444' }}>
              <span className="text-xs font-medium" style={{ color: '#ef4444' }}>
                Old webhook URLs will stop working. Continue?
              </span>
              <button onClick={handleRotate} disabled={busyAction !== null} className="text-xs font-bold" style={{ color: '#ef4444' }}>
                Confirm
              </button>
              <button onClick={() => setRotateConfirm(false)} className="text-xs font-semibold" style={{ color: 'var(--p-text-4)' }}>
                Cancel
              </button>
            </div>
          )}

          <button
            onClick={() => setEditing((v) => !v)}
            className="text-xs font-semibold px-3 py-2 rounded-lg"
            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
          >
            {editing ? 'Cancel edit' : 'Edit'}
          </button>
        </div>

        {testResult && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border-2)', color: 'var(--p-text-2)' }}
          >
            <span className="font-semibold">{testResult.success ? 'Success' : 'Not successful'}:</span> {testResult.message}
          </div>
        )}

        {editing && (
          <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                Display name
              </label>
              <input
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              />
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                Update credential (optional)
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>
                Leave blank to keep the current credential unchanged. The value is never shown after saving.
              </p>
              <div className="grid grid-cols-2 gap-3 mt-1">
                <input
                  type="text"
                  placeholder="Field name (e.g. apiKey)"
                  value={credentialKey}
                  onChange={(e) => setCredentialKey(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
                <input
                  type="password"
                  placeholder="Secret value"
                  value={credentialValue}
                  onChange={(e) => setCredentialValue(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
            </div>

            <button onClick={handleSaveEdit} disabled={editStatus === 'loading'} className="btn-primary w-full justify-center">
              {editStatus === 'loading' ? 'Saving...' : 'Save changes'}
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
