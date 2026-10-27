// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';
import { COOKIE_NAME } from '@/lib/sessionCookie';

// El proxy deja pasar (NextResponse.next) marcando la respuesta con este header.
function passedThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

function req(path: string, opts: { cookie?: boolean; method?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.cookie) headers.set('cookie', `${COOKIE_NAME}=token-cualquiera`);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? 'GET', headers });
}

describe('proxy: webhook de Stripe', () => {
  it('deja pasar POST /api/billing/webhook SIN cookie (Stripe no manda sesión)', () => {
    const res = proxy(req('/api/billing/webhook', { method: 'POST' }));
    expect(res.status).not.toBe(401);
    expect(passedThrough(res)).toBe(true);
  });

  it.each(['/api/billing', '/api/billing/checkout'])('%s sin cookie sigue respondiendo 401', (path) => {
    const res = proxy(req(path, { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it.each(['/api/billing/webhook-falso', '/api/billing/webhookx', '/api/billing/webhook/otra'])(
    'una ruta que solo EMPIEZA como el webhook (%s) no queda pública',
    (path) => {
      const res = proxy(req(path, { method: 'POST' }));
      expect(res.status).toBe(401);
    },
  );

  it('con cookie, /api/billing/checkout pasa (la sesión se valida en la ruta)', () => {
    const res = proxy(req('/api/billing/checkout', { method: 'POST', cookie: true }));
    expect(passedThrough(res)).toBe(true);
  });

  it('una página protegida sin cookie redirige a /login', () => {
    const res = proxy(req('/billing'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
  });
});
