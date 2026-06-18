import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TENANT_TABLES,
  isTenantTable,
  isRole,
  roleAtLeast,
} from './tenant';
import { getTenantConfig, resolveTenantConfig, KNOWN_TENANT_SLUGS } from './tenants.config';
import { withTenant } from './supabase';
import { createSession, verifySession, validatePassword, MIN_PASSWORD_LENGTH } from './auth';

describe('tenant core', () => {
  it('reconoce las tablas de negocio', () => {
    expect(TENANT_TABLES).toEqual(['products', 'orders', 'inventory', 'settings', 'expenses']);
    expect(isTenantTable('orders')).toBe(true);
    expect(isTenantTable('users')).toBe(false);
    expect(isTenantTable('tenants')).toBe(false);
  });

  it('valida roles y jerarquía (incluye superadmin)', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('superadmin')).toBe(true);
    expect(isRole('superuser')).toBe(false);
    expect(roleAtLeast('admin', 'viewer')).toBe(true);
    expect(roleAtLeast('viewer', 'admin')).toBe(false);
    expect(roleAtLeast('member', 'member')).toBe(true);
    // superadmin ⊃ admin ⊃ member ⊃ viewer
    expect(roleAtLeast('superadmin', 'admin')).toBe(true);
    expect(roleAtLeast('superadmin', 'superadmin')).toBe(true);
    expect(roleAtLeast('admin', 'superadmin')).toBe(false);
  });

});

describe('tenant config', () => {
  it('trae meraki y primeramayo', () => {
    expect(KNOWN_TENANT_SLUGS).toContain('meraki');
    expect(KNOWN_TENANT_SLUGS).toContain('primeramayo');
  });
  it('cae a un base GENÉRICO (no Meraki) ante slug desconocido', () => {
    // Un negocio creado en runtime no debe heredar las categorías de pantuflas.
    const desconocido = getTenantConfig('no-existe');
    expect(desconocido.slug).toBe('generic');
    expect(desconocido.categories).not.toContain('Pantuflas');
    expect(getTenantConfig('primeramayo').categories).toContain('Cascos');
    expect(getTenantConfig('meraki').categories).toContain('Pantuflas');
  });
});

describe('resolveTenantConfig (config efectiva = base + overrides BD)', () => {
  it('mezcla overrides de BD sobre el genérico para un negocio nuevo', () => {
    const cfg = resolveTenantConfig(
      'tienda-nueva',
      { categories: ['Camisas', 'Pantalones'], theme: { primary: '#dc2626' }, ai: { domain: 'ropa' } },
      'Mi Tienda',
      '👕',
    );
    expect(cfg.name).toBe('Mi Tienda');
    expect(cfg.logo).toBe('👕');
    expect(cfg.categories).toEqual(['Camisas', 'Pantalones']);
    expect(cfg.theme.primary).toBe('#dc2626');
    expect(cfg.ai.domain).toBe('ropa');
    // El nombre se interpola en el prompt genérico.
    expect(cfg.ai.systemPrompt).toContain('Mi Tienda');
    expect(cfg.ai.systemPrompt).not.toContain('{name}');
  });

  it('sin overrides respeta la config estática del slug conocido', () => {
    const cfg = resolveTenantConfig('meraki', null, 'Tu Tienda Meraki', '🩴');
    expect(cfg.categories).toContain('Pantuflas');
    expect(cfg.theme.primary).toBe('#7c3aed');
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

describe('política mínima de contraseñas', () => {
  it('exige al menos 8 caracteres', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(validatePassword('a1b2c3')).toMatch(/al menos 8 caracteres/);
    expect(validatePassword('')).toMatch(/al menos 8 caracteres/);
  });

  it('exige al menos un número aunque tenga 8+ caracteres', () => {
    expect(validatePassword('abcdefgh')).toMatch(/al menos un número/);
    expect(validatePassword('contraseña')).toMatch(/al menos un número/);
  });

  it('acepta contraseñas con >=8 caracteres y un número', () => {
    expect(validatePassword('abcd1234')).toBeNull();
    expect(validatePassword('Secreta9')).toBeNull();
    expect(validatePassword('mi-clave-2026')).toBeNull();
  });
});
