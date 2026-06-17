/**
 * Gate de administración (Fase 5). Las rutas /api/admin gestionan los usuarios y
 * el perfil del PROPIO tenant del admin — nunca de otro. Gestionar otros tenants
 * sería un rol superadmin, fuera de alcance por ahora.
 */
import { getSession } from './auth';
import { roleAtLeast, type TenantContext } from './tenant';

export type AdminGate =
  | { ok: true; ctx: TenantContext }
  | { ok: false; status: number; error: string };

/** Exige sesión con rol admin (o superior). Devuelve el contexto. */
export async function requireAdmin(): Promise<AdminGate> {
  const ctx = await getSession();
  if (!ctx) return { ok: false, status: 401, error: 'No autenticado' };
  if (!roleAtLeast(ctx.role, 'admin')) {
    return { ok: false, status: 403, error: 'Requiere rol de administrador' };
  }
  return { ok: true, ctx };
}

/** Exige rol superadmin (gestión de TODOS los tenants a nivel plataforma). */
export async function requireSuperadmin(): Promise<AdminGate> {
  const ctx = await getSession();
  if (!ctx) return { ok: false, status: 401, error: 'No autenticado' };
  if (!roleAtLeast(ctx.role, 'superadmin')) {
    return { ok: false, status: 403, error: 'Requiere rol de superadmin' };
  }
  return { ok: true, ctx };
}
