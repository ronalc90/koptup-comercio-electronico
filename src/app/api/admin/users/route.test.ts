// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import type { Role } from '@/lib/tenant';

// Un admin de negocio no puede degradar, desactivar ni rechazar a un usuario de
// rango superior (el superadmin de la plataforma vive en el tenant 1).

interface Row { id: number; tenant_id: number; role: string; active: boolean; status?: string }
let rows: Row[] = [];
let actorRole: Role = 'admin';
let updates: Array<{ id: unknown; patch: Record<string, unknown> }> = [];

vi.mock('@/lib/admin', () => ({
  requireAdmin: () =>
    Promise.resolve({
      ok: true,
      ctx: { userId: 10, username: 'paola', email: null, tenantId: 1, tenantSlug: 'meraki', role: actorRole },
    }),
}));
vi.mock('@/lib/auth', () => ({
  hashPassword: () => Promise.resolve('hash'),
  validatePassword: () => null,
}));
vi.mock('@/lib/audit', () => ({ recordAudit: () => Promise.resolve() }));
vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      const match = () => rows.filter((r) => Object.entries(filters).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
      const b: Record<string, unknown> = {
        select: () => {
          if (patch) {
            const hit = match();
            hit.forEach((r) => Object.assign(r, patch));
            updates.push({ id: filters.id, patch });
            return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
          }
          return b;
        },
        update: (p: Record<string, unknown>) => { patch = p; return b; },
        eq: (c: string, v: unknown) => { filters[c] = v; return b; },
        maybeSingle: () => Promise.resolve({ data: match()[0] ?? null, error: null }),
      };
      return b;
    },
  }),
}));

import { PATCH } from './route';

function req(body: unknown): NextRequest {
  return new Request('http://localhost/api/admin/users', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  actorRole = 'admin';
  updates = [];
  rows = [
    { id: 1, tenant_id: 1, role: 'superadmin', active: true, status: 'approved' }, // ronald
    { id: 2, tenant_id: 1, role: 'member', active: true, status: 'approved' },
    { id: 3, tenant_id: 1, role: 'admin', active: true, status: 'approved' },
    { id: 4, tenant_id: 2, role: 'member', active: true, status: 'approved' }, // otro negocio
  ];
});

describe('PATCH /api/admin/users: rango del usuario afectado', () => {
  it.each([
    ['degradar', { id: 1, role: 'viewer' }],
    ['desactivar', { id: 1, active: false }],
    ['rechazar', { id: 1, action: 'reject' }],
  ])('un admin NO puede %s al superadmin (403, sin escribir)', async (_label, body) => {
    const res = await PATCH(req(body));
    expect(res.status).toBe(403);
    expect(updates).toEqual([]);
    expect(rows[0]).toMatchObject({ role: 'superadmin', active: true, status: 'approved' });
  });

  it('un admin sí gestiona a un member de su negocio', async () => {
    const res = await PATCH(req({ id: 2, role: 'viewer' }));
    expect(res.status).toBe(200);
    expect(rows[1].role).toBe('viewer');
  });

  it('un admin puede gestionar a otro admin (mismo rango)', async () => {
    const res = await PATCH(req({ id: 3, active: false }));
    expect(res.status).toBe(200);
    expect(rows[2].active).toBe(false);
  });

  it('un usuario de otro negocio → 404 (sin escribir)', async () => {
    const res = await PATCH(req({ id: 4, active: false }));
    expect(res.status).toBe(404);
    expect(updates).toEqual([]);
    expect(rows[3].active).toBe(true);
  });

  it('el superadmin sí puede modificar a otro superadmin', async () => {
    actorRole = 'superadmin';
    const res = await PATCH(req({ id: 1, active: false }));
    expect(res.status).toBe(200);
  });
});
