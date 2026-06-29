'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ElementType } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Plus,
  Package,
  Truck,
  Settings,
  ShieldCheck,
  CreditCard,
  Building2,
  Boxes,
} from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';

type NavItem = { href: string; label: string; icon: ElementType; isAccent?: boolean };

// Operación del negocio (member/viewer).
const BUSINESS_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/orders', label: 'Pedidos', icon: ShoppingBag },
  { href: '/assistant', label: 'Asistente', icon: Plus, isAccent: true },
  { href: '/inventory', label: 'Inventario', icon: Package },
  { href: '/dispatch', label: 'Despacho', icon: Truck },
  { href: '/settings', label: 'Config', icon: Settings },
];

// Item opcional de proveedores: solo para tenants que lo habilitan explícitamente
// en navModules (no afecta a los tenants existentes). Se inserta antes de Config.
const SUPPLIERS_ITEM: NavItem = { href: '/suppliers', label: 'Proveedores', icon: Boxes };

// El `admin` es administrativo: gestiona equipo y cuenta, no opera el negocio.
const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Equipo', icon: ShieldCheck },
  { href: '/billing', label: 'Licencia', icon: CreditCard },
  { href: '/settings', label: 'Config', icon: Settings },
];

// El `superadmin` opera la PLATAFORMA (todos los negocios), no un negocio.
const SUPERADMIN_NAV: NavItem[] = [
  { href: '/superadmin', label: 'Plataforma', icon: Building2 },
  { href: '/admin', label: 'Equipo', icon: ShieldCheck },
  { href: '/settings', label: 'Config', icon: Settings },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { role, config } = useTenant();
  let navItems = role === 'superadmin' ? SUPERADMIN_NAV : role === 'admin' ? ADMIN_NAV : BUSINESS_NAV;
  // Negocios que habilitan proveedores explícitamente ven el acceso en móvil.
  if (navItems === BUSINESS_NAV && config.navModules?.includes('proveedores')) {
    navItems = [...BUSINESS_NAV.slice(0, -1), SUPPLIERS_ITEM, BUSINESS_NAV[BUSINESS_NAV.length - 1]];
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Safe area background */}
      <div className="bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-[0_-1px_0_0_rgba(0,0,0,0.06)]">
        <div className="flex items-end justify-around px-1 pt-2 pb-2 max-w-screen overflow-hidden" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          {navItems.map(({ href, label, icon: Icon, isAccent }) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href) && href !== '/orders');
            const isNewOrder = isAccent;

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
