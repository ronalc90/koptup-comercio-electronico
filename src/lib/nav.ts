import { type ElementType } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Plus,
  Package,
  Tag,
  Truck,
  Boxes,
  Bot,
  Settings,
  ShieldCheck,
  CreditCard,
  Building2,
} from 'lucide-react';
import { tenantNav, type ModuleKey } from './modules';
import { canAccessModule } from './permissions';
import type { Role } from './tenant';

/**
 * Fuente ÚNICA de la navegación (escritorio y móvil). Antes la barra inferior
 * (MobileNav) estaba hardcodeada y divergía del sidebar: ignoraba `navModules` y
 * `moduleLabels` del tenant y omitía módulos (un `member` no podía llegar a
 * Productos/Agentes desde el celular). Construir ambos desde aquí garantiza que
 * el mismo usuario vea el mismo menú en cualquier dispositivo.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: ElementType;
  accent?: boolean;
}

const MODULE_ICONS: Record<ModuleKey, ElementType> = {
  dashboard: LayoutDashboard,
  pedidos: ShoppingBag,
  asistente: Plus,
  inventario: Package,
  productos: Tag,
  despachos: Truck,
  proveedores: Boxes,
  agentes: Bot,
  config: Settings,
};

export function buildNavItems(
  role: Role,
  navModules: ModuleKey[] | undefined,
  moduleLabels?: Partial<Record<ModuleKey, string>>,
): NavItem[] {
  const items: NavItem[] = tenantNav(navModules, moduleLabels)
    .filter((m) => canAccessModule(role, m.key))
    // Proveedores es opt-in: solo aparece si el tenant lo lista explícitamente en
    // navModules (no se filtra a los tenants existentes con navModules undefined).
    .filter((m) => m.key !== 'proveedores' || !!navModules?.includes('proveedores'))
    .map((m) => ({ href: m.route, label: m.label, icon: MODULE_ICONS[m.key], accent: m.accent }));

  // Administración de usuarios: admin y superadmin.
  if (role === 'admin' || role === 'superadmin') {
    items.push({ href: '/admin', label: 'Administración', icon: ShieldCheck });
  }
  // "Mi licencia" es del negocio: solo el admin del negocio. El superadmin NO
  // tiene licencia propia (gestiona la de TODOS los negocios desde Plataforma).
  if (role === 'admin') {
    items.push({ href: '/billing', label: 'Mi licencia', icon: CreditCard });
  }
  // La gestión de la plataforma (todos los negocios) solo al superadmin.
  if (role === 'superadmin') {
    items.push({ href: '/superadmin', label: 'Plataforma', icon: Building2 });
  }
  return items;
}
