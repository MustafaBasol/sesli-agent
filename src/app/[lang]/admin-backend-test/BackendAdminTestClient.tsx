'use client';

import { useState } from 'react';
import { backendAuth } from '@/lib/backend-auth';
import { BackendApiError } from '@/lib/backend-api';
import {
  getDashboardCounts,
  getDashboardSummary,
  type BackendLoginResponse,
  type DashboardCounts,
  type DashboardSummary,
} from '@/lib/backend-endpoints';

export default function BackendAdminTestClient() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState<BackendLoginResponse | null>(null);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await backendAuth.login(email, password);
      setSession(result);
      setSelectedRestaurantId(result.accessibleRestaurantIds[0] ?? '');
      setSummary(null);
      setCounts(null);
    } catch (err) {
      setError(err instanceof BackendApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    backendAuth.logout();
    setSession(null);
    setSelectedRestaurantId('');
    setSummary(null);
    setCounts(null);
  };

  const handleFetchDashboard = async () => {
    const token = backendAuth.getToken();
    if (!token || !selectedRestaurantId) return;
    setLoading(true);
    setError('');
    try {
      const [summaryResult, countsResult] = await Promise.all([
        getDashboardSummary(selectedRestaurantId, token),
        getDashboardCounts(selectedRestaurantId, token),
      ]);
      setSummary(summaryResult);
      setCounts(countsResult);
    } catch (err) {
      setError(err instanceof BackendApiError ? err.message : 'Dashboard fetch failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto', padding: '1rem', fontFamily: 'monospace' }}>
      <h1>Backend Admin Test (dev only)</h1>
      <p style={{ color: '#888' }}>
        Isolated test surface for the new backend API. Does not affect the production Supabase admin login.
      </p>

      {!session ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
          <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button onClick={handleLogin} disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </div>
      ) : (
        <div>
          <p>
            Logged in as <strong>{session.user.email}</strong> ({session.user.globalRole ?? 'no role'})
          </p>
          <button onClick={handleLogout}>Logout</button>

          <div style={{ marginTop: 16 }}>
            <label>
              Restaurant:{' '}
              <select value={selectedRestaurantId} onChange={(e) => setSelectedRestaurantId(e.target.value)}>
                {session.accessibleRestaurantIds.length === 0 && <option value="">(none accessible)</option>}
                {session.accessibleRestaurantIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>{' '}
            <button onClick={handleFetchDashboard} disabled={loading || !selectedRestaurantId}>
              {loading ? 'Loading...' : 'Fetch dashboard'}
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {summary && (
        <div style={{ marginTop: 16 }}>
          <h2>Summary</h2>
          <pre style={{ background: '#111', color: '#0f0', padding: 12, overflow: 'auto' }}>
            {JSON.stringify(summary, null, 2)}
          </pre>
        </div>
      )}

      {counts && (
        <div style={{ marginTop: 16 }}>
          <h2>Counts</h2>
          <pre style={{ background: '#111', color: '#0f0', padding: 12, overflow: 'auto' }}>
            {JSON.stringify(counts, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
