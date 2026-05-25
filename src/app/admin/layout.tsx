'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { logoutAdmin } from './login/action';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (pathname === '/admin/login') return <>{children}</>;

  const navItems = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: '📊' },
    { name: 'Analytics', href: '/admin/analytics', icon: '📈' },
    { name: 'Calendar', href: '/admin/calendar', icon: '📅' },
    { name: 'Reservations', href: '/admin/reservations', icon: '📝' },
    { name: 'Customers', href: '/admin/customers', icon: '👥' },
    { name: 'Tables', href: '/admin/tables', icon: '🪑' },
    { name: 'Menu', href: '/admin/menu', icon: '🍽️' },
    { name: 'Settings', href: '/admin/settings', icon: '⚙️' },
    { name: 'Calls', href: '/admin/calls', icon: '📞' },
    { name: 'Changes', href: '/admin/changes', icon: '🔄' },
    { name: 'Cancellations', href: '/admin/cancellations', icon: '❌' },
    { name: 'Staff Handoffs', href: '/admin/handoffs', icon: '🆘' },
    { name: 'Tool Logs', href: '/admin/tool-logs', icon: '🛠️' },
  ];

  const SidebarNav = () => (
    <>
      <div className="p-5 flex items-center justify-between border-b border-gray-800">
        <h1 className="text-lg font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
          Golden Meat Panel
        </h1>
        <button
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center px-4 py-2.5 rounded-xl transition-all ${
              pathname === item.href
                ? 'bg-orange-600/10 text-orange-500 border border-orange-500/20'
                : 'hover:bg-gray-800 text-gray-400'
            }`}
          >
            <span className="mr-3 text-base">{item.icon}</span>
            <span className="font-medium text-sm">{item.name}</span>
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-800">
        <button
          onClick={async () => {
            await logoutAdmin();
            router.replace('/admin/login');
            router.refresh();
          }}
          className="w-full flex items-center px-4 py-2.5 text-gray-400 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all"
        >
          <span className="mr-3 text-base">🚪</span>
          <span className="text-sm">Logout</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-200">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed on mobile (slide-in), static on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col transition-transform duration-200 md:relative md:translate-x-0 md:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <SidebarNav />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-gray-950/95 backdrop-blur border-b border-gray-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
            Golden Meat Panel
          </span>
        </div>

        <div className="p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
