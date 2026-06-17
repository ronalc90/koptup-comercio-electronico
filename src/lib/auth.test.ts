import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT } from 'jose';

// --- Mocks de dependencias de E/S -------------------------------------------
// `login`/`lookupUser`/`tenantById` hablan con Supabase vía getServiceClient y
// consultan el estado de migración vía isTenantSupported. Para que la suite sea
// PURA y AISLADA (sin tocar prod ni red) interceptamos esas dos fronteras y las
// alimentamos con datos de prueba en memoria.

/** Estado de migración simulado: lo controla cada test. */
let tenantSupported = false;
/** Fila de usuario que la BD simulada devuelve (o null = no existe). */
let userRow: Record<string, unknown> | null = null;
/** Filas de tenants por id. */
const tenantRows: Record<number, { slug: string; name?: string; logo?: string }> = {
  1: { slug: 'meraki', name: 'Meraki', logo: 'logo.png' },
};
/** Identificadores con los que `lookupUser` consultó email/username (para el test de saneo). */
let ilikeCalls: Array<{ column: string; value: string }> = [];

vi.mock('./db', () => ({
  isTenantSupported: () => Promise.resolve(tenantSupported),
}));

vi.mock('./supabase', () => {
  // Builder encadenable mínimo que imita la API de PostgREST usada por auth.ts:
  //   from(table).select(cols).ilike(col, val).limit(n).maybeSingle()
  //   from('tenants').select(cols).eq('id', id).maybeSingle()
  function makeBuilder(table: string) {
    let matchColumn: string | null = null;
    let matchValue: string | null = null;
    const builder: Record<string, unknown> = {
      select: () => builder,
      limit: () => builder,
      ilike: (column: string, value: string) => {
        ilikeCalls.push({ column, value });
        matchColumn = column;
        matchValue = value;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        matchColumn = column;
        matchValue = String(value);
        return builder;
      },
      maybeSingle: () => {
        if (table === 'tenants') {
          const id = Number(matchValue);
          const data = tenantRows[id] ?? null;
          return Promise.resolve({ data, error: null });
        }
        // tabla users: solo hace match si la columna consultada coincide con la
        // fila simulada (email o username), igual que la BD real.
        if (userRow && matchColumn && userRow[matchColumn] != null) {
          const stored = String(userRow[matchColumn]).toLowerCase();
          if (stored === (matchValue ?? '').toLowerCase()) {
            return Promise.resolve({ data: userRow, error: null });
          }
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return builder;
  }
  return {
    getServiceClient: () => ({ from: (table: string) => makeBuilder(table) }),
  };
});

// Importamos DESPUÉS de declarar los mocks (vi.mock se hoistea, pero dejamos
// claro el orden de intención).
import {
  hashPassword,
  verifyPassword,
  createSession,
  verifySession,
  login,
} from './auth';

beforeEach(() => {
  tenantSupported = false;
  userRow = null;
  ilikeCalls = [];
});

describe('hashPassword / verifyPassword', () => {
  it('hace round-trip: el hash valida la contraseña original', async () => {
    const hash = await hashPassword('s3creto-fuerte');
    expect(hash).not.toBe('s3creto-fuerte'); // no es texto plano
    expect(await verifyPassword('s3creto-fuerte', hash)).toBe(true);
  });

  it('rechaza una contraseña distinta', async () => {
    const hash = await hashPassword('correcta-123');
    expect(await verifyPassword('incorrecta-123', hash)).toBe(false);
  });
});

describe('verifySession aislamiento de firma', () => {
  it('rechaza un token firmado con otra clave', async () => {
    // Token con la MISMA forma de claims que createSession, pero firmado con
    // una clave distinta a la que usa el módulo auth: no debe validar.
    const otherKey = new TextEncoder().encode('una-clave-totalmente-distinta-y-larga-000');
    const forged = await new SignJWT({
      username: 'mallory',
      tenantId: 999,
      tenantSlug: 'evil',
      role: 'superadmin',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .setIssuedAt()
      .sign(otherKey);

    expect(await verifySession(forged)).toBeNull();
  });

  it('acepta un token firmado por la propia app (round-trip)', async () => {
    const token = await createSession({
      userId: 1,
      username: 'paola',
      email: null,
      tenantId: 1,
      tenantSlug: 'meraki',
      role: 'admin',
    });
    const ctx = await verifySession(token);
    expect(ctx?.role).toBe('admin');
    expect(ctx?.tenantId).toBe(1);
    expect(ctx?.username).toBe('paola');
  });

  it('rechaza un token corrupto / vacío', async () => {
    expect(await verifySession('no-es-un-jwt')).toBeNull();
    expect(await verifySession('')).toBeNull();
  });
});

describe('verifySession: claim de rol', () => {
  // Mínimo privilegio (auth.ts:53): un rol no reconocido NO debe escalar a admin.
  it('un rol inválido en el token cae a "viewer"', async () => {
    const token = await createSession({
      userId: 7,
      username: 'x',
      email: null,
      tenantId: 1,
      tenantSlug: 'meraki',
      // forzamos un rol fuera del enum para ejercitar el fallback
      role: 'root' as unknown as 'viewer',
    });
    const ctx = await verifySession(token);
    expect(ctx?.role).toBe('viewer');
  });

  it('conserva los roles válidos del enum', async () => {
    for (const role of ['superadmin', 'admin', 'member', 'viewer'] as const) {
      const token = await createSession({
        userId: 1,
        username: 'u',
        email: null,
        tenantId: 1,
        tenantSlug: 'meraki',
        role,
      });
      const ctx = await verifySession(token);
      expect(ctx?.role).toBe(role);
    }
  });
});

describe('login con tabla users (post-migración)', () => {
  async function seedUser(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: 42,
      tenant_id: 1,
      email: 'paola@meraki.test',
      username: 'paola',
      password_hash: await hashPassword('clave-buena-1'),
      role: 'admin',
      active: true,
      ...over,
    };
  }

  it('caso feliz: credenciales correctas devuelven token y contexto', async () => {
    userRow = await seedUser();
    const res = await login('paola', 'clave-buena-1');
    expect(res.success).toBe(true);
    expect(res.token).toBeTruthy();
    expect(res.context?.userId).toBe(42);
    expect(res.context?.tenantId).toBe(1);
    expect(res.context?.tenantSlug).toBe('meraki');
    expect(res.context?.role).toBe('admin');
    // el token emitido debe verificar y conservar el rol
    const ctx = await verifySession(res.token!);
    expect(ctx?.role).toBe('admin');
  });

  it('login por email también funciona (case-insensitive)', async () => {
    userRow = await seedUser();
    const res = await login('PAOLA@MERAKI.TEST', 'clave-buena-1');
    expect(res.success).toBe(true);
    expect(res.context?.email).toBe('paola@meraki.test');
  });

  it('contraseña incorrecta es rechazada', async () => {
    userRow = await seedUser();
    const res = await login('paola', 'clave-mala');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Contraseña incorrecta');
  });

  it('usuario inactivo es rechazado sin verificar contraseña', async () => {
    userRow = await seedUser({ active: false });
    const res = await login('paola', 'clave-buena-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Usuario inactivo');
  });

  it('un rol desconocido en la fila cae a "member" (mínimo privilegio)', async () => {
    userRow = await seedUser({ role: 'dios' });
    const res = await login('paola', 'clave-buena-1');
    expect(res.success).toBe(true);
    expect(res.context?.role).toBe('member');
  });

  it.each(['superadmin', 'admin', 'member', 'viewer'] as const)(
    'propaga el rol %s al contexto y al JWT',
    async (role) => {
      userRow = await seedUser({ role });
      const res = await login('paola', 'clave-buena-1');
      expect(res.success).toBe(true);
      expect(res.context?.role).toBe(role);
      const ctx = await verifySession(res.token!);
      expect(ctx?.role).toBe(role);
    },
  );

  it('post-migración sin fila: no usa el respaldo hardcodeado', async () => {
    // Tabla users existe (migrado) pero el usuario no está: NUNCA debe entrar
    // por el mapa de credenciales en texto plano.
    tenantSupported = true;
    userRow = null;
    const res = await login('paola', '1234');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Usuario no encontrado');
  });
});

describe('login fallback (pre-migración, sin tabla users)', () => {
  it('acepta credenciales de respaldo cuando aún no hay migración', async () => {
    tenantSupported = false;
    userRow = null;
    const res = await login('ronald', '1234');
    expect(res.success).toBe(true);
    expect(res.context?.role).toBe('superadmin');
    expect(res.context?.userId).toBeNull();
    expect(res.context?.tenantSlug).toBe('meraki');
  });

  it('rechaza contraseña incorrecta en el respaldo', async () => {
    tenantSupported = false;
    userRow = null;
    const res = await login('paola', 'no-es-1234');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Contraseña incorrecta');
  });

  it('rechaza un usuario desconocido en el respaldo', async () => {
    tenantSupported = false;
    userRow = null;
    const res = await login('desconocido', '1234');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Usuario no encontrado');
  });
});

describe('lookupUser: saneo del identificador (regresión inyección)', () => {
  it('elimina caracteres peligrosos antes de consultar PostgREST', async () => {
    userRow = await (async () => ({
      id: 1,
      tenant_id: 1,
      email: 'a@b.test',
      username: 'paola',
      password_hash: await hashPassword('clave-buena-1'),
      role: 'admin',
      active: true,
    }))();
    // Intento de inyección de filtro `.or(...)`: comas, paréntesis, asteriscos...
    const malicioso = 'paola,role.eq.superadmin)*';
    await login(malicioso, 'clave-buena-1');
    // Lo que efectivamente llegó a la BD no debe contener ningún metacarácter
    // de filtro PostgREST. Solo quedan [a-z0-9@._-].
    expect(ilikeCalls.length).toBeGreaterThan(0);
    for (const call of ilikeCalls) {
      expect(call.value).toMatch(/^[a-z0-9@._-]*$/i);
      expect(call.value).not.toContain(',');
      expect(call.value).not.toContain('(');
      expect(call.value).not.toContain(')');
      expect(call.value).not.toContain('*');
    }
    // En concreto: 'paola,role.eq.superadmin)*' -> 'paolarole.eq.superadmin'
    expect(ilikeCalls[0].value).toBe('paolarole.eq.superadmin');
  });

  it('un identificador que queda vacío tras sanear no hace match', async () => {
    userRow = await (async () => ({
      id: 1,
      tenant_id: 1,
      email: 'a@b.test',
      username: 'paola',
      password_hash: await hashPassword('clave-buena-1'),
      role: 'admin',
      active: true,
    }))();
    tenantSupported = true; // evita caer al fallback; fuerza el path de tabla
    const res = await login('()*,', 'lo-que-sea');
    expect(res.success).toBe(false);
    // sin caracteres válidos, lookupUser ni siquiera consulta la BD
    expect(ilikeCalls.length).toBe(0);
  });
});
