'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BackendApiError } from '@/lib/backend-api';
import {
  addTeamMember,
  getTeamMemberDetail,
  listTeamMembers,
  removeTeamMember,
  updateTeamMember,
  TEAM_ROLES,
  TEAM_MEMBER_STATUSES,
  type AddTeamMemberPayload,
  type BackendLoginResponse,
  type TeamMemberDetail,
  type TeamMemberListItem,
  type TeamMemberListResponse,
  type TeamRole,
  type TeamMemberStatus,
} from '@/lib/backend-endpoints';
import BackendAdminShell, { type BackendAdminShellCtx } from '../BackendAdminShell';
import { formatBackendAdminRole, formatBackendAdminStatus, getBackendAdminDict, getBackendAdminUi } from '../locale';

type Status = 'idle' | 'loading' | 'error';

function RoleBadge({ role }: { role: string }) {
  const params = useParams();
  const cls = role === 'OWNER' ? 'badge-purple' : role === 'MANAGER' ? 'badge-blue' : 'badge-gray';
  return <span className={`badge ${cls}`}>{formatBackendAdminRole(params.lang, role)}</span>;
}

export default function TeamClient() {
  const params = useParams();
  const t = getBackendAdminDict(params.lang).team;

  return (
    <BackendAdminShell
      label={t.label}
      title={t.title}
      subtitle={t.subtitle}
      contentClass="max-w-7xl mx-auto space-y-6"
    >
      {(ctx) => <TeamContent {...ctx} />}
    </BackendAdminShell>
  );
}

function TeamContent({ session, restaurantId }: BackendAdminShellCtx) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const t = getBackendAdminDict(params.lang);
  const ui = getBackendAdminUi(params.lang);

  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState<TeamRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<TeamMemberStatus | ''>('');
  const [page, setPage] = useState(1);

  const [listStatus, setListStatus] = useState<Status>('idle');
  const [listError, setListError] = useState('');
  const [listResult, setListResult] = useState<TeamMemberListResponse | null>(null);

  const selectedUserId = searchParams.get('userId') ?? '';
  const [detailStatus, setDetailStatus] = useState<Status>('idle');
  const [detailError, setDetailError] = useState('');
  const [detail, setDetail] = useState<TeamMemberDetail | null>(null);

  const [actionStatus, setActionStatus] = useState<Status>('idle');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const [editRole, setEditRole] = useState<TeamRole>('STAFF');
  const [editStatus, setEditStatus] = useState<TeamMemberStatus>('active');

  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<TeamRole>('STAFF');
  const [addStatus, setAddStatus] = useState<Status>('idle');
  const [addError, setAddError] = useState('');
  const [addMessage, setAddMessage] = useState('');

  const loadList = useCallback(() => {
    if (!session || !restaurantId) return;
    setListStatus('loading');
    setListError('');
    listTeamMembers(restaurantId, session.token, {
      search: searchInput || undefined,
      role: roleFilter || undefined,
      status: statusFilter || undefined,
      page,
      pageSize: 20,
    })
      .then((result) => {
        setListResult(result);
        setListStatus('idle');
      })
      .catch((err) => {
        setListError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadTeam);
        setListStatus('error');
      });
  }, [session, restaurantId, searchInput, roleFilter, statusFilter, page, ui]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(() => {
    if (!session || !restaurantId || !selectedUserId) {
      setDetail(null);
      return;
    }
    setDetailStatus('loading');
    setDetailError('');
    getTeamMemberDetail(restaurantId, session.token, selectedUserId)
      .then((result) => {
        setDetail(result);
        setEditRole(result.restaurantRole);
        setEditStatus(result.membershipStatus);
        setDetailStatus('idle');
      })
      .catch((err) => {
        setDetailError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadTeamMember);
        setDetailStatus('error');
      });
  }, [session, restaurantId, selectedUserId, ui]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail();
  }, [loadDetail]);

  const openDetail = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('userId', id);
    router.push(`?${params.toString()}`);
  };

  const closeDetail = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('userId');
    const query = params.toString();
    router.push(query ? `?${query}` : '?');
  };

  const refreshAll = () => {
    loadList();
    loadDetail();
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !restaurantId || !addEmail.trim()) return;
    setAddStatus('loading');
    setAddError('');
    setAddMessage('');
    try {
      const payload: AddTeamMemberPayload = { email: addEmail.trim(), restaurantRole: addRole };
      const created = await addTeamMember(restaurantId, session.token, payload);
      setAddStatus('idle');
      setAddMessage(ui.messages.teamMemberAdded(created.email, formatBackendAdminRole(params.lang, created.restaurantRole)));
      setAddEmail('');
      loadList();
    } catch (err) {
      setAddError(err instanceof BackendApiError ? err.message : ui.messages.failedToAddTeamMember);
      setAddStatus('error');
    }
  };

  const handleSaveRole = async () => {
    if (!session || !detail) return;
    setActionStatus('loading');
    setActionError('');
    setActionMessage('');
    try {
      await updateTeamMember(restaurantId, session.token, detail.userId, {
        restaurantRole: editRole !== detail.restaurantRole ? editRole : undefined,
        membershipStatus: editStatus !== detail.membershipStatus ? editStatus : undefined,
      });
      setActionStatus('idle');
      setActionMessage(ui.messages.teamMemberUpdated);
      refreshAll();
    } catch (err) {
      setActionError(err instanceof BackendApiError ? err.message : ui.messages.updateFailed);
      setActionStatus('error');
    }
  };

  const handleRemove = async () => {
    if (!session || !detail) return;
    setActionStatus('loading');
    setActionError('');
    setActionMessage('');
    try {
      await removeTeamMember(restaurantId, session.token, detail.userId);
      setActionStatus('idle');
      setActionMessage(ui.messages.membershipDeactivated);
      refreshAll();
    } catch (err) {
      setActionError(err instanceof BackendApiError ? err.message : ui.messages.removeFailed);
      setActionStatus('error');
    }
  };

  return (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 space-y-4">
              <AddMemberForm
                t={t}
                email={addEmail}
                onEmailChange={setAddEmail}
                role={addRole}
                onRoleChange={setAddRole}
                onSubmit={handleAddMember}
                status={addStatus}
                error={addError}
                message={addMessage}
              />
              <Filters
                t={t}
                searchInput={searchInput}
                onSearchInputChange={setSearchInput}
                roleFilter={roleFilter}
                onRoleFilterChange={setRoleFilter}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
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
                selectedUserId={selectedUserId}
                onSelect={openDetail}
                onPageChange={setPage}
              />
            </div>
            <div className="lg:col-span-2">
              {selectedUserId ? (
                <DetailPanel
                  t={t}
                  status={detailStatus}
                  error={detailError}
                  detail={detail}
                  onClose={closeDetail}
                  actionStatus={actionStatus}
                  actionError={actionError}
                  actionMessage={actionMessage}
                  editRole={editRole}
                  onEditRoleChange={setEditRole}
                  editStatus={editStatus}
                  onEditStatusChange={setEditStatus}
                  onSaveRole={handleSaveRole}
                  onRemove={handleRemove}
                />
              ) : (
                <div className="card ba-empty">
                  <div className="ba-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--p-text-3)' }}>
                    {t.team.selectPrompt}
                  </p>
                </div>
              )}
            </div>
          </div>
  );
}

function AddMemberForm({
  t,
  email,
  onEmailChange,
  role,
  onRoleChange,
  onSubmit,
  status,
  error,
  message,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  email: string;
  onEmailChange: (value: string) => void;
  role: TeamRole;
  onRoleChange: (value: TeamRole) => void;
  onSubmit: (e: React.FormEvent) => void;
  status: Status;
  error: string;
  message: string;
}) {
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
  const inputStyle = {
    background: 'var(--p-subtle)',
    border: '1px solid var(--p-border)',
    color: 'var(--p-text-1)',
  };

  return (
    <form onSubmit={onSubmit} className="card p-4 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[200px]">
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          {ui.labels.addExistingUserByEmail}
        </label>
        <input
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          {ui.labels.role}
        </label>
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value as TeamRole)}
          className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        >
          {TEAM_ROLES.map((r) => (
            <option key={r} value={r}>
              {formatBackendAdminRole(params.lang, r)}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={status === 'loading'} className="btn-primary">
        {ui.labels.addMember}
      </button>
      {message && <p className="text-xs font-medium w-full" style={{ color: '#15803d' }}>{message}</p>}
      {status === 'error' && (
        <p className="text-xs font-medium w-full" style={{ color: '#ef4444' }}>{error}</p>
      )}
      <p className="text-[10px] w-full" style={{ color: 'var(--p-text-5)' }}>
        {ui.messages.inviteExistingOnly}
      </p>
    </form>
  );
}

function Filters({
  t,
  searchInput,
  onSearchInputChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
  onApply,
  onRefresh,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  roleFilter: TeamRole | '';
  onRoleFilterChange: (value: TeamRole | '') => void;
  statusFilter: TeamMemberStatus | '';
  onStatusFilterChange: (value: TeamMemberStatus | '') => void;
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
          placeholder={`${ui.labels.name} / ${ui.labels.email}`}
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onApply()}
          className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
          {ui.labels.role}
        </label>
        <select
          value={roleFilter}
          onChange={(e) => onRoleFilterChange(e.target.value as TeamRole | '')}
          className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        >
          <option value="">{t.common.all}</option>
          {TEAM_ROLES.map((r) => (
            <option key={r} value={r}>
              {formatBackendAdminRole(params.lang, r)}
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
          onChange={(e) => onStatusFilterChange(e.target.value as TeamMemberStatus | '')}
          className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
          style={inputStyle}
        >
          <option value="">{t.common.all}</option>
          {TEAM_MEMBER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatBackendAdminStatus(params.lang, s)}
            </option>
          ))}
        </select>
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
  selectedUserId,
  onSelect,
  onPageChange,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  status: Status;
  error: string;
  result: TeamMemberListResponse | null;
  selectedUserId: string;
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
          {ui.messages.failedToLoadTeam}
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
            <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" />
          </svg>
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--p-text-2)' }}>{t.team.emptyTitle}</p>
        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>{t.team.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="ba-divide">
        {result.data.map((item) => (
          <ListRow key={item.userId} item={item} isSelected={item.userId === selectedUserId} onSelect={onSelect} />
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
  item,
  isSelected,
  onSelect,
}: {
  item: TeamMemberListItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const params = useParams();
  return (
    <button
      onClick={() => onSelect(item.userId)}
      className={`ba-row text-left ${isSelected ? 'ba-row-selected' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--p-text-1)' }}>
          {item.name || item.email}
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>{item.email}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <RoleBadge role={item.restaurantRole} />
        <span className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{formatBackendAdminStatus(params.lang, item.membershipStatus)}</span>
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
  editRole,
  onEditRoleChange,
  editStatus,
  onEditStatusChange,
  onSaveRole,
  onRemove,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  status: Status;
  error: string;
  detail: TeamMemberDetail | null;
  onClose: () => void;
  actionStatus: Status;
  actionError: string;
  actionMessage: string;
  editRole: TeamRole;
  onEditRoleChange: (value: TeamRole) => void;
  editStatus: TeamMemberStatus;
  onEditStatusChange: (value: TeamMemberStatus) => void;
  onSaveRole: () => void;
  onRemove: () => void;
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
          {ui.messages.failedToLoadTeamMember}
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
          <h3 className="card-header-title">{t.team.title}</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--p-text-5)' }}>{detail.userId}</p>
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
          <Field label={ui.labels.email} value={detail.email} />
          <Field label={ui.labels.name} value={detail.name || '—'} />
          <Field label={ui.labels.organizationRole} value={detail.organizationRole || '—'} />
          <Field label={ui.labels.userStatus} value={formatBackendAdminStatus(params.lang, detail.userStatus)} />
          <Field label={ui.labels.joined} value={new Date(detail.joinedAt).toLocaleString()} />
          <Field label={ui.labels.updated} value={new Date(detail.updatedAt).toLocaleString()} />
        </div>

        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--p-border-2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            {t.team.manageAccess}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.restaurantRole}</label>
              <select
                value={editRole}
                onChange={(e) => onEditRoleChange(e.target.value as TeamRole)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              >
                {TEAM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {formatBackendAdminRole(params.lang, r)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.membershipStatus}</label>
              <select
                value={editStatus}
                onChange={(e) => onEditStatusChange(e.target.value as TeamMemberStatus)}
                className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                style={inputStyle}
              >
                {TEAM_MEMBER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {formatBackendAdminStatus(params.lang, s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSaveRole}
              disabled={actionStatus === 'loading'}
              className="text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
            >
              {t.common.save}
            </button>
            <button
              onClick={onRemove}
              disabled={actionStatus === 'loading'}
              className="text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ border: '1px solid var(--p-border)', color: '#ef4444' }}
            >
              {t.team.removeFromRestaurant}
            </button>
          </div>
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
