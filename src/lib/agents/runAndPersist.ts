/**
 * Corre los 5 agentes + el motor de automatizaciones para un negocio y persiste
 * las alertas accionables NUEVAS (deduplicadas: no recrea una alerta que ya está
 * abierta). Lo usa el cron (/api/cron/run-agents) y el disparo manual.
 */
import { getServiceClient, withTenant } from '../supabase';
import { loadTenantData } from './data';
import { analyzeAll } from './all';
import { runAutomations } from '../automations/engine';

export async function runAndPersistForTenant(tenantId: number, tenantSlug: string, now: string): Promise<number> {
  // Cliente acotado al tenant (el service role omite RLS; withTenant filtra).
  const scoped = withTenant(getServiceClient(), tenantId);
  const data = await loadTenantData(scoped);
  const reports = analyzeAll(data, { tenantId, tenantSlug }, now);
  const { alerts } = runAutomations(data, reports, { tenantId, tenantSlug });
  if (!alerts.length) return 0;

  const db = getServiceClient();
  // Dedup: no recrear alertas con el mismo alert_key que sigan SIN resolver.
  const { data: existing } = await db
    .from('alerts')
    .select('alert_key')
    .eq('tenant_id', tenantId)
    .is('resolved_at', null);
  const open = new Set((existing ?? []).map((r) => r.alert_key as string));

  const toInsert = alerts
    .filter((a) => !open.has(a.id))
    .map((a) => ({
      tenant_id: tenantId,
      alert_key: a.id,
      kind: a.kind,
      severity: a.severity,
      title: a.title,
      message: a.message,
      source: a.source,
    }));

  if (toInsert.length) await db.from('alerts').insert(toInsert);
  return toInsert.length;
}
