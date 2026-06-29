/**
 * Política de acceso por ROL (puro, testeable). Separa al rol ADMINISTRATIVO
 * (`admin`) de la operación del negocio:
 *
 *   - admin       → SOLO administra el equipo y la cuenta (usuarios, auditoría,
 *                   configuración, licencia). NO opera el negocio.
 *   - superadmin  → todo (plataforma + negocio + administración).
 *   - member      → opera el negocio (pedidos, inventario, productos, asistente…).
 *   - viewer      → negocio en modo lectura.
 *
 * 'config' (cuenta/perfil propio) está disponible para todos.
 */
import type { ModuleKey } from './modules';
import type { Role } from './tenant';

/** Módulos de OPERACIÓN del negocio (los que el rol `admin` ya NO ve). */
export const BUSINESS_MODULES: ModuleKey[] = [
  'dashboard',
  'pedidos',
  'asistente',
  'inventario',
  'productos',
  'despachos',
  'proveedores',
  'agentes',
];
const BUSINESS_MODULE_SET = new Set<ModuleKey>(BUSINESS_MODULES);

/** Rutas de operación del negocio (espejo de BUSINESS_MODULES, para el guard). */
export const BUSINESS_ROUTES: string[] = [
  '/dashboard',
  '/orders',
  '/assistant',
  '/inventory',
  '/products',
  '/dispatch',
  '/suppliers',
  '/agents',
];

/**
 * Roles ADMINISTRATIVOS (no operan el negocio): `admin` administra su negocio y
 * `superadmin` administra la PLATAFORMA (todos los negocios). Ninguno entra a los
 * módulos de operación (pedidos, inventario, dashboard, etc.).
 */
export function isAdministrativeRole(role: Role): boolean {
  return role === 'admin' || role === 'superadmin';
}

/**
 * ¿El rol puede ver/usar este módulo de la navegación? Los roles administrativos
 * (admin/superadmin) solo ven módulos que NO son de negocio (en la práctica:
 * 'config'); member/viewer ven los módulos de negocio habilitados por el tenant.
 */
export function canAccessModule(role: Role, key: ModuleKey): boolean {
  if (isAdministrativeRole(role)) return !BUSINESS_MODULE_SET.has(key);
  return true;
}

/** ¿La ruta pertenece a la operación del negocio? */
export function isBusinessRoute(pathname: string): boolean {
  return BUSINESS_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
}

/** ¿El rol puede entrar a esta ruta? (admin/superadmin NO entran a rutas de negocio). */
export function canAccessRoute(role: Role, pathname: string): boolean {
  if (isAdministrativeRole(role) && isBusinessRoute(pathname)) return false;
  return true;
}

/**
 * Ruta de inicio según rol: superadmin → Plataforma, admin → Administración,
 * el resto (operación) → Dashboard.
 */
export function homeRouteForRole(role: Role): string {
  if (role === 'superadmin') return '/superadmin';
  if (role === 'admin') return '/admin';
  return '/dashboard';
}
