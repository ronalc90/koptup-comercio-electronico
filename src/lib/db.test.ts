import { describe, it, expect, vi, beforeEach } from 'vitest';

// isTenantSupported decide si las rutas reciben el service client ACOTADO al
// negocio o sin acotar. Debe ser fail-closed: solo "no soportado" cuando la
// columna tenant_id realmente no existe, nunca por un error transitorio.

let probe: { error: { code?: string; message?: string } | null } | 'throw' = { error: null };
let configured = true;

vi.mock('./supabase', () => ({
  get supabaseConfigured() {
    return configured;
  },
  supabase: {
    from: () => ({
      select: () => ({
        limit: () => (probe === 'throw' ? Promise.reject(new Error('fetch failed')) : Promise.resolve(probe)),
      }),
    }),
  },
}));

async function freshIsTenantSupported() {
  vi.resetModules(); // el módulo cachea el `true`: cada caso arranca limpio
  const mod = await import('./db');
  return mod.isTenantSupported;
}

beforeEach(() => {
  probe = { error: null };
  configured = true;
});

describe('isTenantSupported (fail-closed)', () => {
  it('true cuando la consulta a tenant_id responde bien', async () => {
    const isTenantSupported = await freshIsTenantSupported();
    expect(await isTenantSupported()).toBe(true);
  });

  it('false solo si la columna no existe (42703 / PGRST204)', async () => {
    probe = { error: { code: '42703', message: 'column orders.tenant_id does not exist' } };
    expect(await (await freshIsTenantSupported())()).toBe(false);
    probe = { error: { code: 'PGRST204', message: 'column not found in schema cache' } };
    expect(await (await freshIsTenantSupported())()).toBe(false);
  });

  it('un error de red/5xx NO desarma el aislamiento', async () => {
    probe = { error: { code: '', message: 'TypeError: fetch failed' } };
    expect(await (await freshIsTenantSupported())()).toBe(true);
    probe = { error: { code: 'PGRST002', message: 'Could not query the database for the schema cache' } };
    expect(await (await freshIsTenantSupported())()).toBe(true);
  });

  it('una excepción tampoco desarma el aislamiento', async () => {
    probe = 'throw';
    expect(await (await freshIsTenantSupported())()).toBe(true);
  });

  it('sin Supabase configurado (dev con mock) sigue en false', async () => {
    configured = false;
    expect(await (await freshIsTenantSupported())()).toBe(false);
  });

  it('un fallo transitorio no se cachea: el siguiente intento vuelve a consultar', async () => {
    const isTenantSupported = await freshIsTenantSupported();
    probe = { error: { code: '42703' } };
    expect(await isTenantSupported()).toBe(false);
    probe = { error: null };
    expect(await isTenantSupported()).toBe(true);
  });
});
