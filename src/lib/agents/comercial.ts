/**
 * Agente Comercial — detecta productos estrella y productos muertos, y
 * recomienda promociones y bundles.
 *
 * Matching producto↔venta: los pedidos no traen el código del producto (su
 * `product_ref` es una categoría genérica como "PANT"/"MAX"), y el `detail` es
 * texto libre. Por eso casamos por:
 *   a) código exacto (cuando aplica), o
 *   b) palabras DISTINTIVAS del nombre (ej. "vaca", "pompom"), ignorando
 *      genéricas ("pantuflas", "maxisaco", "color", "talla"…).
 * Solo marcamos "muerto" cuando el producto es DETERMINABLE (tiene código o
 * algún token distintivo); si no, no podemos afirmar que no vendió.
 */
import { buildReport, type AgentMeta, type Finding } from './types';
import type { TenantData } from './types';

const STOP = new Set([
  'pantuflas', 'pantufla', 'maxisaco', 'maxisacos', 'bolso', 'bolsos', 'pocillo',
  'pocillos', 'accesorio', 'accesorios', 'par', 'pares', 'talla', 'color', 'colores',
  'de', 'con', 'sin', 'para', 'por', 'del', 'las', 'los', 'una', 'uno', 'mi', 'my',
  'the', 'and',
]);

function distinctiveTokens(name: string): string[] {
  return (name || '')
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñ]+/i)
    .filter((t) => t.length >= 4 && !STOP.has(t));
}

export function analyzeComercial(data: TenantData, meta: AgentMeta) {
  const findings: Finding[] = [];
  const { products, orders } = data;

  const active = orders.filter((o) => o.delivery_status !== 'Cancelado');

  const sales = new Map<number, { count: number; determinable: boolean }>();
  for (const p of products) {
    const code = (p.code || '').trim().toLowerCase();
    const toks = distinctiveTokens(p.name);
    const determinable = code.length > 0 || toks.length > 0;
    let count = 0;
    for (const o of active) {
      const ref = (o.product_ref || '').trim().toLowerCase();
      const text = `${o.detail || ''} ${o.comment || ''}`.toLowerCase();
      const codeHit = code.length > 0 && ref === code;
      const tokHit = toks.some((t) => text.includes(t));
      if (codeHit || tokHit) count++;
    }
    sales.set(p.id, { count, determinable });
  }

  const live = products.filter((p) => p.active !== false);
  const ranked = [...live].sort((a, b) => (sales.get(b.id)?.count ?? 0) - (sales.get(a.id)?.count ?? 0));

  // Productos estrella (top con ventas).
  const stars = ranked.filter((p) => (sales.get(p.id)?.count ?? 0) > 0).slice(0, 3);
  for (const p of stars) {
    findings.push({
      id: `star-${p.id}`, severity: 'info', title: 'Producto estrella',
      detail: `${p.name} con ${sales.get(p.id)?.count} venta(s).`, entity: p.name,
      value: sales.get(p.id)?.count ?? 0,
    });
  }

  // Productos muertos: determinables y con 0 ventas.
  const dead = ranked.filter((p) => {
    const s = sales.get(p.id);
    return s?.determinable && s.count === 0;
  });
  for (const p of dead) {
    findings.push({
      id: `dead-${p.id}`, severity: 'warning', title: 'Producto muerto',
      detail: `${p.name} no registra ventas. Considerar promoción o descontinuar.`, entity: p.name, value: 0,
    });
  }

  if (stars.length && dead.length) {
    findings.push({
      id: 'bundle', severity: 'info', title: 'Bundle recomendado',
      detail: `Combinar "${stars[0].name}" (estrella) con "${dead[0].name}" (lento) en un combo con descuento.`,
      entity: `${stars[0].name} + ${dead[0].name}`,
    });
  }
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
