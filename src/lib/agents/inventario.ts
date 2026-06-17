/**
 * Agente Inventario — predice quiebres de stock, recomienda compras y detecta
 * productos lentos (con stock pero sin ventas).
 */
import { buildReport, type AgentMeta, type Finding } from './types';
import type { TenantData } from './types';

const LOW_STOCK = 3;
const REORDER_TARGET = 10;

export function analyzeInventario(data: TenantData, meta: AgentMeta) {
  const findings: Finding[] = [];
  const { inventory, orders } = data;

  // Texto de ventas para detectar movimiento por modelo / referencia.
  const salesText = orders
    .map((o) => `${o.product_ref || ''} ${o.detail || ''} ${o.comment || ''}`.toLowerCase())
    .join(' || ');

  for (const it of inventory) {
    if (it.status !== 'Bueno') continue;
    const qty = it.quantity ?? 0;
    const name = it.model || `inv #${it.id}`;

    if (qty <= 0) {
      findings.push({
        id: `stockout-${it.id}`, severity: 'critical', title: 'Quiebre de stock',
        detail: `${name} sin existencias. Reponer a ${REORDER_TARGET}.`, entity: name, value: qty,
      });
    } else if (qty <= LOW_STOCK) {
      findings.push({
        id: `lowstock-${it.id}`, severity: 'warning', title: 'Stock bajo',
        detail: `${name} con ${qty} unidad(es). Recomendado comprar ${REORDER_TARGET - qty}.`,
        entity: name, value: qty,
      });
    }

    // Producto lento: hay stock pero su modelo no aparece en ninguna venta.
    const model = (it.model || '').toLowerCase().trim();
    const moved = model.length >= 3 && salesText.includes(model);
    if (qty > LOW_STOCK && !moved && model) {
      findings.push({
        id: `slow-${it.id}`, severity: 'info', title: 'Producto lento',
        detail: `${name} tiene ${qty} en stock pero sin ventas registradas.`, entity: name, value: qty,
      });
    }
  }

  const critical = findings.filter((f) => f.severity === 'critical').length;
  const low = findings.filter((f) => f.severity === 'warning').length;
  const summary = inventory.length === 0
    ? 'Sin inventario cargado.'
    : `${critical} quiebre(s), ${low} con stock bajo, ${findings.filter((f) => f.severity === 'info').length} lento(s).`;

  return buildReport('inventario', meta, summary, findings);
}
