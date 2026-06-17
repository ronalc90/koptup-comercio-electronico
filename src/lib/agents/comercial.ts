/**
 * Agente Comercial — detecta productos estrella y productos muertos, y
 * recomienda promociones y bundles.
 */
import { buildReport, type AgentMeta, type Finding } from './types';
import type { TenantData } from './types';

export function analyzeComercial(data: TenantData, meta: AgentMeta) {
  const findings: Finding[] = [];
  const { products, orders } = data;

  const salesByProduct = new Map<number, number>();
  for (const p of products) {
    const code = (p.code || '').trim().toLowerCase();
    const name = (p.name || '').trim().toLowerCase();
    let count = 0;
    for (const o of orders) {
      if (o.delivery_status === 'Cancelado') continue;
      const ref = (o.product_ref || '').trim().toLowerCase();
      const text = `${o.detail || ''} ${o.comment || ''}`.toLowerCase();
      if ((code && ref === code) || (name.length >= 3 && text.includes(name))) count++;
    }
    salesByProduct.set(p.id, count);
  }

  const ranked = [...products]
    .filter((p) => p.active !== false)
    .sort((a, b) => (salesByProduct.get(b.id) ?? 0) - (salesByProduct.get(a.id) ?? 0));

  // Productos estrella (top con ventas).
  const stars = ranked.filter((p) => (salesByProduct.get(p.id) ?? 0) > 0).slice(0, 3);
  for (const p of stars) {
    findings.push({
      id: `star-${p.id}`, severity: 'info', title: 'Producto estrella',
      detail: `${p.name} con ${salesByProduct.get(p.id)} venta(s).`, entity: p.name,
      value: salesByProduct.get(p.id) ?? 0,
    });
  }

  // Productos muertos (activos, sin ventas).
  const dead = ranked.filter((p) => (salesByProduct.get(p.id) ?? 0) === 0);
  for (const p of dead) {
    findings.push({
      id: `dead-${p.id}`, severity: 'warning', title: 'Producto muerto',
      detail: `${p.name} no registra ventas. Considerar promoción o descontinuar.`, entity: p.name, value: 0,
    });
  }

  // Recomendación de bundle: estrella + muerto para mover inventario lento.
  if (stars.length && dead.length) {
    findings.push({
      id: 'bundle', severity: 'info', title: 'Bundle recomendado',
      detail: `Combinar "${stars[0].name}" (estrella) con "${dead[0].name}" (lento) en un combo con descuento.`,
      entity: `${stars[0].name} + ${dead[0].name}`,
    });
  }
  // Recomendación de promoción si hay muchos muertos.
  if (dead.length >= 3) {
    findings.push({
      id: 'promo', severity: 'info', title: 'Promoción recomendada',
      detail: `${dead.length} productos sin ventas: lanzar una promoción de liquidación.`,
      entity: 'Catálogo', value: dead.length,
    });
  }

  const summary = products.length === 0
    ? 'Sin catálogo cargado.'
    : `${stars.length} estrella(s), ${dead.length} muerto(s).`;
  return buildReport('comercial', meta, summary, findings);
}
