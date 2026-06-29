'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useTenant } from '@/lib/TenantContext';
import { useUser } from '@/lib/UserContext';
import { roleLabel } from '@/lib/tenant';
import { buildNavItems } from '@/lib/nav';
import { PLATFORM_BRAND } from '@/lib/platform';
import { isLogoUrl } from '@/components/shared/LogoPicker';

interface SidebarNavProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function SidebarNav({ collapsed, onToggle }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { config, role } = useTenant();
  const username = useUser();
  const [loggingOut, setLoggingOut] = useState(false);

  // El superadmin opera la PLATAFORMA, no un negocio: ve la marca koptup, no la
  // del tenant al que está atada su cuenta.
  const brand = role === 'superadmin'
    ? { logo: PLATFORM_BRAND.logo, name: PLATFORM_BRAND.fullName }
    : { logo: config.logo, name: config.name };

  // Navegación construida desde la fuente compartida (idéntica a la barra móvil).
  const navItems = buildNavItems(role, config.navModules, config.moduleLabels);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      setLoggingOut(false);
    }
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    if (href === '/orders') return pathname === '/orders';
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={`
        hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-40
        bg-white border-r border-gray-100 shadow-sm
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Brand header */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100 min-h-[68px]">
        {isLogoUrl(brand.logo) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo} alt="" className="h-7 w-7 flex-shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="text-2xl flex-shrink-0" aria-hidden="true">
            {brand.logo}
          </span>
        )}
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="font-bold text-gray-900 text-sm leading-tight truncate">
              {brand.name}
            </h1>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0"
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon, accent }) => {
          const active = isActive(href);

          if (accent) {
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm
                  transition-all duration-200 group my-1
                  ${active
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                  }
                `}
              >
                <Icon
                  className={`flex-shrink-0 ${collapsed ? 'mx-auto' : ''} w-5 h-5`}
                  strokeWidth={2.5}
                />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200
                ${active
                  ? 'bg-purple-50 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <Icon
                className={`flex-shrink-0 ${collapsed ? 'mx-auto' : ''} w-5 h-5 ${active ? 'text-purple-600' : ''}`}
                strokeWidth={active ? 2.5 : 2}
              />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-100 p-3">
        <div
          className={`
            flex items-center gap-3 px-2 py-2 rounded-xl
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-purple-700">
              {(username || '?').charAt(0).toUpperCase()}
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate capitalize">{username}</p>
              <p className="text-xs text-gray-400 truncate">{roleLabel(role)}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex justify-center p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors mt-1"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
