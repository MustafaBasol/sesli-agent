'use client';

import { useState, useEffect } from 'react';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import { type BackendLoginResponse } from '@/lib/backend-endpoints';
import BackendAdminNav from './BackendAdminNav';

type Status = 'idle' | 'loading' | 'error';

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
  return (
    <div className="card p-8 max-w-sm">
      <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--p-text-1)' }}>
        Backend login
      </h3>
      <div className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
          style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-1)' }}
        />
        <input
          type="password"
          placeholder="Password"
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
          {status === 'loading' ? 'Signing in...' : 'Sign in'}
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
  return (
    <div className="card p-6 max-w-lg">
      <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--p-text-1)' }}>
        Select a restaurant
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--p-text-4)' }}>
        Signed in as {session.user.email} ({session.user.globalRole ?? 'no role'})
      </p>

      {session.accessibleRestaurantIds.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--p-text-4)' }}>
          No accessible restaurants for this account.
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
              <span className="badge badge-gray shrink-0">Select</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Tailwind safelist — keep these classes even when only passed as props:
// max-w-5xl max-w-7xl space-y-4 space-y-6

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
  const [session, setSession] = useState<BackendLoginResponse | null>(null);
  const [restaurantId, setRestaurantId] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);

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
  };

  if (!bootstrapped) return null;

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: 'var(--p-bg)' }}>
      <div className={contentClass}>
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="page-label">{label}</p>
              <h2 className="page-title">{title}</h2>
              <p className="page-subtitle">{subtitle}</p>
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
        ) : (
          children({ session, restaurantId, onChangeRestaurant: () => setRestaurantId('') })
        )}
      </div>
    </div>
  );
}
