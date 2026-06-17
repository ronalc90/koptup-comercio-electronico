import { describe, it, expect } from 'vitest';
import { isPlan, getPlan, planLimit, atOrOverLimit, PLANS } from './plans';

describe('planes', () => {
  it('valida e identifica planes', () => {
    expect(isPlan('free')).toBe(true);
    expect(isPlan('pro')).toBe(true);
    expect(isPlan('gold')).toBe(false);
    expect(getPlan('pro').key).toBe('pro');
    expect(getPlan('desconocido').key).toBe('free'); // fallback
  });

  it('expone límites por plan', () => {
    expect(planLimit('free', 'users')).toBe(PLANS.free.limits.users);
    expect(planLimit('enterprise', 'users')).toBe(Infinity);
    expect(planLimit('pro', 'orders')).toBeGreaterThan(planLimit('free', 'orders'));
  });

  it('detecta cuando se alcanza el tope', () => {
    const cap = planLimit('free', 'users');
    expect(atOrOverLimit('free', 'users', cap)).toBe(true);
    expect(atOrOverLimit('free', 'users', cap - 1)).toBe(false);
    // enterprise = ilimitado
    expect(atOrOverLimit('enterprise', 'users', 9999)).toBe(false);
  });
});
