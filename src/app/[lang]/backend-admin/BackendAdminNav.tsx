'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

export default function BackendAdminNav({ onLogout }: { onLogout: () => void }) {
  const params = useParams();
  const pathname = usePathname();
  const lang = typeof params.lang === 'string' ? params.lang : 'en';

  const links = [
    { href: `/${lang}/backend-admin`, label: 'Dashboard' },
    { href: `/${lang}/backend-admin/reservation-requests`, label: 'Reservation Requests' },
    { href: `/${lang}/backend-admin/reservations`, label: 'Reservations' },
    { href: `/${lang}/backend-admin/tables`, label: 'Tables' },
    { href: `/${lang}/backend-admin/customers`, label: 'Customers' },
    { href: `/${lang}/backend-admin/conversations`, label: 'Conversations' },
    { href: `/${lang}/backend-admin/integrations`, label: 'Integrations' },
    { href: `/${lang}/backend-admin/team`, label: 'Team' },
    { href: `/${lang}/backend-admin/settings`, label: 'Settings' },
    { href: `/${lang}/backend-admin/availability`, label: 'Availability' },
  ];

  return (
    <nav className="flex items-center gap-1.5">
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={
              isActive
                ? { background: 'var(--p-accent)', color: 'var(--p-accent-contrast, #fff)' }
                : { color: 'var(--p-text-3)' }
            }
          >
            {link.label}
          </Link>
        );
      })}
      <button onClick={onLogout} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: 'var(--p-text-3)' }}>
        Logout
      </button>
    </nav>
  );
}
