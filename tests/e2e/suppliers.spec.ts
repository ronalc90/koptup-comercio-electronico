/**
 * E2E del módulo de proveedores (IA/API mockeadas, sin DB real).
 * Valida que el "Cierre por proveedor" reproduce el ejemplo del cliente:
 *   vendido 5.000.000, consumo 4.000.000, utilidad 1.000.000;
 *   prov1 1.000.000, prov2 2.000.000, prov3 1.000.000.
 * Y el semáforo de "Cuentas por pagar".
 *
 * Requiere MERAKI_E2E_USER + MERAKI_E2E_PASSWORD (si no, se saltea).
 */
import { test, expect } from '@playwright/test';
import { login, hasAuthCreds } from './helpers';

const SUPPLIERS = [
  { id: 1, name: 'Proveedor 1', contact: null, phone: null, plazo_dias: 30, dia_corte: 1, active: true, notes: null, created_at: '2026-06-01' },
  { id: 2, name: 'Proveedor 2', contact: null, phone: null, plazo_dias: 15, dia_corte: 15, active: true, notes: null, created_at: '2026-06-01' },
  { id: 3, name: 'Proveedor 3', contact: null, phone: null, plazo_dias: 45, dia_corte: 5, active: true, notes: null, created_at: '2026-06-01' },
];

// Reproduce EXACTAMENTE el ejemplo del cliente.
const CONSUMO = {
  rows: [
    { supplierId: 2, name: 'Proveedor 2', units: 2, cost: 2_000_000 },
    { supplierId: 1, name: 'Proveedor 1', units: 1, cost: 1_000_000 },
    { supplierId: 3, name: 'Proveedor 3', units: 1, cost: 1_000_000 },
  ],
  unassigned: null,
  totalUnits: 4,
  totalCost: 4_000_000,
  totalRevenue: 5_000_000,
  grossProfit: 1_000_000,
};

const PAYABLES = {
  rows: [
    { supplierId: 2, name: 'Proveedor 2', owed: 2_000_000, cutoff: '2026-06-15', dueDate: '2026-06-11', daysToDue: -4, status: 'vencido' },
    { supplierId: 1, name: 'Proveedor 1', owed: 1_000_000, cutoff: '2026-06-01', dueDate: '2026-07-01', daysToDue: 16, status: 'al_dia' },
  ],
  totalOwed: 3_000_000,
};

test.describe('auth: módulo proveedores', () => {
  test.skip(!hasAuthCreds(), 'Requiere MERAKI_E2E_USER y MERAKI_E2E_PASSWORD');

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/suppliers', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suppliers: SUPPLIERS }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ supplier: SUPPLIERS[0] }) });
      }
    });
    await page.route('**/api/suppliers/reports**', async (route) => {
      const url = route.request().url();
      if (url.includes('type=payables')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'payables', report: PAYABLES }) });
      } else if (url.includes('type=rotacion')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'rotacion', report: { rows: [], shortDays: 7, longDays: 30 } }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'consumo', report: CONSUMO }) });
      }
    });
    await login(page);
  });

  test('Cierre por proveedor reproduce el ejemplo exacto (5M / 4M / 1M)', async ({ page }) => {
    await page.goto('/suppliers');
    await page.getByRole('button', { name: 'Cierre' }).click();

    // Totales del ejemplo.
    await expect(page.getByText(/5\.000\.000/).first()).toBeVisible();
    await expect(page.getByText(/4\.000\.000/).first()).toBeVisible();
    await expect(page.getByText(/1\.000\.000/).first()).toBeVisible();

    // Desglose por proveedor: Proveedor 2 = 2.000.000.
    await expect(page.getByText('Proveedor 2')).toBeVisible();
    await expect(page.getByText(/2\.000\.000/).first()).toBeVisible();
  });

  test('Cuentas por pagar muestra el semáforo de vencimiento', async ({ page }) => {
    await page.goto('/suppliers');
    await page.getByRole('button', { name: 'Cuentas por pagar' }).click();

    await expect(page.getByText('Vencido')).toBeVisible();
    await expect(page.getByText('Al día')).toBeVisible();
    await expect(page.getByText(/3\.000\.000/).first()).toBeVisible();
  });
});
