/**
 * Núcleo multi-tenant (puro, sin dependencias de IO para poder testearlo).
 *
 * Modelo: cada negocio es un "tenant". Todas las tablas de negocio llevan
 * `tenant_id`. El tenant 1 = "meraki" es el destino del backfill histórico,
 * por eso es el DEFAULT en todos lados (retrocompatibilidad).
 */

/** Tablas de negocio que deben filtrarse SIEMPRE por tenant. */
export const TENANT_TABLES = ['products', 'orders', 'inventory', 'settings', 'expenses'] as const;
export type TenantTable = (typeof TENANT_TABLES)[number];

const TENANT_TABLE_SET: ReadonlySet<string> = new Set(TENANT_TABLES);
export function isTenantTable(table: string): boolean {
  return TENANT_TABLE_SET.has(table);
}

/** Tenant histórico al que pertenecen todos los datos previos a la migración. */
export const DEFAULT_TENANT_ID = 1;
export const DEFAULT_TENANT_SLUG = 'meraki';

export type Role = 'admin' | 'member' | 'viewer';
export const ROLES: Role[] = ['admin', 'member', 'viewer'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}

/** Jerarquía de permisos: admin ⊃ member ⊃ viewer. */
const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2 };
export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  logo: string;
  industry: string;
  active: boolean;
}

/** Datos del usuario autenticado + su tenant, derivados del JWT de sesión. */
export interface TenantContext {
  userId: number | null;
  username: string;
  email: string | null;
  tenantId: number;
  tenantSlug: string;
  role: Role;
}
