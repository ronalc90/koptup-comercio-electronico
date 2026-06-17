import { describe, it, expect } from 'vitest';
import { isPlan, getPlan, productLimit, planPrice, atOrOverProductLimit, formatCOP, PLANS } from './plans';
import { licenseState, totalPaid, addMonths, LICENSE_LABELS } from './billing';

describe('planes (por cantidad de productos)', () => {
  it('valida e identifica planes', () => {
    expect(isPlan('free')).toBe(true);
    expect(isPlan('gold')).toBe(false);
    expect(getPlan('desconocido').key).toBe('free'); // fallback
  });

  it('tope de productos crece con el plan; enterprise ilimitado', () => {
    expect(productLimit('free')).toBe(PLANS.free.productLimit);
    expect(productLimit('pro')).toBeGreaterThan(productLimit('free'));
    expect(productLimit('enterprise')).toBe(Infinity);
  });

  it('precio: free=0 < pro < enterprise', () => {
    expect(planPrice('free')).toBe(0);
    expect(planPrice('pro')).toBeGreaterThan(0);
    expect(planPrice('enterprise')).toBeGreaterThan(planPrice('pro'));
  });

  it('detecta cuando se alcanza el tope de productos', () => {
    const cap = productLimit('free');
    expect(atOrOverProductLimit('free', cap)).toBe(true);
    expect(atOrOverProductLimit('free', cap - 1)).toBe(false);
    expect(atOrOverProductLimit('enterprise', 999999)).toBe(false);
  });

  it('formatea COP', () => {
    expect(formatCOP(49900)).toContain('49.900');
  });
});

describe('licencia', () => {
  it('trial cuando no hay fecha de vencimiento', () => {
    expect(licenseState('trial', null, '2026-06-17').status).toBe('trial');
  });
  it('activa con días restantes', () => {
    const s = licenseState('active', '2026-06-30', '2026-06-17');
    expect(s.status).toBe('active');
    expect(s.daysLeft).toBe(13);
  });
  it('vencida cuando la fecha ya pasó', () => {
    const s = licenseState('active', '2026-06-10', '2026-06-17');
    expect(s.status).toBe('expired');
    expect(s.daysLeft).toBeLessThan(0);
  });
  it('suspendida ignora la fecha', () => {
    expect(licenseState('suspended', '2026-12-31', '2026-06-17').status).toBe('suspended');
  });
  it('suma total pagado', () => {
    expect(totalPaid([{ amount: 49900 }, { amount: 49900 }])).toBe(99800);
  });
  it('addMonths extiende la fecha', () => {
    expect(addMonths('2026-06-17', 1)).toBe('2026-07-17');
    expect(addMonths('2026-12-17', 1)).toBe('2027-01-17');
  });
  it('addMonths fija el día al último válido del mes (no desborda)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28'); // 2026 no bisiesto
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // 2024 bisiesto
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonths('2026-01-30', 1)).toBe('2026-02-28');
  });
  it('etiquetas de estado existen', () => {
    expect(LICENSE_LABELS.active).toBe('Activa');
  });
});
