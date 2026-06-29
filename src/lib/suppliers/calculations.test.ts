import { describe, it, expect } from 'vitest';
import {
  consumoPorProveedor,
  cuentasPorPagarPorProveedor,
  rotacionPorProveedor,
  addDays,
  daysBetween,
  lastCutoffOnOrBefore,
  type SupplierLite,
  type SoldOrderLite,
} from './calculations';

const SUPPLIERS: SupplierLite[] = [
  { id: 1, name: 'Proveedor 1', plazo_dias: 30, dia_corte: 1 },
  { id: 2, name: 'Proveedor 2', plazo_dias: 30, dia_corte: 1 },
  { id: 3, name: 'Proveedor 3', plazo_dias: 30, dia_corte: 1 },
];

function order(o: Partial<SoldOrderLite>): SoldOrderLite {
  return {
    supplier_id: null,
    product_cost: 0,
    quantity: 1,
    value_to_collect: 0,
    delivery_status: 'Confirmado',
    order_date: '2026-06-10',
    ...o,
  };
}

describe('consumoPorProveedor — ejemplo EXACTO del cliente', () => {
  // Vendí 5M, ganancia 1M, consumo 4M; prov1 1M, prov2 2M, prov3 1M.
  const orders: SoldOrderLite[] = [
    order({ supplier_id: 1, product_cost: 1_000_000, quantity: 1, value_to_collect: 1_250_000 }),
    order({ supplier_id: 2, product_cost: 1_000_000, quantity: 2, value_to_collect: 2_500_000 }),
    order({ supplier_id: 3, product_cost: 1_000_000, quantity: 1, value_to_collect: 1_250_000 }),
  ];
  const r = consumoPorProveedor(orders, SUPPLIERS);

  it('consumo por proveedor: prov1=1M, prov2=2M, prov3=1M', () => {
    const byId = Object.fromEntries(r.rows.map((x) => [x.supplierId, x.cost]));
    expect(byId[1]).toBe(1_000_000);
    expect(byId[2]).toBe(2_000_000);
    expect(byId[3]).toBe(1_000_000);
  });

  it('totales: vendí 5M, consumo 4M, ganancia 1M', () => {
    expect(r.totalRevenue).toBe(5_000_000);
    expect(r.totalCost).toBe(4_000_000);
    expect(r.grossProfit).toBe(1_000_000);
  });

  it('unidades: 1 + 2 + 1 = 4', () => {
    expect(r.totalUnits).toBe(4);
  });

  it('ordena de mayor a menor costo (prov2 primero)', () => {
    expect(r.rows[0].supplierId).toBe(2);
  });
});

describe('consumoPorProveedor — casos límite', () => {
  it('proveedor sin ventas aparece en 0', () => {
    const r = consumoPorProveedor([], SUPPLIERS);
    expect(r.rows).toHaveLength(3);
    expect(r.rows.every((x) => x.cost === 0 && x.units === 0)).toBe(true);
    expect(r.totalCost).toBe(0);
    expect(r.unassigned).toBeNull();
  });

  it('costo nulo se trata como 0 (no NaN)', () => {
    const r = consumoPorProveedor(
      [order({ supplier_id: 1, product_cost: null, quantity: 2, value_to_collect: 50_000 })],
      SUPPLIERS,
    );
    expect(r.totalCost).toBe(0);
    expect(r.totalRevenue).toBe(50_000);
    expect(Number.isNaN(r.totalCost)).toBe(false);
  });

  it('líneas con supplier NULL van al bucket "sin asignar", no a un proveedor', () => {
    const r = consumoPorProveedor(
      [order({ supplier_id: null, product_cost: 300_000, quantity: 1, value_to_collect: 400_000 })],
      SUPPLIERS,
    );
    expect(r.unassigned).toEqual({ units: 1, cost: 300_000 });
    expect(r.rows.every((x) => x.cost === 0)).toBe(true);
    expect(r.totalCost).toBe(300_000); // el consumo total SÍ incluye lo sin asignar
  });

  it('mismo modelo con proveedores distintos se agrupa por supplier_id', () => {
    const r = consumoPorProveedor(
      [
        order({ supplier_id: 1, product_cost: 100_000, quantity: 1 }),
        order({ supplier_id: 2, product_cost: 100_000, quantity: 1 }),
      ],
      SUPPLIERS,
    );
    const byId = Object.fromEntries(r.rows.map((x) => [x.supplierId, x.cost]));
    expect(byId[1]).toBe(100_000);
    expect(byId[2]).toBe(100_000);
  });

  it('excluye estados no activos (Cancelado / Devolucion)', () => {
    const r = consumoPorProveedor(
      [
        order({ supplier_id: 1, product_cost: 100_000, delivery_status: 'Cancelado' }),
        order({ supplier_id: 1, product_cost: 100_000, delivery_status: 'Devolucion' }),
        order({ supplier_id: 1, product_cost: 100_000, delivery_status: 'Entregado' }),
      ],
      SUPPLIERS,
    );
    expect(r.totalCost).toBe(100_000);
  });

  it('respeta el rango de fechas', () => {
    const orders = [
      order({ supplier_id: 1, product_cost: 100_000, order_date: '2026-06-01' }),
      order({ supplier_id: 1, product_cost: 100_000, order_date: '2026-07-01' }),
    ];
    const r = consumoPorProveedor(orders, SUPPLIERS, { from: '2026-06-01', to: '2026-06-30' });
    expect(r.totalCost).toBe(100_000);
  });
});

describe('cuentasPorPagarPorProveedor — semáforo de vencimiento', () => {
  const today = '2026-06-15';
  const suppliers: SupplierLite[] = [
    { id: 1, name: 'Al día', plazo_dias: 30, dia_corte: 1 }, // due 2026-07-01
    { id: 2, name: 'Vencido', plazo_dias: 10, dia_corte: 1 }, // due 2026-06-11
    { id: 3, name: 'Por vencer', plazo_dias: 17, dia_corte: 1 }, // due 2026-06-18
    { id: 4, name: 'Sin deuda', plazo_dias: 10, dia_corte: 1 },
  ];
  const orders: SoldOrderLite[] = [
    order({ supplier_id: 1, product_cost: 100_000, order_date: '2026-06-05' }),
    order({ supplier_id: 2, product_cost: 200_000, order_date: '2026-06-05' }),
    order({ supplier_id: 3, product_cost: 150_000, order_date: '2026-06-05' }),
    // supplier 4 sin pedidos → sin deuda.
  ];
  const r = cuentasPorPagarPorProveedor(orders, suppliers, today, { warnDays: 5 });
  const byId = Object.fromEntries(r.rows.map((x) => [x.supplierId, x]));

  it('clasifica al_dia / vencido / por_vencer correctamente', () => {
    expect(byId[1].status).toBe('al_dia');
    expect(byId[2].status).toBe('vencido');
    expect(byId[3].status).toBe('por_vencer');
  });

  it('sin deuda siempre al_dia (owed 0)', () => {
    expect(byId[4].owed).toBe(0);
    expect(byId[4].status).toBe('al_dia');
  });

  it('calcula corte, vencimiento y días al vencimiento', () => {
    expect(byId[2].cutoff).toBe('2026-06-01');
    expect(byId[2].dueDate).toBe('2026-06-11');
    expect(byId[2].daysToDue).toBe(-4);
  });

  it('ordena vencidos primero', () => {
    expect(r.rows[0].status).toBe('vencido');
  });

  it('totalOwed suma lo adeudado', () => {
    expect(r.totalOwed).toBe(450_000);
  });
});

describe('rotacionPorProveedor — ventanas y ranking de estancados', () => {
  const today = '2026-06-15';
  const suppliers: SupplierLite[] = [
    { id: 1, name: 'Rápido', plazo_dias: 30, dia_corte: 1 },
    { id: 2, name: 'Lento', plazo_dias: 30, dia_corte: 1 },
    { id: 3, name: 'Estancado', plazo_dias: 30, dia_corte: 1 },
  ];
  const orders: SoldOrderLite[] = [
    order({ supplier_id: 1, quantity: 3, order_date: '2026-06-12' }), // dentro de 7d
    order({ supplier_id: 2, quantity: 5, order_date: '2026-05-20' }), // dentro de 30d, no 7d
    order({ supplier_id: 2, quantity: 9, order_date: '2026-05-01' }), // fuera de 30d → excluido
  ];
  const r = rotacionPorProveedor(orders, suppliers, today);
  const byId = Object.fromEntries(r.rows.map((x) => [x.supplierId, x]));

  it('cuenta unidades en ventana corta (7d) y larga (30d)', () => {
    expect(byId[1]).toMatchObject({ unitsShort: 3, unitsLong: 3 });
    expect(byId[2]).toMatchObject({ unitsShort: 0, unitsLong: 5 });
  });

  it('marca estancado al proveedor sin movimiento en 30d', () => {
    expect(byId[3].estancado).toBe(true);
    expect(byId[1].estancado).toBe(false);
  });

  it('ordena de menos a más movimiento (estancados primero)', () => {
    expect(r.rows[0].supplierId).toBe(3);
    expect(r.rows[r.rows.length - 1].supplierId).toBe(2);
  });
});

describe('helpers de fecha puros', () => {
  it('addDays y daysBetween con cambio de mes', () => {
    expect(addDays('2026-06-28', 5)).toBe('2026-07-03');
    expect(daysBetween('2026-06-15', '2026-07-01')).toBe(16);
    expect(daysBetween('2026-07-01', '2026-06-15')).toBe(-16);
  });

  it('lastCutoffOnOrBefore: hoy ya pasó el corte → corte de este mes', () => {
    expect(lastCutoffOnOrBefore('2026-06-15', 1)).toBe('2026-06-01');
  });

  it('lastCutoffOnOrBefore: hoy antes del corte → corte del mes anterior', () => {
    expect(lastCutoffOnOrBefore('2026-06-05', 10)).toBe('2026-05-10');
  });

  it('lastCutoffOnOrBefore: ajusta día 31 a la longitud del mes (febrero)', () => {
    // En 2026 febrero tiene 28 días; corte 31 → 28-feb.
    expect(lastCutoffOnOrBefore('2026-03-01', 31)).toBe('2026-02-28');
  });
});
