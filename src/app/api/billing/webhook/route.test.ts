// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';
import type { NextRequest } from 'next/server';

// El webhook es público en el proxy (Stripe no manda cookie), así que la ÚNICA
// autenticación es la firma `stripe-signature`. Estas pruebas fijan que sin
// firma válida no se toca la BD.

const WEBHOOK_SECRET = 'whsec_prueba_unitaria';
let dbTouched = false;

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => {
    dbTouched = true;
    throw new Error('la prueba no debe llegar a la BD');
  },
}));

import { POST } from './route';

const signer = new Stripe('sk_test_prueba_unitaria');

function event(type: string): string {
  return JSON.stringify({ id: 'evt_prueba', object: 'event', type, data: { object: {} } });
}

function req(body: string, signature?: string): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) headers.set('stripe-signature', signature);
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

beforeEach(() => {
  dbTouched = false;
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_prueba_unitaria');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
});

describe('POST /api/billing/webhook: verificación de firma', () => {
  it('sin STRIPE_WEBHOOK_SECRET → 503 (no acepta eventos sin poder verificarlos)', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const res = await POST(req(event('invoice.paid'), 'firma'));
    expect(res.status).toBe(503);
    expect(dbTouched).toBe(false);
  });

  it('sin cabecera stripe-signature → 400', async () => {
    const res = await POST(req(event('invoice.paid')));
    expect(res.status).toBe(400);
    expect(dbTouched).toBe(false);
  });

  it('firma con otro secreto → 400 y no toca la BD', async () => {
    const body = event('invoice.paid');
    const sig = signer.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_otro' });
    const res = await POST(req(body, sig));
    expect(res.status).toBe(400);
    expect(dbTouched).toBe(false);
  });

  it('cuerpo alterado tras firmar → 400', async () => {
    const sig = signer.webhooks.generateTestHeaderString({ payload: event('customer.created'), secret: WEBHOOK_SECRET });
    const res = await POST(req(event('invoice.paid'), sig));
    expect(res.status).toBe(400);
    expect(dbTouched).toBe(false);
  });

  it('firma válida → 200 (evento sin efecto de facturación: no toca la BD)', async () => {
    const body = event('customer.created');
    const sig = signer.webhooks.generateTestHeaderString({ payload: body, secret: WEBHOOK_SECRET });
    const res = await POST(req(body, sig));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(dbTouched).toBe(false);
  });
});
