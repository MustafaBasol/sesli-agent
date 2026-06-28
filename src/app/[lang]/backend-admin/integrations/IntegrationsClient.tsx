'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BackendApiError } from '@/lib/backend-api';
import BackendAdminShell from '../BackendAdminShell';
import {
  formatBackendAdminChannel,
  formatBackendAdminProvider,
  formatBackendAdminStatus,
  getBackendAdminDict,
  getBackendAdminUi,
} from '../locale';
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

type Status = 'idle' | 'loading' | 'error';

function StatusBadge({ status, lang }: { status: string; lang: unknown }) {
  const className = status === 'active' ? 'badge badge-green' : status === 'error' ? 'badge badge-red' : 'badge badge-gray';
  return <span className={className}>{formatBackendAdminStatus(lang, status)}</span>;
}

export default function IntegrationsClient() {
  const params = useParams();
  const t = getBackendAdminDict(params.lang).integrations;

  return (
    <BackendAdminShell label={t.label} title={t.title} subtitle={t.subtitle}>
      {({ session, restaurantId }) => <IntegrationsContent session={session} restaurantId={restaurantId} />}
    </BackendAdminShell>
  );
}

function IntegrationsContent({ session, restaurantId }: { session: BackendLoginResponse; restaurantId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const t = getBackendAdminDict(params.lang);
  const ui = getBackendAdminUi(params.lang);

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

  const loadList = useCallback(() => {
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
        setListError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadIntegrations);
        setListStatus('error');
      });
  }, [session, restaurantId, ui]);

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
        setDetailError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadIntegration);
        setDetailStatus('error');
      });
  }, [session, restaurantId, selectedIntegrationId, ui]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail();
  }, [loadDetail]);

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

  return forbidden ? (
          <div className="card ba-empty max-w-md">
            <div className="ba-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--p-text-1)' }}>
              {t.integrations.noPermissionTitle}
            </h3>
            <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>
              {t.integrations.noPermissionBody}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2 space-y-4">
              <Filters
                t={t}
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
                t={t}
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
                  t={t}
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
                  t={t}
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
                <div className="card ba-empty">
                  <div className="ba-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--p-text-3)' }}>
                    {t.integrations.selectPrompt}
                  </p>
                </div>
              )}
            </div>
          </div>
  );
}

function Filters({
  t,
  channelFilter,
  onChannelFilterChange,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  onCreate,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  channelFilter: string;
  onChannelFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
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
          {ui.labels.channel}
        </label>
        <select
          value={channelFilter}
          onChange={(e) => onChannelFilterChange(e.target.value)}
          className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        >
          <option value="">{t.common.all}</option>
          {INTEGRATION_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {formatBackendAdminChannel(params.lang, c)}
            </option>
          ))}
        </select>
      </div>
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
          {INTEGRATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatBackendAdminStatus(params.lang, s)}
            </option>
          ))}
        </select>
      </div>
      <button onClick={onCreate} className="btn-primary">
        {t.integrations.newIntegration}
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
  items,
  selectedIntegrationId,
  onSelect,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  status: Status;
  error: string;
  items: IntegrationSummary[];
  selectedIntegrationId: string;
  onSelect: (id: string) => void;
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
          {ui.messages.failedToLoadIntegrations}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card ba-empty">
        <div className="ba-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--p-text-2)' }}>{t.integrations.emptyTitle}</p>
        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>{t.integrations.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="ba-divide">
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
  const params = useParams();
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={`ba-row text-left ${isSelected ? 'ba-row-selected' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>
          {item.displayName || `${formatBackendAdminChannel(params.lang, item.channel)} / ${formatBackendAdminProvider(params.lang, item.provider)}`}
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>
          {formatBackendAdminChannel(params.lang, item.channel)} · {formatBackendAdminProvider(params.lang, item.provider)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={item.status} lang={params.lang} />
        <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>
          {new Date(item.updatedAt).toLocaleString()}
        </span>
      </div>
    </button>
  );
}

function CreateForm({
  t,
  restaurantId,
  token,
  onCancel,
  onCreated,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  restaurantId: string;
  token: string;
  onCancel: () => void;
  onCreated: (created: IntegrationDetail) => void;
}) {
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
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
      setSaveError(err instanceof BackendApiError ? err.message : ui.messages.failedToCreateIntegration);
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
        <h3 className="card-header-title">{ui.labels.newIntegration}</h3>
        <button onClick={onCancel} className="text-xs font-semibold" style={{ color: 'var(--p-accent-text)' }}>
          {ui.labels.cancel}
        </button>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              {ui.labels.channel}
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as IntegrationChannel)}
              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            >
              {INTEGRATION_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {formatBackendAdminChannel(params.lang, c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              {ui.labels.provider}
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as IntegrationProvider)}
              className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            >
              {INTEGRATION_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {formatBackendAdminProvider(params.lang, p)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            {ui.labels.displayName}
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
            {ui.labels.initialStatus}
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as IntegrationStatus)}
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
            style={inputStyle}
          >
            {INTEGRATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {formatBackendAdminStatus(params.lang, s)}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-2 space-y-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            {ui.labels.credentialOptional}
          </p>
          <p className="text-xs" style={{ color: 'var(--p-text-4)' }}>
            {ui.labels.credentialSavedSecurely}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder={ui.labels.fieldNamePlaceholder}
              value={credentialKey}
              onChange={(e) => setCredentialKey(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            <input
              type="password"
              placeholder={ui.labels.secretValue}
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
          {saveStatus === 'loading' ? t.common.saving : t.integrations.newIntegration}
        </button>
      </div>
    </div>
  );
}

function DetailPanel({
  t,
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
  t: ReturnType<typeof getBackendAdminDict>;
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
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
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
          {ui.messages.failedToLoadIntegration}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{error}</p>
        <button onClick={onClose} className="text-xs font-semibold mt-3" style={{ color: 'var(--p-accent-text)' }}>
          {t.common.close}
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
      setActionError(err instanceof BackendApiError ? err.message : ui.messages.actionFailed);
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
      setActionMessage(ui.messages.integrationUpdated);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof BackendApiError ? err.message : ui.messages.failedToUpdateIntegration);
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
      setActionError(err instanceof BackendApiError ? err.message : ui.messages.failedToTestIntegration);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRotate = async () => {
    setRotateConfirm(false);
    await runAction('rotate-webhook-key', () => rotateIntegrationWebhookKey(restaurantId, token, detail.id), ui.messages.webhookKeyRotated);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-header-title">{detail.displayName || `${formatBackendAdminChannel(params.lang, detail.channel)} / ${formatBackendAdminProvider(params.lang, detail.provider)}`}</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--p-text-5)' }}>{detail.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={detail.status} lang={params.lang} />
          <button onClick={onRefresh} className="text-xs font-semibold" style={{ color: 'var(--p-accent-text)' }}>
            {t.common.refresh}
          </button>
          <button onClick={onClose} className="text-xs font-semibold" style={{ color: 'var(--p-accent-text)' }}>
            {t.common.close}
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
          <Field label={ui.labels.channel} value={formatBackendAdminChannel(params.lang, detail.channel)} />
          <Field label={ui.labels.provider} value={formatBackendAdminProvider(params.lang, detail.provider)} />
          <Field label={ui.labels.hasCredentials} value={detail.hasCredentials ? ui.labels.yes : ui.labels.no} />
          <Field label={ui.labels.publicWebhookKey} value={detail.publicWebhookKey} />
          <Field label={ui.labels.created} value={new Date(detail.createdAt).toLocaleString()} />
          <Field label={ui.labels.updated} value={new Date(detail.updatedAt).toLocaleString()} />
          <Field label={ui.labels.lastConnected} value={detail.lastConnectedAt ? new Date(detail.lastConnectedAt).toLocaleString() : '—'} />
          <Field label={ui.labels.lastTested} value={detail.lastTestedAt ? new Date(detail.lastTestedAt).toLocaleString() : '—'} />
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            {ui.labels.webhookUrl}
          </p>
          <p className="text-xs mt-1 break-all rounded-lg px-3 py-2" style={{ background: 'var(--p-subtle)', color: 'var(--p-text-2)' }}>
            {detail.webhookUrl}
          </p>
        </div>

        {detail.lastError && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              {ui.labels.lastError}
            </p>
            <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{detail.lastError}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          {detail.isActive ? (
            <button
              onClick={() => runAction('disable', () => disableIntegration(restaurantId, token, detail.id), ui.messages.integrationDisabled)}
              disabled={busyAction !== null}
              className="text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
            >
              {busyAction === 'disable' ? ui.labels.disabling : ui.labels.disable}
            </button>
          ) : (
            <button
              onClick={() => runAction('enable', () => enableIntegration(restaurantId, token, detail.id), ui.messages.integrationEnabled)}
              disabled={busyAction !== null}
              className="text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
            >
              {busyAction === 'enable' ? ui.labels.enabling : ui.labels.enable}
            </button>
          )}

          <button
            onClick={handleTest}
            disabled={busyAction !== null}
            className="text-xs font-semibold px-3 py-2 rounded-lg"
            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
          >
            {busyAction === 'test' ? ui.labels.testing : ui.labels.testConnection}
          </button>

          {!rotateConfirm ? (
            <button
              onClick={() => setRotateConfirm(true)}
              disabled={busyAction !== null}
              className="text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ border: '1px solid var(--p-border)', color: '#ef4444' }}
            >
              {ui.labels.rotateWebhookKey}
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: '1px solid #ef4444' }}>
              <span className="text-xs font-medium" style={{ color: '#ef4444' }}>
                {ui.labels.rotateWarning}
              </span>
              <button onClick={handleRotate} disabled={busyAction !== null} className="text-xs font-bold" style={{ color: '#ef4444' }}>
                {t.common.confirm}
              </button>
              <button onClick={() => setRotateConfirm(false)} className="text-xs font-semibold" style={{ color: 'var(--p-text-4)' }}>
                {ui.labels.cancel}
              </button>
            </div>
          )}

          <button
            onClick={() => setEditing((v) => !v)}
            className="text-xs font-semibold px-3 py-2 rounded-lg"
            style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
          >
            {editing ? ui.labels.cancelEdit : ui.labels.edit}
          </button>
        </div>

        {testResult && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border-2)', color: 'var(--p-text-2)' }}
          >
            <span className="font-semibold">{testResult.success ? ui.labels.success : ui.labels.notSuccessful}:</span> {testResult.message}
          </div>
        )}

        {editing && (
          <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                {ui.labels.displayName}
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
                {ui.labels.updateCredentialOptional}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>
                {ui.labels.updateCredentialHelp}
              </p>
              <div className="grid grid-cols-2 gap-3 mt-1">
                <input
                  type="text"
                  placeholder={ui.labels.fieldNamePlaceholder}
                  value={credentialKey}
                  onChange={(e) => setCredentialKey(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
                <input
                  type="password"
                  placeholder={ui.labels.secretValue}
                  value={credentialValue}
                  onChange={(e) => setCredentialValue(e.target.value)}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
            </div>

            <button onClick={handleSaveEdit} disabled={editStatus === 'loading'} className="btn-primary w-full justify-center">
              {editStatus === 'loading' ? t.common.saving : t.common.save}
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
