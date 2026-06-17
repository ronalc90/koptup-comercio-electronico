/**
 * Motor de automatizaciones. Entra: datos del tenant + reportes de los agentes.
 * Sale: alertas accionables priorizadas. Sin IO → determinista y testeable.
 */
import { countSeverities, type AgentReport, type AgentKey, type AgentMeta, type Finding } from '../agents/types';
import type { TenantData } from '../agents/types';
import type { Alert, AlertKind, AutomationResult } from './types';

const KIND_BY_AGENT: Record<AgentKey, AlertKind> = {
  auditor: 'datos',
  qa: 'datos',
  inventario: 'stock',
  financiero: 'finanzas',
  comercial: 'ventas',
};

const ACTION_BY_AGENT: Partial<Record<AgentKey, (f: Finding) => string | undefined>> = {
  inventario: (f) => (f.id.startsWith('stockout-') ? 'Generar orden de compra' : 'Revisar reposición'),
  comercial: (f) => (f.id.startsWith('dead-') ? 'Lanzar promoción o descontinuar' : undefined),
  financiero: (f) => (f.id.startsWith('loss-') ? 'Revisar costos / precio' : undefined),
};

const RANK: Record<Alert['severity'], number> = { critical: 0, warning: 1, info: 2 };

export function runAutomations(
  data: TenantData,
  reports: AgentReport[],
  meta: AgentMeta,
): Omit<AutomationResult, 'generatedAt'> {
  const alerts: Alert[] = [];

  // 1) Hallazgos accionables (critical/warning) de cada agente → alertas.
  for (const r of reports) {
    for (const f of r.findings) {
      if (f.severity === 'info') continue;
      alerts.push({
        id: `${r.agent}-${f.id}`,
        kind: KIND_BY_AGENT[r.agent],
        severity: f.severity,
        title: f.title,
        message: f.detail,
        value: f.value,
        source: r.agent,
        suggestedAction: ACTION_BY_AGENT[r.agent]?.(f),
      });
    }
  }

  // 2) Reposición automática: consolida quiebres + stock bajo en una sugerencia.
  const inv = reports.find((r) => r.agent === 'inventario');
  const toReorder = (inv?.findings ?? []).filter(
    (f) => f.id.startsWith('stockout-') || f.id.startsWith('lowstock-'),
  );
  if (toReorder.length) {
    alerts.push({
      id: 'auto-reposicion',
      kind: 'reposicion',
      severity: toReorder.some((f) => f.id.startsWith('stockout-')) ? 'critical' : 'warning',
      title: `Reposición automática sugerida (${toReorder.length} ítems)`,
      message: `${toReorder.length} producto(s) requieren compra para no quedar sin stock.`,
      suggestedAction: 'Generar orden de compra',
      value: toReorder.length,
      source: 'inventario',
    });
  }

  // 3) Devoluciones / cambios (directo de datos).
  const returns = data.orders.filter((o) => o.delivery_status === 'Devolucion').length;
  const exchanges = data.orders.filter((o) => o.is_exchange).length;
  if (returns > 0 || exchanges > 0) {
    alerts.push({
      id: 'auto-devoluciones',
      kind: 'devoluciones',
      severity: returns >= 3 ? 'warning' : 'info',
      title: `Devoluciones: ${returns} · cambios: ${exchanges}`,
      message: `${returns} devolución(es) y ${exchanges} cambio(s) registrados. Revisar causas si suben.`,
      value: returns,
      source: 'auditor',
    });
  }

  // 4) Garantías / calidad: inventario marcado como defectuoso (status 'Malo').
  const defective = data.inventory.filter((i) => i.status === 'Malo').length;
  if (defective > 0) {
    alerts.push({
      id: 'auto-garantias',
      kind: 'garantias',
      severity: defective >= 3 ? 'warning' : 'info',
      title: `Ítems defectuosos: ${defective}`,
      message: `${defective} ítem(s) marcados como defectuosos (garantía/calidad).`,
      value: defective,
      source: 'inventario',
    });
  }

  alerts.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return { tenantId: meta.tenantId, alerts, counts: countSeverities(alerts) };
}
