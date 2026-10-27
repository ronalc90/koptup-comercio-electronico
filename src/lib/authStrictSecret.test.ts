// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// El secreto de sesión se resuelve al CARGAR auth.ts, así que cada caso stubbea
// el entorno, limpia la caché de módulos y vuelve a importarlo.
// AUTH_STRICT_SECRET activa el fail-fast en producción con `1` o `true`.

vi.mock('./db', () => ({ isTenantSupported: () => Promise.resolve(false) }));
vi.mock('./supabase', () => ({ getServiceClient: () => ({}) }));

async function loadAuth() {
  vi.resetModules();
  return import('./auth');
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('AUTH_SECRET', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('AUTH_STRICT_SECRET en producción con AUTH_SECRET débil', () => {
  it.each(['1', 'true', 'TRUE', 'True', ' true '])('"%s" → no arranca (lanza)', async (value) => {
    vi.stubEnv('AUTH_STRICT_SECRET', value);
    await expect(loadAuth()).rejects.toThrow(/AUTH_SECRET/);
  });

  it.each(['', '0', 'false', 'yes', 'si'])('"%s" → solo avisa por consola y arranca', async (value) => {
    vi.stubEnv('AUTH_STRICT_SECRET', value);
    await expect(loadAuth()).resolves.toBeDefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[SEGURIDAD]'));
  });

  it('secreto corto también dispara el fail-fast con "true"', async () => {
    vi.stubEnv('AUTH_SECRET', 'corto');
    vi.stubEnv('AUTH_STRICT_SECRET', 'true');
    await expect(loadAuth()).rejects.toThrow(/demasiado corta/);
  });

  it('con AUTH_SECRET fuerte, "true" no impide arrancar', async () => {
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32));
    vi.stubEnv('AUTH_STRICT_SECRET', 'true');
    await expect(loadAuth()).resolves.toBeDefined();
  });

  it('fuera de producción "true" no lanza (dev/test usan el secreto de desarrollo)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_STRICT_SECRET', 'true');
    await expect(loadAuth()).resolves.toBeDefined();
  });
});
