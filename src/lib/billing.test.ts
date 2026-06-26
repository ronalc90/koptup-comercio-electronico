import { describe, it, expect } from 'vitest';
import { billingEffectForEvent, addMonths } from './billing';

describe('billingEffectForEvent: traducción de eventos Stripe → licencia', () => {
  it('invoice.paid / payment_succeeded → extiende y activa', () => {
    for (const t of ['invoice.paid', 'invoice.payment_succeeded']) {
      expect(billingEffectForEvent(t)).toEqual({ extendLicense: true, billingStatus: 'active' });
    }
  });

  it('checkout.session.completed → activa pero NO extiende (evita doble cobro en el alta)', () => {
    expect(billingEffectForEvent('checkout.session.completed')).toEqual({ extendLicense: false, billingStatus: 'active' });
  });

  it('fallo de pago / suscripción cancelada → suspende', () => {
    for (const t of ['invoice.payment_failed', 'customer.subscription.deleted']) {
      expect(billingEffectForEvent(t)).toEqual({ extendLicense: false, billingStatus: 'suspended' });
    }
  });

  it('eventos no relevantes → sin efecto', () => {
    expect(billingEffectForEvent('payment_intent.created')).toEqual({ extendLicense: false, billingStatus: null });
    expect(billingEffectForEvent('cualquier.cosa')).toEqual({ extendLicense: false, billingStatus: null });
  });
});

describe('addMonths (extensión de licencia)', () => {
  it('suma meses sin desbordar fin de mes', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-06-15', 1)).toBe('2026-07-15');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });
});
