/**
 * Firma de JWT compatibles con Supabase para AISLAMIENTO FORZADO POR LA BASE
 * (ruta de hardening, OPT-IN).
 *
 * Cuando `SUPABASE_JWT_SECRET` está configurada (el JWT secret del proyecto en
 * Supabase → Settings → API), la app firma un token por usuario que lleva el
 * claim `tenant_id` y rol `authenticated`. El cliente del navegador lo usa como
 * bearer, y las políticas RLS de la migración 003 obligan `tenant_id =
 * jwt_tenant_id()` en TODAS las tablas de negocio — el aislamiento deja de
 * depender solo del guard de JS.
 *
 * Si el secret NO está configurado, nada de esto se activa y la app se comporta
 * igual que hoy (cliente anon + guard de JS).
 */
import { SignJWT } from 'jose';

/** Segundos de validez del token (7 días: cubre la sesión sin re-firmar seguido). */
export const SUPABASE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function supabaseJwtSecret(): string | null {
  const s = process.env.SUPABASE_JWT_SECRET;
  return s && s.trim() ? s.trim() : null;
}

export interface MintArgs {
  userId: number | null;
  tenantId: number;
  email?: string | null;
}

/** Firma un JWT que Supabase/PostgREST aceptará y del que RLS leerá tenant_id. */
export async function mintSupabaseToken(
  args: MintArgs,
  secret: string,
  ttlSeconds: number = SUPABASE_TOKEN_TTL_SECONDS,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({
    role: 'authenticated',
    tenant_id: args.tenantId,
    email: args.email ?? undefined,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(args.userId ?? 'app'))
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}
