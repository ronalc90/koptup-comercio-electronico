/**
 * Bitácora de auditoría (T16): registra operaciones sensibles de dinero y
 * seguridad. Best-effort — un fallo al auditar NUNCA rompe la operación.
 * Usa el service client (la tabla audit_log es deny-anon, solo service role).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuditAction =
  | 'payment_recorded'
  | 'plan_changed'
  | 'tenant_created'
  | 'tenant_status_changed'
  | 'user_created'
  | 'user_updated';

export interface AuditActor {
  userId: number | null;
  username: string;
  role: string;
}

export interface AuditEntry {
  /** Negocio afectado por la acción (null para acciones sin tenant). */
  tenantId: number | null;
  actor: AuditActor;
  action: AuditAction;
  entity?: string;
  entityId?: number | null;
  detail?: Record<string, unknown>;
}

export async function recordAudit(client: SupabaseClient, e: AuditEntry): Promise<void> {
  try {
    await client.from('audit_log').insert({
      tenant_id: e.tenantId,
      actor_id: e.actor.userId,
      actor_name: e.actor.username,
      actor_role: e.actor.role,
      action: e.action,
      entity: e.entity ?? null,
      entity_id: e.entityId ?? null,
      detail: e.detail ?? null,
    });
  } catch {
    /* no romper la operación por un fallo de auditoría */
  }
}

/** Etiquetas legibles para la UI. */
export const AUDIT_LABELS: Record<AuditAction, string> = {
  payment_recorded: 'Pago registrado',
  plan_changed: 'Plan cambiado',
  tenant_created: 'Negocio creado',
  tenant_status_changed: 'Estado de negocio cambiado',
  user_created: 'Usuario creado',
  user_updated: 'Usuario actualizado',
};
