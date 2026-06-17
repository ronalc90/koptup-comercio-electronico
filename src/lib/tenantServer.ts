/**
 * Helpers de tenant para el SERVIDOR (rutas API / componentes server).
 *
 * Regla de oro: en el servidor el tenant SIEMPRE se resuelve por request desde
 * la sesión. Nunca se usa el singleton del navegador (`setActiveTenant`), que
 * sería un leak entre requests. Las rutas obtienen aquí un service client ya
 * acotado al tenant del usuario autenticado.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSession } from './auth';
import { getServiceClient, withTenant } from './supabase';
import { isTenantSupported } from './db';
import { type TenantContext, defaultTenantContext } from './tenant';

/** Contexto de la sesión, o null si no hay sesión válida. */
export async function getTenantContext(): Promise<TenantContext | null> {
  return getSession();
}

/**
 * Contexto de la sesión, cayendo a meraki/admin si no hay sesión. Útil para
 * rutas que hoy no exigen sesión pero deben operar sobre un tenant concreto
 * (preserva el comportamiento previo: todo era del tenant meraki).
 */
export async function getTenantContextOrDefault(): Promise<TenantContext> {
  return (await getSession()) ?? defaultTenantContext();
}

/**
 * Service client acotado al tenant indicado. Si la migración multi-tenant aún
 * no corrió (`isTenantSupported() === false`) devuelve el cliente SIN acotar,
 * de modo que la app se comporta igual que antes de la migración.
 */
export async function getScopedServiceClient(ctx: TenantContext): Promise<SupabaseClient> {
  const armed = await isTenantSupported();
  return withTenant(getServiceClient(), armed ? ctx.tenantId : null);
}

/** Atajo: resuelve sesión (o default) y devuelve el client ya acotado. */
export async function getRequestScopedClient(): Promise<{ ctx: TenantContext; client: SupabaseClient }> {
  const ctx = await getTenantContextOrDefault();
  const client = await getScopedServiceClient(ctx);
  return { ctx, client };
}
