import { describe, it, expect } from 'vitest';
import { isPlan, getPlan, productLimit, planPrice, atOrOverProductLimit, productUsage, formatCOP, PLANS } from './plans';
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

describe('uso del cupo de productos (UI preemptiva)', () => {
  it('calcula porcentaje y banderas dentro del tope', () => {
    const u = productUsage(25, 50);
    expect(u.percent).toBe(50);
    expect(u.atLimit).toBe(false);
    expect(u.nearLimit).toBe(false);
  });

  it('marca nearLimit a partir del 80%', () => {
    expect(productUsage(40, 50).nearLimit).toBe(true); // 80%
    expect(productUsage(39, 50).nearLimit).toBe(false);
  });

  it('marca atLimit al alcanzar o superar el tope y topa el porcentaje en 100', () => {
    const u = productUsage(60, 50);
    expect(u.atLimit).toBe(true);
    expect(u.percent).toBe(100);
  });

  it('tope ilimitado (null) nunca está al tope ni cerca', () => {
    const u = productUsage(999999, null);
    expect(u.limit).toBeNull();
    expect(u.atLimit).toBe(false);
    expect(u.nearLimit).toBe(false);
    expect(u.percent).toBe(0);
  });

  it('normaliza contadores negativos a 0', () => {
    expect(productUsage(-5, 50).count).toBe(0);
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
