'use client';

import { useCallback, useEffect, useState } from 'react';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import {
  getRestaurantSettings,
  updateRestaurantSettings,
  type BackendLoginResponse,
  type RestaurantSettings,
  type UpdateRestaurantSettingsPayload,
} from '@/lib/backend-endpoints';
import { LoginCard, RestaurantPicker } from '../BackendAdminBetaClient';
import BackendAdminNav from '../BackendAdminNav';

type Status = 'idle' | 'loading' | 'error';

type FormState = {
  name: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
  defaultLanguage: string;
};

function toFormState(settings: RestaurantSettings): FormState {
  return {
    name: settings.name,
    phone: settings.phone ?? '',
    email: settings.email ?? '',
    address: settings.address ?? '',
    timezone: settings.timezone,
    defaultLanguage: settings.defaultLanguage,
  };
}

export default function SettingsClient() {
  const [session, setSession] = useState<BackendLoginResponse | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<Status>('idle');
  const [loginError, setLoginError] = useState('');

  const [loadStatus, setLoadStatus] = useState<Status>('idle');
  const [loadError, setLoadError] = useState('');
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const [saveStatus, setSaveStatus] = useState<Status>('idle');
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [readOnly, setReadOnly] = useState(false);

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
    getRestaurantSettings(restaurantId, session.token)
      .then((result) => {
        setSettings(result);
        setForm(toFormState(result));
        setLoadStatus('idle');
      })
      .catch((err) => {
        setLoadError(err instanceof BackendApiError ? err.message : 'Failed to load settings');
        setLoadStatus('error');
      });
  }, [session, restaurantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSettings();
  }, [loadSettings]);

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
  };

  const handleSave = async () => {
    if (!session || !restaurantId || !settings || !form) return;
    setSaveStatus('loading');
    setSaveError('');
    setSaveMessage('');

    const payload: UpdateRestaurantSettingsPayload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      timezone: form.timezone.trim(),
      defaultLanguage: form.defaultLanguage.trim(),
    };

    try {
      const updated = await updateRestaurantSettings(restaurantId, session.token, payload);
      setSettings(updated);
      setForm(toFormState(updated));
      setSaveStatus('idle');
      setSaveMessage('Settings saved.');
      setReadOnly(false);
    } catch (err) {
      if (err instanceof BackendApiError && err.status === 403) {
        setReadOnly(true);
        setSaveError('You do not have permission to update settings for this restaurant.');
      } else {
        setSaveError(err instanceof BackendApiError ? err.message : 'Failed to save settings');
      }
      setSaveStatus('error');
    }
  };

  if (!bootstrapped) return null;

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--p-bg)' }}>
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="page-label">Beta</p>
            <h2 className="page-title">Settings (Beta)</h2>
            <p className="page-subtitle">
              Restaurant profile and organization summary from the new backend API. Separate from the production
              Supabase admin.
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
              Failed to load settings
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
              <div className="card p-4">
                <p className="text-sm font-medium" style={{ color: '#15803d' }}>{saveMessage}</p>
              </div>
            )}
            {saveStatus === 'error' && !readOnly && (
              <div className="card p-4">
                <p className="text-sm font-medium" style={{ color: '#ef4444' }}>{saveError}</p>
              </div>
            )}

            <ProfileSection settings={settings} form={form} onChange={setForm} readOnly={readOnly} />
            <ContactSection form={form} onChange={setForm} readOnly={readOnly} />
            <LocalizationSection form={form} onChange={setForm} readOnly={readOnly} />
            <OrganizationSection settings={settings} />

            {!readOnly && (
              <div className="flex items-center gap-3">
                <button onClick={handleSave} disabled={saveStatus === 'loading'} className="btn-primary">
                  {saveStatus === 'loading' ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  onClick={loadSettings}
                  className="text-xs font-semibold px-3 py-2 rounded-lg"
                  style={{ border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
                >
                  Refresh
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  background: 'var(--p-subtle)',
  border: '1px solid var(--p-border)',
  color: 'var(--p-text-1)',
};

function FieldInput({
  label,
  value,
  onChange,
  readOnly,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg px-3 py-2 text-sm outline-none mt-1 disabled:opacity-60"
        style={inputStyle}
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>{label}</p>
      <p className="text-sm font-medium truncate" style={{ color: 'var(--p-text-1)' }}>{value}</p>
    </div>
  );
}

function ProfileSection({
  settings,
  form,
  onChange,
  readOnly,
}: {
  settings: RestaurantSettings;
  form: FormState;
  onChange: (updater: (prev: FormState | null) => FormState | null) => void;
  readOnly: boolean;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">Restaurant profile</h3>
        <span className="badge badge-gray">{settings.status}</span>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldInput
          label="Name"
          value={form.name}
          readOnly={readOnly}
          onChange={(value) => onChange((prev) => (prev ? { ...prev, name: value } : prev))}
        />
        <ReadOnlyField label="Slug" value={settings.slug} />
      </div>
      <p className="px-5 pb-4 text-[10px]" style={{ color: 'var(--p-text-5)' }}>
        Slug editing will be added later.
      </p>
    </div>
  );
}

function ContactSection({
  form,
  onChange,
  readOnly,
}: {
  form: FormState;
  onChange: (updater: (prev: FormState | null) => FormState | null) => void;
  readOnly: boolean;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">Contact details</h3>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldInput
          label="Phone"
          value={form.phone}
          readOnly={readOnly}
          onChange={(value) => onChange((prev) => (prev ? { ...prev, phone: value } : prev))}
        />
        <FieldInput
          label="Email"
          type="email"
          value={form.email}
          readOnly={readOnly}
          onChange={(value) => onChange((prev) => (prev ? { ...prev, email: value } : prev))}
        />
        <div className="md:col-span-2">
          <FieldInput
            label="Address"
            value={form.address}
            readOnly={readOnly}
            onChange={(value) => onChange((prev) => (prev ? { ...prev, address: value } : prev))}
          />
        </div>
      </div>
    </div>
  );
}

function LocalizationSection({
  form,
  onChange,
  readOnly,
}: {
  form: FormState;
  onChange: (updater: (prev: FormState | null) => FormState | null) => void;
  readOnly: boolean;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">Localization</h3>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldInput
          label="Timezone"
          value={form.timezone}
          readOnly={readOnly}
          onChange={(value) => onChange((prev) => (prev ? { ...prev, timezone: value } : prev))}
        />
        <FieldInput
          label="Default language"
          value={form.defaultLanguage}
          readOnly={readOnly}
          onChange={(value) => onChange((prev) => (prev ? { ...prev, defaultLanguage: value } : prev))}
        />
      </div>
    </div>
  );
}

function OrganizationSection({ settings }: { settings: RestaurantSettings }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">Organization</h3>
        <span className="badge badge-gray">{settings.organization.status}</span>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReadOnlyField label="Name" value={settings.organization.name} />
        <ReadOnlyField label="Created" value={new Date(settings.organization.createdAt).toLocaleString()} />
      </div>
    </div>
  );
}
