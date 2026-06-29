import { describe, it, expect } from 'vitest';
import {
  orderStatusForTracking,
  type HttpClient,
  type ShipmentRequest,
} from './types';
import { InterrapidisimoAdapter, normalizeInterrapidisimoStatus } from './interrapidisimo';
import { SandboxCarrierAdapter } from './sandbox';
import { getCarrierAdapter } from './index';

const REQ: ShipmentRequest = {
  orderCode: '4061801',
  recipient: { name: 'Carlos', phone: '3201234567', city: 'Chía', address: 'Cra 1 #2-3' },
  declaredValue: 110000,
  codAmount: 110000,
};

describe('orderStatusForTracking: estado de envío → estado de pedido', () => {
  it('mapea solo los estados que mueven la fase', () => {
    expect(orderStatusForTracking('in_transit')).toBe('Enviado');
    expect(orderStatusForTracking('delivered')).toBe('Entregado');
    expect(orderStatusForTracking('returned')).toBe('Devolucion');
    expect(orderStatusForTracking('cancelled')).toBe('Cancelado');
    expect(orderStatusForTracking('created')).toBeNull();
    expect(orderStatusForTracking('unknown')).toBeNull();
  });
});

describe('normalizeInterrapidisimoStatus', () => {
  it('traduce la jerga del carrier', () => {
    expect(normalizeInterrapidisimoStatus('GENERADA')).toBe('created');
    expect(normalizeInterrapidisimoStatus('EN REPARTO')).toBe('in_transit');
    expect(normalizeInterrapidisimoStatus('En Tránsito')).toBe('in_transit');
    expect(normalizeInterrapidisimoStatus('ENTREGADO')).toBe('delivered');
    expect(normalizeInterrapidisimoStatus('DEVOLUCION')).toBe('returned');
    expect(normalizeInterrapidisimoStatus('ANULADO')).toBe('cancelled');
    expect(normalizeInterrapidisimoStatus('')).toBe('unknown');
  });
});

/** Cliente HTTP fake: guiona las respuestas del carrier para ejercitar el adapter real. */
function fakeHttp(responses: Array<{ status: number; json: unknown }>): { http: HttpClient; calls: Array<{ method: string; url: string; body?: unknown }> } {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  let i = 0;
  const http: HttpClient = {
    async request({ method, url, body }) {
      calls.push({ method, url, body });
      return responses[Math.min(i++, responses.length - 1)];
    },
  };
  return { http, calls };
}

describe('InterrapidisimoAdapter (real, con HttpClient inyectado)', () => {
  it('createGuide construye el request y parsea el número de guía', async () => {
    const { http, calls } = fakeHttp([{ status: 201, json: { numeroGuia: '240000123', estado: 'GENERADA' } }]);
    const a = new InterrapidisimoAdapter(http, { baseUrl: 'https://api.inter.test/v1', token: 'tk' }, () => 0);
    const r = await a.createGuide(REQ);
    expect(r.trackingNumber).toBe('240000123');
    expect(r.status).toBe('created');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('https://api.inter.test/v1/guias');
    expect((calls[0].body as { referencia: string }).referencia).toBe('4061801');
  });

  it('createGuide lanza si el carrier responde error', async () => {
    const { http } = fakeHttp([{ status: 500, json: { error: 'x' } }]);
    const a = new InterrapidisimoAdapter(http, { baseUrl: 'https://api.inter.test', token: 'tk' });
    await expect(a.createGuide(REQ)).rejects.toThrow(/error 500/);
  });

  it('getStatus normaliza el estado del carrier', async () => {
    const { http } = fakeHttp([{ status: 200, json: { estado: 'ENTREGADO', fecha: '2026-06-29T10:00:00Z' } }]);
    const a = new InterrapidisimoAdapter(http, { baseUrl: 'https://api.inter.test', token: 'tk' });
    const u = await a.getStatus('240000123');
    expect(u.status).toBe('delivered');
    expect(u.updatedAt).toBe('2026-06-29T10:00:00Z');
  });

  it('parseWebhook interpreta el payload del carrier', () => {
    const a = new InterrapidisimoAdapter(fakeHttp([]).http, { baseUrl: 'x', token: 'y' }, () => 0);
    expect(a.parseWebhook({ numeroGuia: 'G1', estado: 'EN REPARTO' })).toEqual({
      trackingNumber: 'G1', status: 'in_transit', rawStatus: 'EN REPARTO', updatedAt: new Date(0).toISOString(),
    });
    expect(a.parseWebhook({})).toBeNull();
    expect(a.parseWebhook(null)).toBeNull();
  });
});

describe('SandboxCarrierAdapter: flujo completo end-to-end', () => {
  it('crea guía y avanza created → in_transit → delivered', async () => {
    const a = new SandboxCarrierAdapter({ now: () => 0 });
    const g = await a.createGuide(REQ);
    expect(g.trackingNumber).toMatch(/^SBX\d{8}$/);
    expect(g.status).toBe('created');
    const s1 = await a.getStatus(g.trackingNumber);
    expect(s1.status).toBe('in_transit');
    expect(orderStatusForTracking(s1.status)).toBe('Enviado');
    const s2 = await a.getStatus(g.trackingNumber);
    expect(s2.status).toBe('delivered');
    expect(orderStatusForTracking(s2.status)).toBe('Entregado'); // ⇒ pedido a "Entregado"
  });

  it('getStatus de guía inexistente → unknown', async () => {
    const a = new SandboxCarrierAdapter();
    expect((await a.getStatus('NOPE')).status).toBe('unknown');
  });
});

describe('getCarrierAdapter: selección', () => {
  it('sin config → sandbox', () => {
    expect(getCarrierAdapter(null).carrier).toBe('sandbox');
    expect(getCarrierAdapter({ carrier: 'interrapidisimo', enabled: false }).carrier).toBe('sandbox');
  });
});
