import { describe, it, expect } from 'vitest';
import { billingEffectForEvent, addMonths, billingIdempotencyKey } from './billing';

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

describe('billingIdempotencyKey: dedupe por factura, no por evento', () => {
  it('los dos eventos gemelos del mismo pago comparten clave (misma factura)', () => {
    // invoice.paid e invoice.payment_succeeded llevan el MISMO event.data.object
    // (la factura) con el mismo id, aunque el event.id difiera.
    const invoice = { id: 'in_123', lines: { data: [{ price: { id: 'price_pro' } }] } };
    const keyFromPaid = billingIdempotencyKey(invoice, 'evt_aaa');
    const keyFromSucceeded = billingIdempotencyKey(invoice, 'evt_bbb');
    expect(keyFromPaid).toBe('inv:in_123');
    expect(keyFromSucceeded).toBe('inv:in_123');
    expect(keyFromPaid).toBe(keyFromSucceeded); // ⇒ el 2º choca con el índice único
  });

  it('facturas distintas (renovaciones) producen claves distintas', () => {
    expect(billingIdempotencyKey({ id: 'in_ene' }, 'evt_1')).toBe('inv:in_ene');
    expect(billingIdempotencyKey({ id: 'in_feb' }, 'evt_2')).toBe('inv:in_feb');
  });

  it('sin id de factura cae al event.id (fallback)', () => {
    expect(billingIdempotencyKey({}, 'evt_fallback')).toBe('evt_fallback');
    expect(billingIdempotencyKey(null, 'evt_fallback')).toBe('evt_fallback');
    expect(billingIdempotencyKey({ id: 42 }, 'evt_fallback')).toBe('evt_fallback');
  });
});

describe('addMonths (extensión de licencia)', () => {
  it('suma meses sin desbordar fin de mes', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-06-15', 1)).toBe('2026-07-15');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });
});
