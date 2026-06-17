import { describe, it, expect } from 'vitest';
import type { Order, Product, InventoryItem } from '../types';
import type { TenantData, AgentMeta } from '../agents/types';
import { analyzeAll } from '../agents/all';
import { runAutomations } from './engine';

const meta: AgentMeta = { tenantId: 1, tenantSlug: 'meraki' };

function order(p: Partial<Order>): Order {
  return {
    id: 0, order_code: '', client_name: '', phone: '', city: '', address: '', complement: '',
    product_ref: '', detail: '', comment: '', value_to_collect: 0, payment_cash: 0, payment_transfer: 0,
    product_cost: 0, delivery_type: '', vendor: '', delivery_status: 'Confirmado', status_complement: '',
    is_exchange: false, order_date: '2026-01-01', dispatch_date: null, guide_number: '', prepaid_amount: 0,
    operating_cost: 0, created_at: '', ...p,
  };
}
function inv(p: Partial<InventoryItem>): InventoryItem {
  return {
    id: 0, basket_location: '', product_id: '', category: 'Pantuflas', type: 'Adulto', reference: 0,
    model: '', color: '', size: '', quantity: 1, status: 'Bueno', observations: '', verified: false,
    created_at: '', ...p,
  };
}
function product(p: Partial<Product>): Product {
  return { id: 0, code: '', name: '', cost: 0, category: 'Pantuflas', active: true, created_at: '', ...p };
}

describe('runAutomations', () => {
  const data: TenantData = {
    orders: [
      order({ id: 1, delivery_status: 'Devolucion', client_name: 'A', phone: '1' }),
      order({ id: 2, is_exchange: true, client_name: 'B', phone: '2' }),
    ],
    products: [product({ id: 9, code: 'P9', name: 'Bolso Muerto' })],
    inventory: [
      inv({ id: 1, quantity: 0, status: 'Bueno', model: 'ZeroModel' }),
      inv({ id: 2, status: 'Malo', model: 'Defectuoso' }),
    ],
    expenses: [],
  };
  const reports = analyzeAll(data, meta, '2026-06-17T00:00:00Z');
  const r = runAutomations(data, reports, meta);

  it('genera reposición automática por el quiebre de stock', () => {
    const repo = r.alerts.find((a) => a.id === 'auto-reposicion');
    expect(repo).toBeTruthy();
    expect(repo?.kind).toBe('reposicion');
    expect(repo?.severity).toBe('critical');
    expect(repo?.suggestedAction).toBe('Generar orden de compra');
  });

  it('alerta de devoluciones y cambios desde los datos', () => {
    const dev = r.alerts.find((a) => a.id === 'auto-devoluciones');
    expect(dev?.kind).toBe('devoluciones');
  });

  it('alerta de garantías por ítems defectuosos', () => {
    const gar = r.alerts.find((a) => a.id === 'auto-garantias');
    expect(gar?.kind).toBe('garantias');
    expect(gar?.value).toBe(1);
  });

  it('convierte el producto muerto en alerta de ventas con acción', () => {
    const ventas = r.alerts.find((a) => a.kind === 'ventas' && a.id.includes('dead-9'));
    expect(ventas?.suggestedAction).toContain('promoción');
  });

  it('los hallazgos info NO se vuelven alertas', () => {
    expect(r.alerts.some((a) => a.id.includes('modules'))).toBe(false);
  });

  it('prioriza por severidad (critical primero)', () => {
    const sev = r.alerts.map((a) => a.severity);
    const firstInfo = sev.indexOf('info');
    const lastCritical = sev.lastIndexOf('critical');
    if (firstInfo !== -1 && lastCritical !== -1) expect(lastCritical).toBeLessThan(firstInfo);
  });
});
