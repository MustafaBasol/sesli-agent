'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logoutAdmin } from './login/action';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

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

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-200">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
            Golden Meat Panel
          </h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center px-4 py-3 rounded-xl transition-all ${
                pathname === item.href
                  ? 'bg-orange-600/10 text-orange-500 border border-orange-500/20'
                  : 'hover:bg-gray-800 text-gray-400'
              }`}
            >
              <span className="mr-3 text-lg">{item.icon}</span>
              <span className="font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={async () => {
              await logoutAdmin();
              router.replace('/admin/login');
              router.refresh();
            }}
            className="w-full flex items-center px-4 py-3 text-gray-400 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all"
          >
            <span className="mr-3 text-lg">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
