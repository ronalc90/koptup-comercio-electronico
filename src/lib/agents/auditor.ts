/**
 * Agente Auditor — detecta errores de negocio y datos inconsistentes:
 *   · pedidos duplicados
 *   · inventario negativo
 *   · productos sin margen (venta ≤ costo)
 *   · pedidos entregados/pagados sin recaudo registrado
 *   · pedidos sin datos mínimos (cliente / teléfono)
 */
import { buildReport, type AgentMeta, type Finding } from './types';
import type { TenantData } from './types';
import { getCourierPending } from '../types';

function realizedPayments(o: TenantData['orders'][number]): number {
  return (o.payment_cash || 0) + (o.payment_transfer || 0) + getCourierPending(o) + (o.prepaid_amount || 0);
}

export function analyzeAuditor(data: TenantData, meta: AgentMeta) {
  const findings: Finding[] = [];
  const { orders, inventory } = data;

  // 1) Pedidos duplicados: mismo cliente + teléfono + valor el mismo día.
  const seen = new Map<string, number>();
  for (const o of orders) {
    const key = `${(o.client_name || '').trim().toLowerCase()}|${(o.phone || '').trim()}|${o.value_to_collect || 0}|${o.order_date}`;
    const prev = seen.get(key) ?? 0;
    seen.set(key, prev + 1);
    if (prev >= 1 && (o.client_name || o.phone)) {
      findings.push({
        id: `dup-${o.id}`,
        severity: 'warning',
        title: 'Posible pedido duplicado',
        detail: `"${o.client_name || 's/n'}" con el mismo valor y fecha aparece ${prev + 1} veces.`,
        entity: `pedido #${o.id}`,
        value: o.value_to_collect || 0,
      });
    }
  }

  // 2) Inventario negativo.
  for (const it of inventory) {
    if ((it.quantity ?? 0) < 0) {
      findings.push({
        id: `neg-inv-${it.id}`,
        severity: 'critical',
        title: 'Inventario negativo',
        detail: `${it.model || 'ítem'} tiene cantidad ${it.quantity}.`,
        entity: it.model || `inv #${it.id}`,
        value: it.quantity,
      });
    }
  }

  // 3) Productos sin margen: lo recaudado no cubre costo + operación.
  for (const o of orders) {
    if (o.delivery_status === 'Cancelado' || o.delivery_status === 'Devolucion') continue;
    const income = realizedPayments(o) || (o.value_to_collect || 0);
    const cost = (o.product_cost || 0) + (o.operating_cost || 0);
    if (income > 0 && income - cost <= 0) {
      findings.push({
        id: `nomargin-${o.id}`,
        severity: 'warning',
        title: 'Pedido sin margen',
        detail: `Ingreso ${income} ≤ costo ${cost} (margen ${income - cost}).`,
        entity: `pedido #${o.id}`,
        value: income - cost,
      });
    }
  }

  // 4) Entregado/Pagado sin recaudo registrado pese a tener valor a cobrar.
  for (const o of orders) {
    if ((o.delivery_status === 'Entregado' || o.delivery_status === 'Pagado')
      && (o.value_to_collect || 0) > 0 && realizedPayments(o) === 0) {
      findings.push({
        id: `nopay-${o.id}`,
        severity: 'warning',
        title: 'Entregado sin recaudo',
        detail: `Pedido marcado "${o.delivery_status}" con valor ${o.value_to_collect} pero sin pago registrado.`,
        entity: `pedido #${o.id}`,
        value: o.value_to_collect || 0,
      });
    }
  }

  // 5) Datos mínimos faltantes.
  for (const o of orders) {
    if (!(o.client_name || '').trim() || !(o.phone || '').trim()) {
      findings.push({
        id: `incomplete-${o.id}`,
        severity: 'info',
        title: 'Pedido con datos incompletos',
        detail: 'Falta nombre de cliente o teléfono.',
        entity: `pedido #${o.id}`,
      });
    }
  }

  const summary = findings.length
    ? `${findings.length} hallazgo(s): ${findings.filter((f) => f.severity === 'critical').length} críticos.`
    : 'Sin inconsistencias detectadas. Datos saludables.';

  return buildReport('auditor', meta, summary, findings);
}
