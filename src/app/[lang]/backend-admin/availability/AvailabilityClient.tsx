'use client';

import { useCallback, useEffect, useState } from 'react';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import {
  createBlackoutDate,
  deactivateBlackoutDate,
  getAvailabilitySettings,
  getAvailabilitySlots,
  listBlackoutDates,
  updateAvailabilitySettings,
  updateBlackoutDate,
  type AvailabilitySettings,
  type AvailabilitySlotsResult,
  type BackendLoginResponse,
  type BlackoutDateItem,
  type BlackoutDateStatus,
  type ListBlackoutDatesResponse,
  type UpdateAvailabilitySettingsPayload,
} from '@/lib/backend-endpoints';
import { LoginCard, RestaurantPicker } from '../BackendAdminBetaClient';
import BackendAdminNav from '../BackendAdminNav';

type Status = 'idle' | 'loading' | 'error';

const inputStyle = {
  background: 'var(--p-subtle)',
  border: '1px solid var(--p-border)',
  color: 'var(--p-text-1)',
};

type SettingsFormState = {
  reservationsEnabled: boolean;
  slotIntervalMinutes: string;
  defaultReservationDurationMinutes: string;
  minAdvanceMinutes: string;
  bookingWindowDays: string;
  minPartySize: string;
  maxPartySize: string;
  maxReservationsPerSlot: string;
  manualApprovalThreshold: string;
  autoConfirm: boolean;
  openingHoursJson: string;
  notes: string;
};

function toSettingsForm(settings: AvailabilitySettings): SettingsFormState {
  return {
    reservationsEnabled: settings.reservationsEnabled,
    slotIntervalMinutes: String(settings.slotIntervalMinutes),
    defaultReservationDurationMinutes: String(settings.defaultReservationDurationMinutes),
    minAdvanceMinutes: String(settings.minAdvanceMinutes),
    bookingWindowDays: String(settings.bookingWindowDays),
    minPartySize: String(settings.minPartySize),
    maxPartySize: String(settings.maxPartySize),
    maxReservationsPerSlot: settings.maxReservationsPerSlot != null ? String(settings.maxReservationsPerSlot) : '',
    manualApprovalThreshold: settings.manualApprovalThreshold != null ? String(settings.manualApprovalThreshold) : '',
    autoConfirm: settings.autoConfirm,
    openingHoursJson: settings.openingHoursJson != null ? JSON.stringify(settings.openingHoursJson, null, 2) : '',
    notes: settings.notes ?? '',
  };
}

export default function AvailabilityClient() {
  const [session, setSession] = useState<BackendLoginResponse | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<Status>('idle');
  const [loginError, setLoginError] = useState('');

  const [loadStatus, setLoadStatus] = useState<Status>('idle');
  const [loadError, setLoadError] = useState('');
  const [settings, setSettings] = useState<AvailabilitySettings | null>(null);
  const [form, setForm] = useState<SettingsFormState | null>(null);

  const [saveStatus, setSaveStatus] = useState<Status>('idle');
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [readOnly, setReadOnly] = useState(false);

  const [blackoutStatusFilter, setBlackoutStatusFilter] = useState<BlackoutDateStatus | ''>('');
  const [blackoutListStatus, setBlackoutListStatus] = useState<Status>('idle');
  const [blackoutListError, setBlackoutListError] = useState('');
  const [blackoutList, setBlackoutList] = useState<ListBlackoutDatesResponse | null>(null);

  const [showCreateBlackout, setShowCreateBlackout] = useState(false);
  const [createLocalDate, setCreateLocalDate] = useState('');
  const [createIsFullDay, setCreateIsFullDay] = useState(true);
  const [createStartsAt, setCreateStartsAt] = useState('');
  const [createEndsAt, setCreateEndsAt] = useState('');
  const [createReason, setCreateReason] = useState('');
  const [createBlackoutStatus, setCreateBlackoutStatus] = useState<Status>('idle');
  const [createBlackoutError, setCreateBlackoutError] = useState('');

  const [blackoutActionStatus, setBlackoutActionStatus] = useState<Status>('idle');
  const [blackoutActionError, setBlackoutActionError] = useState('');

  const [slotDate, setSlotDate] = useState('');
  const [slotPartySize, setSlotPartySize] = useState('2');
  const [slotPreferredTime, setSlotPreferredTime] = useState('');
  const [slotCheckStatus, setSlotCheckStatus] = useState<Status>('idle');
  const [slotCheckError, setSlotCheckError] = useState('');
  const [slotResult, setSlotResult] = useState<AvailabilitySlotsResult | null>(null);

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

  const loadSettings = useCallback(() => {
    if (!session || !restaurantId) return;
    setLoadStatus('loading');
    setLoadError('');
    setSaveMessage('');
    getAvailabilitySettings(restaurantId, session.token)
      .then((result) => {
        setSettings(result);
        setForm(toSettingsForm(result));
        setLoadStatus('idle');
      })
      .catch((err) => {
        setLoadError(err instanceof BackendApiError ? err.message : 'Failed to load availability settings');
        setLoadStatus('error');
      });
  }, [session, restaurantId]);

  const loadBlackoutList = useCallback(() => {
    if (!session || !restaurantId) return;
    setBlackoutListStatus('loading');
    setBlackoutListError('');
    listBlackoutDates(restaurantId, session.token, {
      status: blackoutStatusFilter || undefined,
      page: 1,
      pageSize: 50,
    })
      .then((result) => {
        setBlackoutList(result);
        setBlackoutListStatus('idle');
      })
      .catch((err) => {
        setBlackoutListError(err instanceof BackendApiError ? err.message : 'Failed to load blackout dates');
        setBlackoutListStatus('error');
      });
  }, [session, restaurantId, blackoutStatusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBlackoutList();
  }, [loadBlackoutList]);

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
    setSettings(null);
    setForm(null);
    setBlackoutList(null);
  };

  const handleSaveSettings = async () => {
    if (!session || !restaurantId || !settings || !form) return;
    setSaveStatus('loading');
    setSaveError('');
    setSaveMessage('');

    let openingHoursJson: unknown;
    if (form.openingHoursJson.trim()) {
      try {
        openingHoursJson = JSON.parse(form.openingHoursJson);
      } catch {
        setSaveError('Opening hours must be valid JSON.');
        setSaveStatus('error');
        return;
      }
    } else {
      openingHoursJson = null;
    }

    const payload: UpdateAvailabilitySettingsPayload = {
      reservationsEnabled: form.reservationsEnabled,
      openingHoursJson,
      slotIntervalMinutes: Number(form.slotIntervalMinutes),
      defaultReservationDurationMinutes: Number(form.defaultReservationDurationMinutes),
      minAdvanceMinutes: Number(form.minAdvanceMinutes),
      bookingWindowDays: Number(form.bookingWindowDays),
      minPartySize: Number(form.minPartySize),
      maxPartySize: Number(form.maxPartySize),
      maxReservationsPerSlot: form.maxReservationsPerSlot ? Number(form.maxReservationsPerSlot) : null,
      manualApprovalThreshold: form.manualApprovalThreshold ? Number(form.manualApprovalThreshold) : null,
      autoConfirm: form.autoConfirm,
      notes: form.notes.trim() || null,
    };

    try {
      const updated = await updateAvailabilitySettings(restaurantId, session.token, payload);
      setSettings(updated);
      setForm(toSettingsForm(updated));
      setSaveStatus('idle');
      setSaveMessage('Availability settings saved.');
      setReadOnly(false);
    } catch (err) {
      if (err instanceof BackendApiError && err.status === 403) {
        setReadOnly(true);
        setSaveError('You do not have permission to update availability settings for this restaurant.');
      } else {
        setSaveError(err instanceof BackendApiError ? err.message : 'Failed to save availability settings');
      }
      setSaveStatus('error');
    }
  };

  const resetCreateForm = () => {
    setCreateLocalDate('');
    setCreateIsFullDay(true);
    setCreateStartsAt('');
    setCreateEndsAt('');
    setCreateReason('');
  };

  const handleCreateBlackout = async () => {
    if (!session || !restaurantId) return;
    setCreateBlackoutStatus('loading');
    setCreateBlackoutError('');
    try {
      await createBlackoutDate(restaurantId, session.token, {
        localDate: createLocalDate,
        isFullDay: createIsFullDay,
        startsAtLocal: createIsFullDay ? null : createStartsAt || null,
        endsAtLocal: createIsFullDay ? null : createEndsAt || null,
        reason: createReason.trim() || null,
      });
      setCreateBlackoutStatus('idle');
      setShowCreateBlackout(false);
      resetCreateForm();
      loadBlackoutList();
    } catch (err) {
      setCreateBlackoutError(err instanceof BackendApiError ? err.message : 'Failed to create blackout date');
      setCreateBlackoutStatus('error');
    }
  };

  const handleDeactivateBlackout = async (id: string) => {
    if (!session || !restaurantId) return;
    setBlackoutActionStatus('loading');
    setBlackoutActionError('');
    try {
      await deactivateBlackoutDate(restaurantId, session.token, id);
      setBlackoutActionStatus('idle');
      loadBlackoutList();
    } catch (err) {
      setBlackoutActionError(err instanceof BackendApiError ? err.message : 'Failed to deactivate blackout date');
      setBlackoutActionStatus('error');
    }
  };

  const handleReactivateBlackout = async (id: string) => {
    if (!session || !restaurantId) return;
    setBlackoutActionStatus('loading');
    setBlackoutActionError('');
    try {
      await updateBlackoutDate(restaurantId, session.token, id, { status: 'active' });
      setBlackoutActionStatus('idle');
      loadBlackoutList();
    } catch (err) {
      setBlackoutActionError(err instanceof BackendApiError ? err.message : 'Failed to reactivate blackout date');
      setBlackoutActionStatus('error');
    }
  };

  const handleCheckAvailability = async () => {
    if (!session || !restaurantId || !slotDate) return;
    setSlotCheckStatus('loading');
    setSlotCheckError('');
    try {
      const result = await getAvailabilitySlots(restaurantId, session.token, {
        date: slotDate,
        partySize: Number(slotPartySize),
        preferredTime: slotPreferredTime || undefined,
      });
      setSlotResult(result);
      setSlotCheckStatus('idle');
    } catch (err) {
      setSlotCheckError(err instanceof BackendApiError ? err.message : 'Failed to check availability');
      setSlotCheckStatus('error');
    }
  };

  if (!bootstrapped) return null;

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--p-bg)' }}>
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="page-label">Settings</p>
              <h2 className="page-title">Availability</h2>
              <p className="page-subtitle">Reservation availability settings, opening hours, and blackout dates.</p>
            </div>
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
        ) : loadStatus === 'loading' ? (
          <div className="card p-10 flex items-center justify-center">
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--p-border)', borderTopColor: 'var(--p-accent)' }}
            />
          </div>
        ) : loadStatus === 'error' || !settings || !form ? (
          <div className="card p-6 text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>
              Failed to load availability settings
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{loadError}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {readOnly && (
              <div className="card p-4" style={{ borderColor: '#f59e0b' }}>
                <p className="text-sm font-medium" style={{ color: '#b45309' }}>
                  Your role only allows viewing these settings. Updates are restricted to owners and managers.
                </p>
              </div>
            )}
            {saveMessage && (
              <div className="card p-4" style={{ borderColor: '#16a34a' }}>
                <p className="text-sm font-medium" style={{ color: '#15803d' }}>{saveMessage}</p>
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="card p-4" style={{ borderColor: '#ef4444' }}>
                <p className="text-sm font-medium" style={{ color: '#ef4444' }}>{saveError}</p>
              </div>
            )}

            <SettingsSection form={form} onChange={setForm} readOnly={readOnly} />

            {!readOnly && (
              <div className="flex items-center gap-3">
                <button onClick={handleSaveSettings} disabled={saveStatus === 'loading'} className="btn-primary">
                  {saveStatus === 'loading' ? 'Saving…' : 'Save changes'}
                </button>
                <button onClick={loadSettings} className="btn-ghost">
                  Refresh
                </button>
              </div>
            )}

            <BlackoutSection
              statusFilter={blackoutStatusFilter}
              onStatusFilterChange={setBlackoutStatusFilter}
              listStatus={blackoutListStatus}
              listError={blackoutListError}
              list={blackoutList}
              onRefresh={loadBlackoutList}
              readOnly={readOnly}
              showCreateForm={showCreateBlackout}
              onToggleCreateForm={() => setShowCreateBlackout((v) => !v)}
              createLocalDate={createLocalDate}
              onCreateLocalDateChange={setCreateLocalDate}
              createIsFullDay={createIsFullDay}
              onCreateIsFullDayChange={setCreateIsFullDay}
              createStartsAt={createStartsAt}
              onCreateStartsAtChange={setCreateStartsAt}
              createEndsAt={createEndsAt}
              onCreateEndsAtChange={setCreateEndsAt}
              createReason={createReason}
              onCreateReasonChange={setCreateReason}
              onCreateSave={handleCreateBlackout}
              createStatus={createBlackoutStatus}
              createError={createBlackoutError}
              onDeactivate={handleDeactivateBlackout}
              onReactivate={handleReactivateBlackout}
              actionStatus={blackoutActionStatus}
              actionError={blackoutActionError}
            />

            <SlotPreviewSection
              date={slotDate}
              onDateChange={setSlotDate}
              partySize={slotPartySize}
              onPartySizeChange={setSlotPartySize}
              preferredTime={slotPreferredTime}
              onPreferredTimeChange={setSlotPreferredTime}
              onCheck={handleCheckAvailability}
              status={slotCheckStatus}
              error={slotCheckError}
              result={slotResult}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsSection({
  form,
  onChange,
  readOnly,
}: {
  form: SettingsFormState;
  onChange: (updater: (prev: SettingsFormState | null) => SettingsFormState | null) => void;
  readOnly: boolean;
}) {
  const set = <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) =>
    onChange((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">Reservation availability</h3>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.reservationsEnabled}
            disabled={readOnly}
            onChange={(e) => set('reservationsEnabled', e.target.checked)}
          />
          <label className="text-sm" style={{ color: 'var(--p-text-2)' }}>Reservations enabled</label>
        </div>
        <NumberField label="Slot interval (minutes)" value={form.slotIntervalMinutes} readOnly={readOnly} onChange={(v) => set('slotIntervalMinutes', v)} />
        <NumberField label="Default reservation duration (minutes)" value={form.defaultReservationDurationMinutes} readOnly={readOnly} onChange={(v) => set('defaultReservationDurationMinutes', v)} />
        <NumberField label="Minimum advance (minutes)" value={form.minAdvanceMinutes} readOnly={readOnly} onChange={(v) => set('minAdvanceMinutes', v)} />
        <NumberField label="Booking window (days)" value={form.bookingWindowDays} readOnly={readOnly} onChange={(v) => set('bookingWindowDays', v)} />
        <NumberField label="Minimum party size" value={form.minPartySize} readOnly={readOnly} onChange={(v) => set('minPartySize', v)} />
        <NumberField label="Maximum party size" value={form.maxPartySize} readOnly={readOnly} onChange={(v) => set('maxPartySize', v)} />
        <NumberField label="Max reservations per slot (optional)" value={form.maxReservationsPerSlot} readOnly={readOnly} onChange={(v) => set('maxReservationsPerSlot', v)} />
        <NumberField label="Manual approval threshold (optional, party size ≥ this requires staff confirmation)" value={form.manualApprovalThreshold} readOnly={readOnly} onChange={(v) => set('manualApprovalThreshold', v)} />
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.autoConfirm}
            disabled={readOnly}
            onChange={(e) => set('autoConfirm', e.target.checked)}
          />
          <label className="text-sm" style={{ color: 'var(--p-text-2)' }}>Auto-confirm reservations (skip manual review)</label>
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            Opening hours (JSON)
          </label>
          <textarea
            value={form.openingHoursJson}
            disabled={readOnly}
            onChange={(e) => set('openingHoursJson', e.target.value)}
            rows={6}
            className="block w-full rounded-lg px-3 py-2 text-xs font-mono outline-none mt-1 disabled:opacity-60"
            style={inputStyle}
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            Notes
          </label>
          <textarea
            value={form.notes}
            disabled={readOnly}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1 disabled:opacity-60"
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
        {label}
      </label>
      <input
        type="number"
        value={value}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1 disabled:opacity-60"
        style={inputStyle}
      />
    </div>
  );
}

function BlackoutStatusBadge({ status }: { status: BlackoutDateStatus }) {
  const cls = status === 'active' ? 'badge-green' : 'badge-gray';
  return <span className={`badge ${cls}`}>{status}</span>;
}

function BlackoutSection({
  statusFilter,
  onStatusFilterChange,
  listStatus,
  listError,
  list,
  onRefresh,
  readOnly,
  showCreateForm,
  onToggleCreateForm,
  createLocalDate,
  onCreateLocalDateChange,
  createIsFullDay,
  onCreateIsFullDayChange,
  createStartsAt,
  onCreateStartsAtChange,
  createEndsAt,
  onCreateEndsAtChange,
  createReason,
  onCreateReasonChange,
  onCreateSave,
  createStatus,
  createError,
  onDeactivate,
  onReactivate,
  actionStatus,
  actionError,
}: {
  statusFilter: BlackoutDateStatus | '';
  onStatusFilterChange: (value: BlackoutDateStatus | '') => void;
  listStatus: Status;
  listError: string;
  list: ListBlackoutDatesResponse | null;
  onRefresh: () => void;
  readOnly: boolean;
  showCreateForm: boolean;
  onToggleCreateForm: () => void;
  createLocalDate: string;
  onCreateLocalDateChange: (value: string) => void;
  createIsFullDay: boolean;
  onCreateIsFullDayChange: (value: boolean) => void;
  createStartsAt: string;
  onCreateStartsAtChange: (value: string) => void;
  createEndsAt: string;
  onCreateEndsAtChange: (value: string) => void;
  createReason: string;
  onCreateReasonChange: (value: string) => void;
  onCreateSave: () => void;
  createStatus: Status;
  createError: string;
  onDeactivate: (id: string) => void;
  onReactivate: (id: string) => void;
  actionStatus: Status;
  actionError: string;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">Blackout dates</h3>
        {!readOnly && (
          <button
            onClick={onToggleCreateForm}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--p-accent)', color: 'var(--p-accent-contrast, #fff)' }}
          >
            Add blackout date
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as BlackoutDateStatus | '')}
              className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <button onClick={onRefresh} className="btn-ghost">
            Refresh
          </button>
        </div>

        {showCreateForm && !readOnly && (
          <div className="card p-4 space-y-3">
            {createStatus === 'error' && (
              <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{createError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Date (YYYY-MM-DD)</label>
                <input
                  type="text"
                  placeholder="2026-12-25"
                  value={createLocalDate}
                  onChange={(e) => onCreateLocalDateChange(e.target.value)}
                  className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                  style={inputStyle}
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  checked={createIsFullDay}
                  onChange={(e) => onCreateIsFullDayChange(e.target.checked)}
                />
                <label className="text-sm" style={{ color: 'var(--p-text-2)' }}>Full day</label>
              </div>
              {!createIsFullDay && (
                <>
                  <div>
                    <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Start (HH:mm)</label>
                    <input
                      type="text"
                      placeholder="18:00"
                      value={createStartsAt}
                      onChange={(e) => onCreateStartsAtChange(e.target.value)}
                      className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>End (HH:mm)</label>
                    <input
                      type="text"
                      placeholder="22:00"
                      value={createEndsAt}
                      onChange={(e) => onCreateEndsAtChange(e.target.value)}
                      className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                      style={inputStyle}
                    />
                  </div>
                </>
              )}
              <div className="col-span-2">
                <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>Reason (optional)</label>
                <input
                  type="text"
                  value={createReason}
                  onChange={(e) => onCreateReasonChange(e.target.value)}
                  className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1"
                  style={inputStyle}
                />
              </div>
            </div>
            <button
              onClick={onCreateSave}
              disabled={createStatus === 'loading' || !createLocalDate}
              className="btn-primary"
            >
              {createStatus === 'loading' ? 'Saving…' : 'Save blackout date'}
            </button>
          </div>
        )}

        {actionStatus === 'error' && (
          <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{actionError}</p>
        )}

        {listStatus === 'loading' ? (
          <div className="p-6 flex items-center justify-center">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--p-border)', borderTopColor: 'var(--p-accent)' }}
            />
          </div>
        ) : listStatus === 'error' ? (
          <p className="text-xs" style={{ color: 'var(--p-text-4)' }}>{listError}</p>
        ) : !list || list.data.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No blackout dates found.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--p-border-2)' }}>
            {list.data.map((item) => (
              <BlackoutRow key={item.id} item={item} readOnly={readOnly} onDeactivate={onDeactivate} onReactivate={onReactivate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SlotPreviewSection({
  date,
  onDateChange,
  partySize,
  onPartySizeChange,
  preferredTime,
  onPreferredTimeChange,
  onCheck,
  status,
  error,
  result,
}: {
  date: string;
  onDateChange: (value: string) => void;
  partySize: string;
  onPartySizeChange: (value: string) => void;
  preferredTime: string;
  onPreferredTimeChange: (value: string) => void;
  onCheck: () => void;
  status: Status;
  error: string;
  result: AvailabilitySlotsResult | null;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">Slot preview</h3>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>
          Read-only check against the Phase 25 availability slot calculation service. Does not create or modify any
          reservation.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              Party size
            </label>
            <input
              type="number"
              min={1}
              value={partySize}
              onChange={(e) => onPartySizeChange(e.target.value)}
              className="block w-24 rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              Preferred time (optional)
            </label>
            <input
              type="text"
              placeholder="19:00"
              value={preferredTime}
              onChange={(e) => onPreferredTimeChange(e.target.value)}
              className="block w-28 rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            />
          </div>
          <button
            onClick={onCheck}
            disabled={status === 'loading' || !date || !partySize}
            className="btn-primary"
          >
            {status === 'loading' ? 'Checking…' : 'Check availability'}
          </button>
        </div>

        {status === 'error' && (
          <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{error}</p>
        )}

        {result && (
          <div className="space-y-3">
            {result.blockedReason && (
              <p className="text-sm font-semibold" style={{ color: '#b45309' }}>
                Blocked: {result.blockedReason}
              </p>
            )}
            {result.warnings.length > 0 && (
              <ul className="text-xs" style={{ color: 'var(--p-text-5)' }}>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            {result.availableSlots.length === 0 && !result.blockedReason ? (
              <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>No slots generated for this date.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {result.availableSlots.map((slot) => (
                  <span
                    key={slot.time}
                    className={`badge ${slot.available ? 'badge-green' : 'badge-gray'}`}
                    title={slot.reason ?? ''}
                  >
                    {slot.time} {slot.available ? `· cap ${slot.capacity}` : `· ${slot.reason}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BlackoutRow({
  item,
  readOnly,
  onDeactivate,
  onReactivate,
}: {
  item: BlackoutDateItem;
  readOnly: boolean;
  onDeactivate: (id: string) => void;
  onReactivate: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>
          {item.localDate}
          {!item.isFullDay && item.startsAtLocal && item.endsAtLocal ? ` · ${item.startsAtLocal}–${item.endsAtLocal}` : ' · Full day'}
        </p>
        {item.reason && (
          <p className="text-xs truncate" style={{ color: 'var(--p-text-5)' }}>{item.reason}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <BlackoutStatusBadge status={item.status} />
        {!readOnly && (
          item.status === 'active' ? (
            <button onClick={() => onDeactivate(item.id)} className="btn-ghost" style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}>
              Deactivate
            </button>
          ) : (
            <button onClick={() => onReactivate(item.id)} className="btn-ghost" style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}>
              Reactivate
            </button>
          )
        )}
      </div>
    </div>
  );
}
