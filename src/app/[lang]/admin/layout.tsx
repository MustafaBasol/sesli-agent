'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, type ReactElement } from 'react';
import { logoutAdmin } from './login/action';
import {
  getLocaleFromPathname,
  localeLabels,
  locales,
  stripLocaleFromPathname,
  withLocale,
  type Locale,
} from '@/i18n/config';
import { useI18n } from '@/i18n/provider';

type Theme = 'dark' | 'light';

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
  </svg>
);

const icons: Record<string, ReactElement> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  reservations: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  ),
  customers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  tables: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/>
      <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  calls: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .82h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  ),
  changes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
      <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
    </svg>
  ),
  cancellations: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  ),
  handoffs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  logs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  menu_open: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
};

const navGroups = [
  {
    labelKey: 'admin.navGroups.overview',
    items: [
      { nameKey: 'admin.nav.dashboard',  href: '/admin/dashboard',  icon: 'dashboard' },
      { nameKey: 'admin.nav.analytics',  href: '/admin/analytics',  icon: 'analytics' },
      { nameKey: 'admin.nav.calendar',   href: '/admin/calendar',   icon: 'calendar' },
    ],
  },
  {
    labelKey: 'admin.navGroups.operations',
    items: [
      { nameKey: 'admin.nav.reservations', href: '/admin/reservations', icon: 'reservations' },
      { nameKey: 'admin.nav.customers',    href: '/admin/customers',    icon: 'customers' },
      { nameKey: 'admin.nav.tables',       href: '/admin/tables',       icon: 'tables' },
      { nameKey: 'admin.nav.menu',         href: '/admin/menu',         icon: 'menu' },
    ],
  },
  {
    labelKey: 'admin.navGroups.aiActivity',
    items: [
      { nameKey: 'admin.nav.calls',         href: '/admin/calls',         icon: 'calls' },
      { nameKey: 'admin.nav.changes',       href: '/admin/changes',       icon: 'changes' },
      { nameKey: 'admin.nav.cancellations', href: '/admin/cancellations', icon: 'cancellations' },
      { nameKey: 'admin.nav.handoffs',      href: '/admin/handoffs',      icon: 'handoffs' },
      { nameKey: 'admin.nav.toolLogs',      href: '/admin/tool-logs',     icon: 'logs' },
    ],
  },
  {
    labelKey: 'admin.navGroups.system',
    items: [
      { nameKey: 'admin.nav.settings', href: '/admin/settings', icon: 'settings' },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale: contextLocale, t } = useI18n();
  const locale = getLocaleFromPathname(pathname) || contextLocale;
  const pathWithoutLocale = stripLocaleFromPathname(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const saved = (localStorage.getItem('admin-theme') as Theme) || 'dark';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('admin-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const switchLocale = (nextLocale: Locale) => {
    const nextPath = withLocale(nextLocale, pathWithoutLocale);
    localStorage.setItem('site-locale', nextLocale);
    window.dispatchEvent(new CustomEvent('site-locale-change', { detail: nextLocale }));
    router.replace(nextPath);
  };

  if (pathWithoutLocale === '/admin/login') return <>{children}</>;

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--p-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold leading-none" style={{ color: 'var(--p-text-1)' }}>Golden Meat</p>
            <p className="text-[10px] mt-0.5 font-semibold" style={{ color: 'var(--p-text-5)' }}>{t('admin.status.aiPanel')}</p>
          </div>
        </div>
        <button
          className="md:hidden p-1.5 rounded-lg transition-all"
          style={{ color: 'var(--p-text-4)' }}
          onClick={() => setSidebarOpen(false)}
          aria-label={t('admin.status.closeMenu')}
        >
          {icons.close}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {navGroups.map((group) => (
          <div key={group.labelKey}>
            <p className="px-2 mb-1 text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--p-text-5)' }}>
              {t(group.labelKey)}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathWithoutLocale === item.href;
                const itemName = t(item.nameKey);
                return (
                  <Link
                    key={item.href}
                    href={withLocale(locale, item.href)}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive ? 'nav-active' : ''
                    }`}
                    style={isActive ? {} : { color: 'var(--p-text-4)' }}
                    onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.color = 'var(--p-text-2)'; (e.currentTarget as HTMLElement).style.background = 'var(--p-subtle)'; } }}
                    onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.color = 'var(--p-text-4)'; (e.currentTarget as HTMLElement).style.background = ''; } }}
                  >
                    <span style={isActive ? { color: 'var(--p-accent-text)' } : { color: 'var(--p-text-5)' }}>
                      {icons[item.icon]}
                    </span>
                    <span className="truncate">{itemName}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3" style={{ borderTop: '1px solid var(--p-border)' }}>
        {/* Admin status + theme toggle */}
        <div className="mb-2 px-3 py-2.5 rounded-lg flex items-center justify-between" style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)' }}>
          <div>
            <p className="text-[10px] font-bold" style={{ color: 'var(--p-text-4)' }}>{t('admin.status.admin')}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 status-online shrink-0" />
              <p className="text-[9px] text-green-500 font-semibold uppercase tracking-wider">{t('admin.status.online')}</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? t('admin.status.switchLight') : t('admin.status.switchDark')}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{ color: 'var(--p-text-4)', border: '1px solid var(--p-border)' }}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
        <div className="mb-2 grid grid-cols-3 gap-1" aria-label={t('admin.language.label')}>
          {locales.map((option) => (
            <button
              key={option}
              onClick={() => switchLocale(option)}
              className="h-7 rounded-lg text-[10px] font-bold transition-all"
              style={option === locale
                ? { background: 'var(--p-accent)', color: '#fff' }
                : { background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-4)' }
              }
              type="button"
            >
              {localeLabels[option]}
            </button>
          ))}
        </div>
        <button
          onClick={async () => {
            await logoutAdmin();
            router.replace(withLocale(locale, '/admin/login'));
            router.refresh();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-sm font-medium"
          style={{ color: 'var(--p-text-4)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.06)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--p-text-4)'; (e.currentTarget as HTMLElement).style.background = ''; }}
        >
          {icons.logout}
          <span>{t('admin.status.signOut')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--p-bg)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 admin-sidebar flex flex-col transition-transform duration-200 ease-out md:relative md:translate-x-0 md:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {renderSidebarContent()}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 backdrop-blur" style={{ background: 'color-mix(in srgb, var(--p-bg) 97%, transparent)', borderBottom: '1px solid var(--p-border)' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg transition-all"
            style={{ color: 'var(--p-text-4)' }}
            aria-label={t('admin.status.openMenu')}
          >
            {icons.menu_open}
          </button>
          <span className="text-sm font-bold" style={{ color: 'var(--p-text-1)' }}>Golden Meat</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--p-text-5)' }}>{t('admin.status.aiPanel')}</span>
            <select
              className="rounded-lg text-[10px] font-bold"
              style={{ background: 'var(--p-subtle)', border: '1px solid var(--p-border)', color: 'var(--p-text-4)', padding: '0.25rem' }}
              value={locale}
              aria-label={t('admin.language.label')}
              onChange={(event) => switchLocale(event.target.value as Locale)}
            >
              {locales.map((option) => (
                <option key={option} value={option}>{localeLabels[option]}</option>
              ))}
            </select>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg transition-all"
              style={{ color: 'var(--p-text-4)' }}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>

        <div className="p-5 md:p-7 page-enter">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
