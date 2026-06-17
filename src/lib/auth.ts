import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { getServiceClient } from './supabase';
import { isTenantSupported } from './db';
import {
  type Role,
  type TenantContext,
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_SLUG,
  isRole,
} from './tenant';

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || 'fallback-secret');
const COOKIE_NAME = 'meraki-session';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Firma un JWT con todos los claims de tenant. */
export async function createSession(ctx: TenantContext): Promise<string> {
  const token = await new SignJWT({
    username: ctx.username,
    userId: ctx.userId ?? undefined,
    email: ctx.email ?? undefined,
    tenantId: ctx.tenantId,
    tenantSlug: ctx.tenantSlug,
    role: ctx.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .setIssuedAt()
    .sign(SECRET);
  return token;
}

/**
 * Verifica el token y devuelve el contexto de tenant. Los tokens legacy (sin
 * claims de tenant) se interpretan como meraki/admin para no expulsar sesiones
 * ya abiertas.
 */
export async function verifySession(token: string): Promise<TenantContext | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const role = isRole(payload.role) ? (payload.role as Role) : 'admin';
    return {
      username: (payload.username as string) ?? 'Paola',
      userId: typeof payload.userId === 'number' ? payload.userId : null,
      email: typeof payload.email === 'string' ? payload.email : null,
      tenantId: typeof payload.tenantId === 'number' ? payload.tenantId : DEFAULT_TENANT_ID,
      tenantSlug: typeof payload.tenantSlug === 'string' ? payload.tenantSlug : DEFAULT_TENANT_SLUG,
      role,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<TenantContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

// ---- Fuente de usuarios -----------------------------------------------------
// Antes de la migración (sin tabla `users`) caemos a este mapa hardcodeado para
// no romper el acceso. Tras la migración, la tabla `users` es la fuente real;
// estos siguen funcionando como respaldo si la tabla aún no tiene al usuario.
const FALLBACK_USERS: Record<string, { password: string; role: Role }> = {
  paola: { password: '1234', role: 'admin' },
  ronald: { password: '1234', role: 'admin' },
  lizeth: { password: '1234', role: 'member' },
};

interface UserRow {
  id: number;
  tenant_id: number;
  email: string;
  username: string | null;
  password_hash: string;
  role: string;
  active: boolean;
}

/** Busca un usuario por username o email (case-insensitive). null si no hay tabla. */
async function lookupUser(identifier: string): Promise<UserRow | null> {
  // Saneamos el identificador para que no pueda romper el filtro PostgREST
  // `.or(...)` (inyección de filtros). Solo permitimos caracteres válidos de
  // un login/email; si queda vacío, no hay match.
  const safe = identifier.replace(/[^a-z0-9@._-]/gi, '');
  if (!safe) return null;
  try {
    const db = getServiceClient();
    const cols = 'id, tenant_id, email, username, password_hash, role, active';
    // Dos consultas explícitas en vez de `.or` interpolado: más seguro y claro.
    const byEmail = await db.from('users').select(cols).ilike('email', safe).limit(1).maybeSingle();
    if (byEmail.data) return byEmail.data as UserRow;
    const byUser = await db.from('users').select(cols).ilike('username', safe).limit(1).maybeSingle();
    if (byUser.data) return byUser.data as UserRow;
    return null;
  } catch {
    return null;
  }
}

async function tenantSlugById(id: number): Promise<string> {
  try {
    const db = getServiceClient();
    const { data } = await db.from('tenants').select('slug').eq('id', id).maybeSingle();
    return (data?.slug as string) ?? DEFAULT_TENANT_SLUG;
  } catch {
    return DEFAULT_TENANT_SLUG;
  }
}

export async function login(
  username: string,
  password: string,
): Promise<{ success: boolean; token?: string; context?: TenantContext; error?: string }> {
  const identifier = username.toLowerCase().trim();

  // 1) Fuente real: tabla users (post-migración).
  const row = await lookupUser(identifier);
  if (row) {
    if (!row.active) return { success: false, error: 'Usuario inactivo' };
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) return { success: false, error: 'Contraseña incorrecta' };
    const slug = await tenantSlugById(row.tenant_id);
    const context: TenantContext = {
      userId: row.id,
      username: row.username || row.email,
      email: row.email,
      tenantId: row.tenant_id,
      tenantSlug: slug,
      role: isRole(row.role) ? row.role : 'member',
    };
    return { success: true, token: await createSession(context), context };
  }

  // 2) Respaldo hardcodeado SOLO en estado pre-migración (sin tabla `users`).
  //    Una vez aplicada la migración, la tabla `users` (bcrypt) es la ÚNICA
  //    fuente: nada de credenciales en texto plano puede iniciar sesión.
  if (await isTenantSupported()) {
    return { success: false, error: 'Usuario no encontrado' };
  }
  const fallback = FALLBACK_USERS[identifier];
  if (!fallback) return { success: false, error: 'Usuario no encontrado' };
  if (password !== fallback.password) return { success: false, error: 'Contraseña incorrecta' };

  const context: TenantContext = {
    userId: null,
    username: identifier,
    email: null,
    tenantId: DEFAULT_TENANT_ID,
    tenantSlug: DEFAULT_TENANT_SLUG,
    role: fallback.role,
  };
  return { success: true, token: await createSession(context), context };
}
