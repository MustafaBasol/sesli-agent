'use client';

import { useState, useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import { type BackendLoginResponse } from '@/lib/backend-endpoints';
import BackendAdminNav from './BackendAdminNav';
import {
  formatBackendAdminRole,
  getBackendAdminDict,
  getBackendAdminUi,
  resolveBackendAdminLang,
  type BackendAdminLang,
} from './locale';

type Status = 'idle' | 'loading' | 'error';
const languageOptions: { value: BackendAdminLang; label: string }[] = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
];

export type BackendAdminShellCtx = {
  session: BackendLoginResponse;
  restaurantId: string;
  onChangeRestaurant: () => void;
};

export function LoginCard({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  status,
  error,
}: {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  status: Status;
  error: string;
}) {
  const params = useParams();
  const t = getBackendAdminDict(params.lang).shell;
  const ui = getBackendAdminUi(params.lang);

  return (
    <div className="card p-8 max-w-sm">
      <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--p-text-1)' }}>
        {t.backendLogin}
      </h3>
      <div className="space-y-3">
        <input
          type="email"
          placeholder={ui.labels.email}
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
          style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-1)' }}
        />
        <input
          type="password"
          placeholder={ui.labels.password}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
          style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-1)' }}
        />
        {error && (
          <p className="text-xs font-medium" style={{ color: '#ef4444' }}>
            {error}
          </p>
        )}
        <button onClick={onSubmit} disabled={status === 'loading'} className="btn-primary w-full justify-center">
          {status === 'loading' ? t.signingIn : t.signIn}
        </button>
      </div>
    </div>
  );
}

export function RestaurantPicker({
  session,
  onSelect,
}: {
  session: BackendLoginResponse;
  onSelect: (id: string) => void;
}) {
  const params = useParams();
  const t = getBackendAdminDict(params.lang).shell;

  return (
    <div className="card p-6 max-w-lg">
      <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--p-text-1)' }}>
        {t.selectRestaurant}
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--p-text-4)' }}>
        {t.signedInAs} {session.user.email} ({formatBackendAdminRole(params.lang, session.user.globalRole ?? 'member')})
      </p>

      {session.accessibleRestaurantIds.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>
          {t.noAccessibleRestaurants}
        </p>
      ) : (
        <div className="space-y-2">
          {session.accessibleRestaurantIds.map((id) => (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-lg text-left"
              style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border-2)', color: 'var(--p-text-2)' }}
            >
              <span className="text-sm font-medium truncate">{id}</span>
              <span className="badge badge-gray shrink-0">{t.select}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Tailwind safelist — keep these classes even when only passed as props:
// max-w-5xl max-w-7xl space-y-4 space-y-6

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function LanguageSwitcher() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const langParam = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const activeLang = resolveBackendAdminLang(langParam);
  const ui = getBackendAdminUi(activeLang);

  const handleLanguageChange = (nextLang: BackendAdminLang) => {
    const segments = pathname.split('/');
    if (segments.length > 1) {
      segments[1] = nextLang;
    }
    router.push(`${segments.join('/') || `/${nextLang}/backend-admin`}${window.location.search}`);
  };

  return (
    <label className="flex items-center gap-2 shrink-0">
      <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
        {ui.labels.language}
      </span>
      <select
        value={activeLang}
        onChange={(e) => handleLanguageChange(e.target.value as BackendAdminLang)}
        aria-label={ui.labels.language}
        className="h-9 max-w-[132px] rounded-lg px-2.5 text-xs font-semibold outline-none"
        style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-2)' }}
      >
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function BackendAdminShell({
  label,
  title,
  subtitle,
  contentClass = 'max-w-7xl mx-auto space-y-6',
  children,
}: {
  label: string;
  title: string;
  subtitle: string;
  contentClass?: string;
  children: (ctx: BackendAdminShellCtx) => React.ReactNode;
}) {
  const params = useParams();
  const dict = getBackendAdminDict(params.lang);
  const t = dict.shell;

  const [session, setSession] = useState<BackendLoginResponse | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<Status>('idle');
  const [loginError, setLoginError] = useState('');

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

  const handleLogin = async () => {
    setLoginStatus('loading');
    setLoginError('');
    try {
      const result = await backendAuth.login(email, password);
      setSession(result);
      if (result.accessibleRestaurantIds.length === 1) {
        backendAuth.setSelectedRestaurantId(result.accessibleRestaurantIds[0]);
        setRestaurantId(result.accessibleRestaurantIds[0]);
      }
      setLoginStatus('idle');
    } catch (err) {
      setLoginError(err instanceof BackendApiError ? err.message : t.loginFailed);
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
  };

  if (!bootstrapped) return null;

  if (!session || !restaurantId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5" data-theme="light" style={{ background: 'var(--p-bg)' }}>
        <div className="w-full max-w-lg space-y-4">
          <div className="text-center mb-2">
            <p className="page-label">{label}</p>
            <h2 className="page-title">{title}</h2>
            <p className="page-subtitle">{subtitle}</p>
          </div>
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
          ) : (
            <RestaurantPicker session={session} onSelect={selectRestaurant} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ba-shell" data-theme="light">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`ba-sidebar fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out md:relative md:translate-x-0 md:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--p-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold leading-none" style={{ color: 'var(--p-text-1)' }}>Golden Meat</p>
              <p className="text-[10px] mt-0.5 font-semibold" style={{ color: 'var(--p-text-5)' }}>{t.backendAdmin}</p>
            </div>
          </div>
          <button
            className="md:hidden p-1.5 rounded-lg transition-all"
            style={{ color: 'var(--p-text-4)' }}
            onClick={() => setSidebarOpen(false)}
            aria-label={dict.common.closeMenu}
          >
            <CloseIcon />
          </button>
        </div>

        <BackendAdminNav onLogout={handleLogout} />

        <div className="px-3 py-3" style={{ borderTop: '1px solid var(--p-border)' }}>
          <div className="ba-restaurant-card">
            <div className="ba-restaurant-avatar">{restaurantId.charAt(0).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--p-text-5)' }}>
                {t.activeRestaurant}
              </p>
              <p className="text-xs font-mono truncate mt-0.5" style={{ color: 'var(--p-text-2)' }}>
                {restaurantId.length > 13 ? `${restaurantId.slice(0, 8)}…${restaurantId.slice(-5)}` : restaurantId}
              </p>
              <button
                onClick={() => setRestaurantId('')}
                className="text-[11px] font-semibold mt-1"
                style={{ color: 'var(--p-accent-text)' }}
              >
                {t.changeRestaurant}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="ba-main">
        <header className="ba-topbar">
          <div className="flex items-center justify-between gap-3 px-4 md:px-7 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 rounded-lg"
                style={{ color: 'var(--p-text-4)', border: '1px solid var(--p-border)' }}
                aria-label={dict.common.openMenu}
              >
                <MenuIcon />
              </button>
              <div className="hidden sm:block min-w-0">
                <div className="relative">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--p-text-5)' }}>
                    <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    placeholder={t.searchPlaceholder}
                    disabled
                    className="w-56 rounded-lg pl-9 pr-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-3)' }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <LanguageSwitcher />
              <div className="hidden sm:flex flex-col items-end leading-none">
                <span className="text-xs font-semibold" style={{ color: 'var(--p-text-1)' }}>{session.user.email}</span>
                <span className="text-[10px] font-medium" style={{ color: 'var(--p-text-5)' }}>
                  {formatBackendAdminRole(params.lang, session.user.globalRole ?? 'member')}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--p-accent-bg)', color: 'var(--p-accent-text)' }}>
                {session.user.email.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-5 md:p-7 page-enter">
          <div className={contentClass}>
            <header className="mb-2">
              <p className="page-label">{label}</p>
              <h2 className="page-title">{title}</h2>
              <p className="page-subtitle">{subtitle}</p>
            </header>

            {children({ session, restaurantId, onChangeRestaurant: () => setRestaurantId('') })}
          </div>
        </main>
      </div>
    </div>
  );
}
