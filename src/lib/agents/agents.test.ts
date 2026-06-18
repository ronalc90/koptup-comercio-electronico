import { describe, it, expect } from 'vitest';
import type { Order, Product, InventoryItem } from '../types';
import type { TenantData, AgentMeta } from './types';
import { analyzeAuditor } from './auditor';
import { analyzeQa } from './qa';
import { analyzeInventario } from './inventario';
import { analyzeFinanciero } from './financiero';
import { analyzeComercial } from './comercial';

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

describe('analyzeAuditor', () => {
  const data: TenantData = {
    orders: [
      order({ id: 1, client_name: 'Ana', phone: '300', value_to_collect: 50000 }),
      order({ id: 2, client_name: 'Ana', phone: '300', value_to_collect: 50000 }), // duplicado
      order({ id: 3, delivery_status: 'Entregado', value_to_collect: 30000, client_name: 'B', phone: '1' }), // entregado sin pago
      order({ id: 4, delivery_status: 'Entregado', payment_cash: 10000, product_cost: 10000, operating_cost: 5000, client_name: 'C', phone: '2' }), // sin margen
    ],
    products: [], inventory: [inv({ id: 1, quantity: -2, model: 'NegItem' })], expenses: [],
  };
  const r = analyzeAuditor(data, meta);

  it('detecta duplicado, inventario negativo, sin margen y entregado sin pago', () => {
    expect(r.findings.some((f) => f.id === 'dup-2')).toBe(true);
    expect(r.findings.some((f) => f.id === 'neg-inv-1' && f.severity === 'critical')).toBe(true);
    expect(r.findings.some((f) => f.id === 'nomargin-4')).toBe(true);
    expect(r.findings.some((f) => f.id === 'nopay-3')).toBe(true);
    expect(r.counts.critical).toBeGreaterThanOrEqual(1);
  });
});

describe('analyzeInventario', () => {
  const data: TenantData = {
    orders: [], products: [],
    inventory: [
      inv({ id: 2, quantity: 0, status: 'Bueno', model: 'ZeroModel' }),
      inv({ id: 3, quantity: 2, status: 'Bueno', model: 'LowModel' }),
      inv({ id: 4, quantity: 20, status: 'Bueno', model: 'slowmodel' }),
    ],
    expenses: [],
  };
  const r = analyzeInventario(data, meta);
  it('detecta quiebre, stock bajo y producto lento', () => {
    expect(r.findings.some((f) => f.id === 'stockout-2' && f.severity === 'critical')).toBe(true);
    expect(r.findings.some((f) => f.id === 'lowstock-3' && f.severity === 'warning')).toBe(true);
    expect(r.findings.some((f) => f.id === 'slow-4' && f.severity === 'info')).toBe(true);
  });
});

describe('analyzeFinanciero', () => {
  const data: TenantData = {
    orders: [
      order({ id: 1, payment_cash: 100000, product_cost: 40000, delivery_status: 'Pagado' }),
      order({ id: 2, payment_cash: 10000, product_cost: 30000, delivery_status: 'Entregado' }), // pérdida
      order({ id: 3, delivery_status: 'Cancelado', payment_cash: 99999 }), // ignorado
    ],
    products: [], inventory: [], expenses: [{ id: 1, description: 'arriendo', amount: 20000, category: 'fijo', expense_date: '2026-01-01' }],
  };
  const r = analyzeFinanciero(data, meta);
  it('calcula utilidad y detecta pérdida', () => {
    const utilidad = r.findings.find((f) => f.id === 'utilidad');
    // ingresos 110000 - costos 70000 - gastos 20000 = 20000
    expect(utilidad?.value).toBe(20000);
    expect(r.findings.some((f) => f.id === 'loss-2' && f.severity === 'critical')).toBe(true);
  });
  it('ignora pedidos cancelados', () => {
    expect(r.findings.some((f) => f.id === 'loss-3')).toBe(false);
  });

  it('sin recaudo pero con pedidos por cobrar: margen es info (no warning) y "pendiente de recaudo"', () => {
    // Regresión #14: antes reportaba "Margen 0.0%" (warning) cuando aún no
    // entraba plata; debe ser info y NO alarmar.
    const sinRecaudo = analyzeFinanciero(
      {
        orders: [
          order({ id: 10, value_to_collect: 80000, delivery_status: 'Confirmado' }),
          order({ id: 11, value_to_collect: 50000, delivery_status: 'Enviado' }),
        ],
        products: [], inventory: [], expenses: [],
      },
      meta,
    );
    const margen = sinRecaudo.findings.find((f) => f.id === 'margen');
    expect(margen).toBeDefined();
    expect(margen?.severity).toBe('info');
    expect(margen?.title).toContain('pendiente de recaudo');
  });
});

describe('analyzeComercial', () => {
  const data: TenantData = {
    orders: [order({ id: 1, product_ref: 'p1' })],
    products: [
      product({ id: 10, code: 'P1', name: 'Pantufla Rosa' }), // vendido
      product({ id: 12, code: 'P9', name: 'Bolso Muerto' }),   // sin ventas
    ],
    inventory: [], expenses: [],
  };
  const r = analyzeComercial(data, meta);
  it('detecta estrella y muerto', () => {
    expect(r.findings.some((f) => f.id === 'star-10')).toBe(true);
    expect(r.findings.some((f) => f.id === 'dead-12' && f.severity === 'warning')).toBe(true);
  });
});

describe('analyzeQa', () => {
  const data: TenantData = {
    orders: [
      order({ id: 1, delivery_status: 'Raro' as Order['delivery_status'] }),
      order({ id: 2, order_date: '2999-01-01' }),
    ],
    products: [
      product({ id: 1, code: 'P1', name: 'A' }),
      product({ id: 2, code: 'P1', name: 'B' }), // código duplicado
      product({ id: 3, code: '', name: '' }),    // campos vacíos
    ],
    inventory: [], expenses: [],
  };
  const r = analyzeQa(data, meta);
  it('detecta estado inválido, fecha futura, código duplicado y campos vacíos', () => {
    expect(r.findings.some((f) => f.id === 'badstatus-1')).toBe(true);
    expect(r.findings.some((f) => f.id === 'future-2')).toBe(true);
    expect(r.findings.some((f) => f.id === 'dupcode-P1')).toBe(true);
    expect(r.findings.some((f) => f.id === 'prodfield-3')).toBe(true);
  });
  it('reporta los módulos del tenant', () => {
    expect(r.findings.some((f) => f.id === 'modules')).toBe(true);
  });
});
