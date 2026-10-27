// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import type { Role } from '@/lib/tenant';

// "Vaciar cuenta" borra todos los datos del negocio: solo el admin (o superior).

let sessionRole: Role | null = 'admin';
let deletedTables: string[] = [];

vi.mock('@/lib/auth', () => ({
  getSession: () =>
    Promise.resolve(
      sessionRole
        ? { userId: 1, username: 'u', email: null, tenantId: 3, tenantSlug: 't3', role: sessionRole }
        : null,
    ),
}));

vi.mock('@/lib/tenantServer', () => ({
  getScopedServiceClient: () =>
    Promise.resolve({
      from: (table: string) => ({
        delete: () => ({
          gt: () => {
            deletedTables.push(table);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
}));

import { POST } from './route';

function req(body: unknown): NextRequest {
  return new Request('http://localhost/api/account/wipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  sessionRole = 'admin';
  deletedTables = [];
});

describe('POST /api/account/wipe: autorización por rol', () => {
  it('sin sesión → 401 y no borra nada', async () => {
    sessionRole = null;
    const res = await POST(req({ confirmation: 'Acepto' }));
    expect(res.status).toBe(401);
    expect(deletedTables).toEqual([]);
  });

  it.each(['viewer', 'member'] as const)('rol %s → 403 y no borra nada', async (role) => {
    sessionRole = role;
    const res = await POST(req({ confirmation: 'Acepto' }));
    expect(res.status).toBe(403);
    expect(deletedTables).toEqual([]);
  });

  it('admin con la frase correcta → borra las tablas del negocio', async () => {
    const res = await POST(req({ confirmation: 'Acepto' }));
    expect(res.status).toBe(200);
    expect(deletedTables).toEqual(['orders', 'inventory', 'products', 'expenses', 'alerts', 'suppliers']);
  });

  it('admin sin la frase → 400 y no borra nada', async () => {
    const res = await POST(req({ confirmation: 'si' }));
    expect(res.status).toBe(400);
    expect(deletedTables).toEqual([]);
  });
});
