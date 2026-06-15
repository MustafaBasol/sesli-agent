'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginAdmin } from './action';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('admin-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  const doLogin = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    const result = await loginAdmin(password);
    if (result.success) {
      router.replace('/admin/dashboard');
      router.refresh();
    } else {
      setError(result.error || 'Giriş başarısız.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#080b0f] flex items-center justify-center p-6 relative overflow-hidden" style={{ backgroundColor: 'var(--p-bg, #080b0f)' }}>
      {/* Background radial glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl" style={{ background: 'rgba(99,102,241,0.04)' }} />
        <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(99,102,241,0.025)' }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo mark */}
        <div className="flex justify-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-2xl shadow-orange-900/40">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
              <path d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/>
            </svg>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#0d1117] border border-white/[0.08] rounded-3xl p-8 shadow-2xl">
          {/* Top accent */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent to-transparent" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent)' }} />

          <div className="text-center mb-8">
            <h1 className="text-xl font-bold text-white">Golden Meat</h1>
            <p className="text-sm text-gray-500 mt-1">Admin Panel — Secure Access</p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
              </div>
              <input
                type="password"
                placeholder="Admin Password"
                className="w-full bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.14] rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-gray-600 outline-none transition-all" style={{ '--tw-ring-color': 'rgba(99,102,241,0.5)' } as React.CSSProperties}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = ''; }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doLogin()}
                autoFocus
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-red-400 shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-xs font-medium text-red-400">{error}</p>
              </div>
            )}

            <button
              onClick={doLogin}
              disabled={loading}
              className="w-full disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all text-sm active:scale-[0.98]"
              style={{ background: '#4f46e5', boxShadow: '0 4px 14px rgba(79,70,229,0.3)' }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#4338ca'; }}
              onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#4f46e5'; }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Verifying...
                </span>
              ) : 'Sign In'}
            </button>
          </div>

          <p className="mt-6 text-[10px] text-gray-700 text-center uppercase tracking-[0.12em] font-medium">
            Protected by Golden AI · v2.0
          </p>
        </div>
      </div>
    </div>
  );
}
