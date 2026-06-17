/**
 * Agente QA — revisa integridad de datos y salud del sistema (sustituto puro y
 * determinista de pruebas de UI/API): estados inválidos, fechas futuras,
 * códigos duplicados, campos obligatorios y cobertura de módulos del tenant.
 */
import { buildReport, type AgentMeta, type Finding } from './types';
import type { TenantData } from './types';
import { getTenantConfig } from '../tenants.config';

const VALID_STATUS = new Set(['Confirmado', 'Enviado', 'Entregado', 'Pagado', 'Devolucion', 'Cancelado']);
const VALID_INV_STATUS = new Set(['Bueno', 'Malo']);

export function analyzeQa(data: TenantData, meta: AgentMeta) {
  const findings: Finding[] = [];
  const { orders, products, inventory } = data;
  const today = new Date().toISOString().slice(0, 10);

  // Estados de pedido inválidos.
  for (const o of orders) {
    if (o.delivery_status && !VALID_STATUS.has(o.delivery_status)) {
      findings.push({
        id: `badstatus-${o.id}`, severity: 'warning', title: 'Estado de pedido inválido',
        detail: `"${o.delivery_status}" no es un estado válido.`, entity: `pedido #${o.id}`,
      });
    }
    if (o.order_date && o.order_date > today) {
      findings.push({
        id: `future-${o.id}`, severity: 'warning', title: 'Pedido con fecha futura',
        detail: `Fecha ${o.order_date} es posterior a hoy.`, entity: `pedido #${o.id}`,
      });
    }
  }

  // Códigos de producto duplicados o vacíos.
  const codes = new Map<string, number>();
  for (const p of products) {
    if (!(p.code || '').trim() || !(p.name || '').trim()) {
      findings.push({
        id: `prodfield-${p.id}`, severity: 'warning', title: 'Producto con campos vacíos',
        detail: 'Falta código o nombre.', entity: p.name || `producto #${p.id}`,
      });
    }
    const c = (p.code || '').trim();
    if (c) codes.set(c, (codes.get(c) ?? 0) + 1);
  }
  for (const [code, n] of codes) {
    if (n > 1) findings.push({
      id: `dupcode-${code}`, severity: 'warning', title: 'Código de producto duplicado',
      detail: `El código "${code}" se repite ${n} veces.`, entity: code, value: n,
    });
  }

  // Estados de inventario fuera de rango.
  for (const it of inventory) {
    if (it.status && !VALID_INV_STATUS.has(it.status)) {
      findings.push({
        id: `badinv-${it.id}`, severity: 'info', title: 'Estado de inventario no estándar',
        detail: `"${it.status}" no es Bueno/Malo.`, entity: it.model || `inv #${it.id}`,
      });
    }
  }

  // Cobertura de módulos esperados del tenant (chequeo de "rutas").
  const cfg = getTenantConfig(meta.tenantSlug);
  findings.push({
    id: 'modules', severity: 'info', title: 'Módulos activos del tenant',
    detail: `Habilitados: ${cfg.modules.join(', ')}.`, entity: cfg.name, value: cfg.modules.length,
  });

  const issues = findings.filter((f) => f.severity !== 'info').length;
  const summary = issues
    ? `${issues} problema(s) de integridad detectado(s).`
    : 'Integridad de datos correcta. Sin errores de QA.';

  return buildReport('qa', meta, summary, findings);
}
