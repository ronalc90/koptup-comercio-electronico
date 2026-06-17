import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TENANT_TABLES,
  isTenantTable,
  isRole,
  roleAtLeast,
  defaultTenantContext,
  DEFAULT_TENANT_ID,
} from './tenant';
import { getTenantConfig, KNOWN_TENANT_SLUGS } from './tenants.config';
import { withTenant } from './supabase';
import { createSession, verifySession } from './auth';

describe('tenant core', () => {
  it('reconoce las tablas de negocio', () => {
    expect(TENANT_TABLES).toEqual(['products', 'orders', 'inventory', 'settings', 'expenses']);
    expect(isTenantTable('orders')).toBe(true);
    expect(isTenantTable('users')).toBe(false);
    expect(isTenantTable('tenants')).toBe(false);
  });

  it('valida roles y jerarquía', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('superuser')).toBe(false);
    expect(roleAtLeast('admin', 'viewer')).toBe(true);
    expect(roleAtLeast('viewer', 'admin')).toBe(false);
    expect(roleAtLeast('member', 'member')).toBe(true);
  });

  it('el contexto por defecto es meraki/admin', () => {
    const ctx = defaultTenantContext();
    expect(ctx.tenantId).toBe(DEFAULT_TENANT_ID);
    expect(ctx.tenantSlug).toBe('meraki');
    expect(ctx.role).toBe('admin');
  });
});

describe('tenant config', () => {
  it('trae meraki y primeramayo', () => {
    expect(KNOWN_TENANT_SLUGS).toContain('meraki');
    expect(KNOWN_TENANT_SLUGS).toContain('primeramayo');
  });
  it('cae a meraki ante slug desconocido', () => {
    expect(getTenantConfig('no-existe').slug).toBe('meraki');
    expect(getTenantConfig('primeramayo').categories).toContain('Cascos');
    expect(getTenantConfig('meraki').categories).toContain('Pantuflas');
  });
});

// ---- Guard de aislamiento (lo crítico de seguridad) ------------------------
function makeFakeClient() {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  function builder(table: string) {
    const b: Record<string, (...a: unknown[]) => unknown> = {};
    for (const m of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'gt', 'limit', 'order', 'maybeSingle', 'single']) {
      b[m] = (...args: unknown[]) => { calls.push({ table, method: m, args }); return b; };
    }
    return b;
  }
  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, calls };
}

describe('withTenant guard', () => {
  it('inyecta tenant_id en insert', () => {
    const { client, calls } = makeFakeClient();
    withTenant(client, 7).from('orders').insert({ client_name: 'X' });
    const insert = calls.find((c) => c.method === 'insert');
    expect(insert?.args[0]).toEqual({ tenant_id: 7, client_name: 'X' });
  });

  it('inyecta tenant_id en cada fila de un insert por lotes', () => {
    const { client, calls } = makeFakeClient();
    withTenant(client, 3).from('inventory').insert([{ model: 'A' }, { model: 'B' }]);
    const insert = calls.find((c) => c.method === 'insert');
    expect(insert?.args[0]).toEqual([{ tenant_id: 3, model: 'A' }, { tenant_id: 3, model: 'B' }]);
  });

  it('agrega .eq(tenant_id) en select', () => {
    const { client, calls } = makeFakeClient();
    withTenant(client, 9).from('orders').select('*');
    expect(calls.some((c) => c.method === 'select')).toBe(true);
    const eq = calls.find((c) => c.method === 'eq');
    expect(eq?.args).toEqual(['tenant_id', 9]);
  });

  it('acota delete por tenant antes de otros filtros', () => {
    const { client, calls } = makeFakeClient();
    withTenant(client, 4).from('products').delete().eq('id', 99);
    const eqs = calls.filter((c) => c.method === 'eq');
    expect(eqs[0].args).toEqual(['tenant_id', 4]);
    expect(eqs[1].args).toEqual(['id', 99]);
  });

  it('reescribe onConflict de settings a tenant_id,key', () => {
    const { client, calls } = makeFakeClient();
    withTenant(client, 2).from('settings').upsert({ key: 'k', value: 'v' }, { onConflict: 'key' });
    const up = calls.find((c) => c.method === 'upsert');
    expect(up?.args[0]).toEqual({ tenant_id: 2, key: 'k', value: 'v' });
    expect(up?.args[1]).toEqual({ onConflict: 'tenant_id,key' });
  });

  it('el tenant del guard GANA sobre un tenant_id en el payload (no escape)', () => {
    const { client, calls } = makeFakeClient();
    withTenant(client, 7).from('orders').insert({ client_name: 'X', tenant_id: 999 });
    const insert = calls.find((c) => c.method === 'insert');
    expect((insert?.args[0] as { tenant_id: number }).tenant_id).toBe(7);
  });

  it('update NO mueve filas entre tenants y acota por tenant', () => {
    const { client, calls } = makeFakeClient();
    withTenant(client, 5).from('orders').update({ tenant_id: 999, status_complement: 'x' }).eq('id', 1);
    const upd = calls.find((c) => c.method === 'update');
    expect((upd?.args[0] as Record<string, unknown>).tenant_id).toBeUndefined();
    const eqs = calls.filter((c) => c.method === 'eq');
    expect(eqs[0].args).toEqual(['tenant_id', 5]);
    expect(eqs[1].args).toEqual(['id', 1]);
  });

  it('NO toca tablas que no son de negocio', () => {
    const { client, calls } = makeFakeClient();
    withTenant(client, 7).from('users').insert({ email: 'a@b.c' });
    const insert = calls.find((c) => c.method === 'insert');
    expect(insert?.args[0]).toEqual({ email: 'a@b.c' }); // sin tenant_id
  });

  it('passthrough total cuando tenantId es null (pre-migración)', () => {
    const { client, calls } = makeFakeClient();
    withTenant(client, null).from('orders').insert({ client_name: 'X' });
    const insert = calls.find((c) => c.method === 'insert');
    expect(insert?.args[0]).toEqual({ client_name: 'X' }); // sin tenant_id
    expect(calls.some((c) => c.method === 'eq')).toBe(false);
  });
});

describe('session JWT lleva el tenant', () => {
  it('round-trip preserva tenantId, slug y rol', async () => {
    const token = await createSession({
      userId: 5, username: 'ana', email: 'ana@x.com',
      tenantId: 2, tenantSlug: 'primeramayo', role: 'member',
    });
    const ctx = await verifySession(token);
    expect(ctx?.tenantId).toBe(2);
    expect(ctx?.tenantSlug).toBe('primeramayo');
    expect(ctx?.role).toBe('member');
    expect(ctx?.username).toBe('ana');
  });

  it('token inválido devuelve null', async () => {
    expect(await verifySession('garbage.token.here')).toBeNull();
  });
});
