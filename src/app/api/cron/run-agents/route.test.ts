// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// El cron no manda cookie: se autoriza con `Authorization: Bearer <CRON_SECRET>`
// (comparado en tiempo constante) o, a mano, con sesión de superadmin.

const SECRET = 'cron-secreto-de-prueba-0123456789';
let tenantsQueried = false;

vi.mock('@/lib/auth', () => ({ getSession: () => Promise.resolve(null) }));
vi.mock('@/lib/agents/runAndPersist', () => ({ runAndPersistForTenant: () => Promise.resolve(0) }));
vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => {
          tenantsQueried = true;
          return Promise.resolve({ data: [], error: null });
        },
      }),
    }),
  }),
}));

import { GET } from './route';

function req(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new Request('http://localhost/api/cron/run-agents', { headers }) as unknown as NextRequest;
}

beforeEach(() => {
  tenantsQueried = false;
  vi.stubEnv('CRON_SECRET', SECRET);
});

describe('GET /api/cron/run-agents: autorización', () => {
  it('Bearer correcto → 200 y corre', async () => {
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(tenantsQueried).toBe(true);
  });

  it.each([`Bearer ${SECRET.slice(0, -1)}`, `Bearer ${SECRET}0`, 'Bearer ', ''])(
    'Bearer incorrecto (%s) y sin sesión → 401',
    async (auth) => {
      const res = await GET(req(auth));
      expect(res.status).toBe(401);
      expect(tenantsQueried).toBe(false);
    },
  );

  it('sin CRON_SECRET configurado, "Bearer " vacío no autoriza', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await GET(req('Bearer '));
    expect(res.status).toBe(401);
  });
});
