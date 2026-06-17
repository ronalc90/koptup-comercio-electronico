/**
 * Helpers de tenant para el SERVIDOR (rutas API / componentes server).
 *
 * Regla de oro: en el servidor el tenant SIEMPRE se resuelve por request desde
 * la sesión. Nunca se usa el singleton del navegador (`setActiveTenant`), que
 * sería un leak entre requests. Las rutas obtienen aquí un service client ya
 * acotado al tenant del usuario autenticado.
 *
 * IMPORTANTE: sin sesión válida NO se entrega cliente — la ruta debe responder
 * 401. No existe un "contexto por defecto" silencioso: eso abriría las rutas a
 * usuarios sin autenticar operando como admin del tenant 1.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSession } from './auth';
import { getServiceClient, withTenant } from './supabase';
import { isTenantSupported } from './db';
import { type TenantContext } from './tenant';

/** Contexto de la sesión, o null si no hay sesión válida. */
export async function getTenantContext(): Promise<TenantContext | null> {
  return getSession();
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

/**
 * Resuelve la sesión y devuelve el cliente ya acotado al tenant. Devuelve
 * `null` si NO hay sesión válida: la ruta debe responder 401 en ese caso.
 */
export async function getRequestScopedClient(): Promise<{ ctx: TenantContext; client: SupabaseClient } | null> {
  const ctx = await getSession();
  if (!ctx) return null;
  const client = await getScopedServiceClient(ctx);
  return { ctx, client };
}
