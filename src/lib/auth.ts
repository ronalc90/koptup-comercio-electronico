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

/**
 * Resuelve el secreto de firma de sesiones (HS256).
 *
 * Reglas de seguridad (Security/DevOps crit) — SIN tumbar un negocio en vivo:
 *   - Si `AUTH_SECRET` está y mide ≥ 32 chars (256 bits, mínimo razonable para
 *     HS256), se usa tal cual.
 *   - En PRODUCCIÓN con secreto ausente/débil: NO se hace fail-fast por defecto
 *     (eso tumbaría la app si el secreto de Vercel no estuviera bien); se loguea
 *     un error FUERTE para que el operador lo corrija (definir AUTH_SECRET en
 *     Vercel). Para forzar el arranque-falla duro una vez verificado el entorno,
 *     definir `AUTH_STRICT_SECRET=1`.
 *   - En dev/test se usa el valor provisto o un secreto de desarrollo explícito
 *     (distinto del antiguo valor por defecto débil ya eliminado).
 */
const MIN_SECRET_LENGTH = 32;
// Valor de desarrollo explícito, distinto del antiguo secreto por defecto débil.
const DEV_SECRET = 'meraki-dev-only-secret-no-usar-en-produccion';

function resolveAuthSecret(): string {
  const provided = process.env.AUTH_SECRET?.trim();
  if (provided && provided.length >= MIN_SECRET_LENGTH) return provided;

  const reason = provided
    ? `AUTH_SECRET es demasiado corta (${provided.length} caracteres; mínimo ${MIN_SECRET_LENGTH}).`
    : 'AUTH_SECRET no está definida.';

  if (process.env.NODE_ENV === 'production') {
    const msg = `[SEGURIDAD] ${reason} Definí un valor aleatorio de ≥${MIN_SECRET_LENGTH} chars `
      + 'en Vercel (openssl rand -hex 32). Con un secreto débil se pueden falsificar sesiones.';
    // Opt-in al fail-fast duro una vez verificado el entorno de producción.
    if (process.env.AUTH_STRICT_SECRET === '1') throw new Error(msg);
    console.error(msg);
  }
  return provided || DEV_SECRET;
}

const SECRET = new TextEncoder().encode(resolveAuthSecret());
const COOKIE_NAME = 'meraki-session';

// Política mínima de contraseñas (Security high / QA P2): al menos 8 caracteres
// y un dígito. Regla simple, compartida por todas las superficies que crean o
// cambian contraseñas, para no duplicar el criterio.
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Valida una contraseña contra la política mínima. Devuelve un mensaje de error
 * claro en español, o `null` si es válida.
 */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (!/[0-9]/.test(password)) {
    return 'La contraseña debe incluir al menos un número';
  }
  return null;
}

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
    tenantName: ctx.tenantName ?? undefined,
    tenantLogo: ctx.tenantLogo ?? undefined,
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
    // Mínimo privilegio: si el claim de rol no es válido, NO asumimos admin.
    const role = isRole(payload.role) ? (payload.role as Role) : 'viewer';
    return {
      username: (payload.username as string) ?? 'Paola',
      userId: typeof payload.userId === 'number' ? payload.userId : null,
      email: typeof payload.email === 'string' ? payload.email : null,
      tenantId: typeof payload.tenantId === 'number' ? payload.tenantId : DEFAULT_TENANT_ID,
      tenantSlug: typeof payload.tenantSlug === 'string' ? payload.tenantSlug : DEFAULT_TENANT_SLUG,
      tenantName: typeof payload.tenantName === 'string' ? payload.tenantName : undefined,
      tenantLogo: typeof payload.tenantLogo === 'string' ? payload.tenantLogo : undefined,
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
  ronald: { password: '1234', role: 'superadmin' },
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

async function tenantById(id: number): Promise<{ slug: string; name?: string; logo?: string }> {
  try {
    const db = getServiceClient();
    const { data } = await db.from('tenants').select('slug, name, logo').eq('id', id).maybeSingle();
    if (!data) return { slug: DEFAULT_TENANT_SLUG };
    return { slug: (data.slug as string) ?? DEFAULT_TENANT_SLUG, name: data.name as string, logo: data.logo as string };
  } catch {
    return { slug: DEFAULT_TENANT_SLUG };
  }
}

// Mensaje único para CUALQUIER fallo de login (no revela si el usuario existe,
// está inactivo o si la contraseña es la incorrecta) — anti-enumeración.
const LOGIN_FAIL = 'Usuario o contraseña incorrectos';

export async function login(
  username: string,
  password: string,
): Promise<{ success: boolean; token?: string; context?: TenantContext; error?: string }> {
  const identifier = username.toLowerCase().trim();

  // 1) Fuente real: tabla users (post-migración).
  const row = await lookupUser(identifier);
  if (row) {
    if (!row.active) return { success: false, error: LOGIN_FAIL };
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) return { success: false, error: LOGIN_FAIL };
    const t = await tenantById(row.tenant_id);
    const context: TenantContext = {
      userId: row.id,
      username: row.username || row.email,
      email: row.email,
      tenantId: row.tenant_id,
      tenantSlug: t.slug,
      tenantName: t.name,
      tenantLogo: t.logo,
      role: isRole(row.role) ? row.role : 'member',
    };
    return { success: true, token: await createSession(context), context };
  }

  // 2) Respaldo hardcodeado SOLO en estado pre-migración (sin tabla `users`).
  //    Una vez aplicada la migración, la tabla `users` (bcrypt) es la ÚNICA
  //    fuente: nada de credenciales en texto plano puede iniciar sesión.
  if (await isTenantSupported()) {
    return { success: false, error: LOGIN_FAIL };
  }
  const fallback = FALLBACK_USERS[identifier];
  if (!fallback) return { success: false, error: LOGIN_FAIL };
  if (password !== fallback.password) return { success: false, error: LOGIN_FAIL };

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
