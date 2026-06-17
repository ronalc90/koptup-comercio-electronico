import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordAudit, AUDIT_LABELS } from './audit';

function fakeClient() {
  const calls: { table: string; row: Record<string, unknown> }[] = [];
  const client = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        calls.push({ table, row });
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('recordAudit', () => {
  it('inserta en audit_log con los campos mapeados', async () => {
    const { client, calls } = fakeClient();
    await recordAudit(client, {
      tenantId: 2,
      actor: { userId: 1, username: 'ronald', role: 'superadmin' },
      action: 'payment_recorded',
      entity: 'charge',
      detail: { amount: 49900 },
    });
    expect(calls[0].table).toBe('audit_log');
    expect(calls[0].row).toMatchObject({
      tenant_id: 2, actor_id: 1, actor_name: 'ronald', actor_role: 'superadmin',
      action: 'payment_recorded', entity: 'charge',
    });
    expect(calls[0].row.detail).toEqual({ amount: 49900 });
  });

  it('es best-effort: no lanza si el insert falla', async () => {
    const client = {
      from: () => ({ insert: () => Promise.reject(new Error('boom')) }),
    } as unknown as SupabaseClient;
    await expect(
      recordAudit(client, { tenantId: 1, actor: { userId: null, username: 'x', role: 'admin' }, action: 'user_created' }),
    ).resolves.toBeUndefined();
  });

  it('tiene etiqueta para cada acción', () => {
    for (const a of ['payment_recorded', 'plan_changed', 'tenant_created', 'tenant_status_changed', 'user_created', 'user_updated'] as const) {
      expect(AUDIT_LABELS[a]).toBeTruthy();
    }
  });
});
