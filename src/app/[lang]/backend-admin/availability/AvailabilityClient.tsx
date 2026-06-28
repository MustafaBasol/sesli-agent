'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BackendApiError } from '@/lib/backend-api';
import BackendAdminShell from '../BackendAdminShell';
import { formatBackendAdminStatus, getBackendAdminDict, getBackendAdminUi } from '../locale';
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
  const params = useParams();
  const t = getBackendAdminDict(params.lang).availability;

  return (
    <BackendAdminShell
      label={t.label}
      title={t.title}
      subtitle={t.subtitle}
      contentClass="max-w-6xl mx-auto space-y-6"
    >
      {({ session, restaurantId }) => (
        <AvailabilityContent session={session} restaurantId={restaurantId} />
      )}
    </BackendAdminShell>
  );
}

function AvailabilityContent({
  session,
  restaurantId,
}: {
  session: BackendLoginResponse;
  restaurantId: string;
}) {
  const params = useParams();
  const t = getBackendAdminDict(params.lang);
  const ui = getBackendAdminUi(params.lang);

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

  const loadSettings = useCallback(() => {
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
        setLoadError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadAvailabilitySettings);
        setLoadStatus('error');
      });
  }, [session, restaurantId, ui]);

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
        setBlackoutListError(err instanceof BackendApiError ? err.message : ui.messages.failedToLoadAvailabilitySettings);
        setBlackoutListStatus('error');
      });
  }, [session, restaurantId, blackoutStatusFilter, ui]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBlackoutList();
  }, [loadBlackoutList]);

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
        setSaveError(ui.messages.openingHoursInvalidJson);
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
      setSaveMessage(ui.messages.settingsSaved);
      setReadOnly(false);
    } catch (err) {
      if (err instanceof BackendApiError && err.status === 403) {
        setReadOnly(true);
        setSaveError(ui.messages.noPermissionAvailability);
      } else {
        setSaveError(err instanceof BackendApiError ? err.message : ui.messages.failedToSaveAvailabilitySettings);
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
      setCreateBlackoutError(err instanceof BackendApiError ? err.message : ui.messages.failedToCreateBlackoutDate);
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
      setBlackoutActionError(err instanceof BackendApiError ? err.message : ui.messages.failedToDeactivateBlackoutDate);
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
      setBlackoutActionError(err instanceof BackendApiError ? err.message : ui.messages.failedToReactivateBlackoutDate);
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
      setSlotCheckError(err instanceof BackendApiError ? err.message : ui.messages.failedToCheckAvailability);
      setSlotCheckStatus('error');
    }
  };

  return loadStatus === 'loading' ? (
          <div className="card p-10 flex items-center justify-center">
            <div
              className="w-8 h-8 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--p-border)', borderTopColor: 'var(--p-accent)' }}
            />
          </div>
        ) : loadStatus === 'error' || !settings || !form ? (
          <div className="card p-6 text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>
              {ui.messages.failedToLoadAvailabilitySettings}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--p-text-4)' }}>{loadError}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {readOnly && (
              <div className="card p-4" style={{ borderColor: '#f59e0b' }}>
                <p className="text-sm font-medium" style={{ color: '#b45309' }}>
                  {t.settingsPage.readOnlyNotice}
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

            <SettingsSection t={t} form={form} onChange={setForm} readOnly={readOnly} />

            {!readOnly && (
              <div className="flex items-center gap-3">
                <button onClick={handleSaveSettings} disabled={saveStatus === 'loading'} className="btn-primary">
                  {saveStatus === 'loading' ? t.common.saving : t.common.save}
                </button>
                <button onClick={loadSettings} className="btn-ghost">
                  {t.common.refresh}
                </button>
              </div>
            )}

            <BlackoutSection
              t={t}
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
              t={t}
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
        );
}

function SettingsSection({
  t,
  form,
  onChange,
  readOnly,
}: {
  t: ReturnType<typeof getBackendAdminDict>;
  form: SettingsFormState;
  onChange: (updater: (prev: SettingsFormState | null) => SettingsFormState | null) => void;
  readOnly: boolean;
}) {
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
  const set = <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) =>
    onChange((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <div className="card-header">
            <h3 className="card-header-title">{t.availability.sections.reservationRules}</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.reservationsEnabled}
                disabled={readOnly}
                onChange={(e) => set('reservationsEnabled', e.target.checked)}
              />
              <label className="text-sm" style={{ color: 'var(--p-text-2)' }}>{ui.labels.reservationsEnabled}</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={ui.labels.slotIntervalMinutes} value={form.slotIntervalMinutes} readOnly={readOnly} onChange={(v) => set('slotIntervalMinutes', v)} />
              <NumberField label={ui.labels.defaultDurationMinutes} value={form.defaultReservationDurationMinutes} readOnly={readOnly} onChange={(v) => set('defaultReservationDurationMinutes', v)} />
              <NumberField label={ui.labels.minAdvanceMinutes} value={form.minAdvanceMinutes} readOnly={readOnly} onChange={(v) => set('minAdvanceMinutes', v)} />
              <NumberField label={t.availability.sections.bookingWindowDays} value={form.bookingWindowDays} readOnly={readOnly} onChange={(v) => set('bookingWindowDays', v)} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-header-title">{t.availability.sections.bookingLimits}</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={ui.labels.minPartySize} value={form.minPartySize} readOnly={readOnly} onChange={(v) => set('minPartySize', v)} />
              <NumberField label={ui.labels.maxPartySize} value={form.maxPartySize} readOnly={readOnly} onChange={(v) => set('maxPartySize', v)} />
              <NumberField label={ui.labels.maxPerSlotOptional} value={form.maxReservationsPerSlot} readOnly={readOnly} onChange={(v) => set('maxReservationsPerSlot', v)} />
              <NumberField label={ui.labels.manualApprovalPartySize} value={form.manualApprovalThreshold} readOnly={readOnly} onChange={(v) => set('manualApprovalThreshold', v)} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={form.autoConfirm}
                disabled={readOnly}
                onChange={(e) => set('autoConfirm', e.target.checked)}
              />
              <label className="text-sm" style={{ color: 'var(--p-text-2)' }}>{ui.labels.autoConfirmReservations}</label>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-header-title">{t.availability.sections.openingHours}</h3>
        </div>
        <div className="p-5">
          <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
            {t.availability.sections.openingHoursJson}
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
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-header-title">{t.availability.sections.notes}</h3>
        </div>
        <div className="p-5">
          <textarea
            value={form.notes}
            disabled={readOnly}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            className="block w-full rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60"
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
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
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
  const params = useParams();
  const cls = status === 'active' ? 'badge-green' : 'badge-gray';
  return <span className={`badge ${cls}`}>{formatBackendAdminStatus(params.lang, status)}</span>;
}

function BlackoutSection({
  t,
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
  t: ReturnType<typeof getBackendAdminDict>;
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
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">{t.availability.blackoutDates}</h3>
        {!readOnly && (
          <button onClick={onToggleCreateForm} className="btn-primary" style={{ padding: '0.4375rem 0.875rem', fontSize: '0.75rem' }}>
            {ui.labels.addBlackoutDate}
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              {t.common.status}
            </label>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as BlackoutDateStatus | '')}
              className="block rounded-lg px-3 py-2 text-sm outline-none mt-1"
              style={inputStyle}
            >
              <option value="">{t.common.all}</option>
              <option value="active">{formatBackendAdminStatus(params.lang, 'active')}</option>
              <option value="inactive">{formatBackendAdminStatus(params.lang, 'inactive')}</option>
            </select>
          </div>
          <button onClick={onRefresh} className="btn-ghost">
            {t.common.refresh}
          </button>
        </div>

        {showCreateForm && !readOnly && (
          <div className="card p-4 space-y-3">
            {createStatus === 'error' && (
              <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{createError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.dateYmd}</label>
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
                <label className="text-sm" style={{ color: 'var(--p-text-2)' }}>{ui.labels.fullDay}</label>
              </div>
              {!createIsFullDay && (
                <>
                  <div>
                    <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.startHhMm}</label>
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
                    <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.endHhMm}</label>
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
                <label className="text-[10px]" style={{ color: 'var(--p-text-5)' }}>{ui.labels.reasonOptional}</label>
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
              {createStatus === 'loading' ? t.common.saving : ui.labels.saveBlackoutDate}
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
          <div className="ba-empty py-8">
            <div className="ba-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><line x1="8" y1="8" x2="16" y2="16" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--p-text-3)' }}>{ui.labels.noBlackoutDates}</p>
          </div>
        ) : (
          <div className="ba-divide">
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
  t,
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
  t: ReturnType<typeof getBackendAdminDict>;
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
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">{t.availability.slotPreview}</h3>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs" style={{ color: 'var(--p-text-5)' }}>
          {ui.labels.availabilityCheckHelp}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
              {ui.labels.date}
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
              {ui.labels.partySize}
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
              {ui.labels.preferredTimeOptional}
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
            {status === 'loading' ? ui.labels.checking : ui.labels.checkAvailability}
          </button>
        </div>

        {status === 'error' && (
          <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{error}</p>
        )}

        {result && (
          <div className="space-y-3">
            {result.blockedReason && (
              <p className="text-sm font-semibold" style={{ color: '#b45309' }}>
                {ui.labels.blocked}: {result.blockedReason}
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
              <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>{ui.labels.noSlotsGenerated}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {result.availableSlots.map((slot) => (
                  <span
                    key={slot.time}
                    className={`badge ${slot.available ? 'badge-green' : 'badge-gray'}`}
                    title={slot.reason ?? ''}
                  >
                    {slot.time} {slot.available ? `· ${ui.labels.capacity} ${slot.capacity}` : `· ${slot.reason}`}
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
  const params = useParams();
  const ui = getBackendAdminUi(params.lang);
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--p-text-1)' }}>
          {item.localDate}
          {!item.isFullDay && item.startsAtLocal && item.endsAtLocal ? ` · ${item.startsAtLocal}–${item.endsAtLocal}` : ` · ${ui.labels.fullDay}`}
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
              {ui.labels.deactivate}
            </button>
          ) : (
            <button onClick={() => onReactivate(item.id)} className="btn-ghost" style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}>
              {ui.labels.reactivate}
            </button>
          )
        )}
      </div>
    </div>
  );
}
