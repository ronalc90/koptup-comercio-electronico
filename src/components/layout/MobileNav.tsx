'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTenant } from '@/lib/TenantContext';
import { buildNavItems } from '@/lib/nav';

export default function MobileNav() {
  const pathname = usePathname();
  const { role, config } = useTenant();
  // Misma fuente que el sidebar de escritorio: el menú móvil ya NO diverge
  // (respeta navModules/moduleLabels del tenant y no omite módulos por rol).
  const navItems = buildNavItems(role, config.navModules, config.moduleLabels);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Safe area background */}
      <div className="bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-[0_-1px_0_0_rgba(0,0,0,0.06)]">
        <div className="flex items-end justify-around px-1 pt-2 pb-2 max-w-screen overflow-x-auto" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          {navItems.map(({ href, label, icon: Icon, accent }) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href) && href !== '/orders');
            const isNewOrder = accent;

            if (isNewOrder) {
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center gap-1 flex-1 min-w-0 py-1"
                >
                  <span
                    className={`
                      flex items-center justify-center w-11 h-11 rounded-full shadow-md
                      transition-all duration-200 active:scale-95
                      ${isActive
                        ? 'bg-purple-700 shadow-purple-300'
                        : 'bg-purple-600 shadow-purple-200 hover:bg-purple-700'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </span>
                  <span className={`text-[10px] font-semibold leading-none ${
                    isActive ? 'text-purple-700' : 'text-purple-600'
                  }`}>
                    {label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-1 flex-1 min-w-0 py-1 rounded-xl transition-all duration-200 active:scale-95"
              >
                <span
                  className={`
                    flex items-center justify-center w-8 h-8 rounded-xl transition-colors duration-200
                    ${isActive ? 'bg-purple-50' : ''}
                  `}
                >
                  <Icon
                    className={`w-5 h-5 transition-colors duration-200 ${
                      isActive ? 'text-purple-700' : 'text-gray-400'
                    }`}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </span>
                <span
                  className={`text-[10px] font-medium leading-none transition-colors duration-200 ${
                    isActive ? 'text-purple-700' : 'text-gray-400'
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
