'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import SidebarNav from './SidebarNav';
import MobileNav from './MobileNav';
import { useTenant } from '@/lib/TenantContext';
import { canAccessRoute, homeRouteForRole } from '@/lib/permissions';

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { role } = useTenant();
  const pathname = usePathname();
  const router = useRouter();

  // Guard por rol: el `admin` (administrativo) no entra a rutas de negocio.
  // Si llega por URL directa o link viejo, lo devolvemos a su inicio (/admin).
  const blocked = !canAccessRoute(role, pathname);
  useEffect(() => {
    if (blocked) router.replace(homeRouteForRole(role));
  }, [blocked, role, router]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <SidebarNav collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      {/* Main content area — offset by sidebar width on desktop */}
      <main
        className={`
          transition-all duration-300 ease-in-out
          ${collapsed ? 'md:ml-16' : 'md:ml-64'}
        `}
      >
        <div className="min-h-screen p-4 md:p-6 lg:p-8 mobile-nav-padding">
          {blocked ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-500">
              Redirigiendo…
            </div>
          ) : (
            children
          )}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
