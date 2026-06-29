/**
 * Adaptador REAL de Interrapidísimo (transportadora colombiana con API REST).
 *
 * El IO va por un `HttpClient` inyectable: en producción se le pasa un cliente
 * basado en `fetch`; en tests se le inyecta uno que devuelve respuestas canónicas
 * del carrier, de modo que la construcción del request y el parseo de la
 * respuesta (lo que de verdad puede fallar) se ejercita end-to-end sin red.
 *
 * Para ACTIVARLO en real, el tenant carga en su configuración de envíos:
 *   - carrier: 'interrapidisimo'
 *   - credentials: { baseUrl, token }   (token = API key de Interrapidísimo)
 * y se define la variable de entorno SHIPPING_ENC_KEY (para cifrar credenciales).
 */
import type {
  CarrierAdapter,
  GuideResult,
  HttpClient,
  NormalizedShipmentStatus,
  ShipmentRequest,
  TrackingUpdate,
} from './types';

export interface InterrapidisimoCredentials {
  baseUrl: string;
  token: string;
}

/**
 * Normaliza el estado crudo de Interrapidísimo (español, mayúsculas variables) a
 * un estado normalizado. PURA y testeable.
 */
export function normalizeInterrapidisimoStatus(raw: unknown): NormalizedShipmentStatus {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return 'unknown';
  if (/(ENTREGAD)/.test(s)) return 'delivered';
  if (/(DEVOLU|DEVUELT|RECHAZAD)/.test(s)) return 'returned';
  if (/(ANULAD|CANCELAD)/.test(s)) return 'cancelled';
  if (/(REPARTO|TRANSITO|TRÁNSITO|CAMINO|RECOLECT|ADMITID|OFICINA|DISTRIBU)/.test(s)) return 'in_transit';
  if (/(GENERAD|CREAD|PREADMI|REGISTRAD)/.test(s)) return 'created';
  return 'unknown';
}

const ISO = (n: number) => new Date(n).toISOString();

export class InterrapidisimoAdapter implements CarrierAdapter {
  readonly carrier = 'interrapidisimo';
  private readonly http: HttpClient;
  private readonly creds: InterrapidisimoCredentials;
  /** Inyectable para tests deterministas (timestamps). */
  private readonly now: () => number;

  constructor(http: HttpClient, creds: InterrapidisimoCredentials, now: () => number = Date.now) {
    this.http = http;
    this.creds = creds;
    this.now = now;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.creds.token}`,
    };
  }

  async createGuide(req: ShipmentRequest): Promise<GuideResult> {
    const url = `${this.creds.baseUrl.replace(/\/$/, '')}/guias`;
    const body = {
      referencia: req.orderCode,
      destinatario: {
        nombre: req.recipient.name,
        telefono: req.recipient.phone,
        ciudad: req.recipient.city,
        direccion: req.recipient.address,
      },
      valorDeclarado: Math.max(0, Math.round(req.declaredValue || 0)),
      valorRecaudo: Math.max(0, Math.round(req.codAmount || 0)),
      pesoKg: req.weightKg ?? 1,
      observaciones: req.notes ?? '',
    };
    const res = await this.http.request({ method: 'POST', url, headers: this.headers(), body });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Interrapidísimo: error ${res.status} al crear la guía`);
    }
    const data = (res.json ?? {}) as Record<string, unknown>;
    const tracking = String(data.numeroGuia ?? data.guia ?? data.tracking ?? '');
    if (!tracking) throw new Error('Interrapidísimo: respuesta sin número de guía');
    return {
      carrier: this.carrier,
      trackingNumber: tracking,
      status: normalizeInterrapidisimoStatus(data.estado ?? 'GENERADA'),
      labelUrl: typeof data.rotuloUrl === 'string' ? data.rotuloUrl : undefined,
      raw: data,
    };
  }

  async getStatus(trackingNumber: string): Promise<TrackingUpdate> {
    const url = `${this.creds.baseUrl.replace(/\/$/, '')}/guias/${encodeURIComponent(trackingNumber)}/estado`;
    const res = await this.http.request({ method: 'GET', url, headers: this.headers() });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Interrapidísimo: error ${res.status} al consultar el estado`);
    }
    const data = (res.json ?? {}) as Record<string, unknown>;
    const raw = String(data.estado ?? data.status ?? '');
    return {
      trackingNumber,
      status: normalizeInterrapidisimoStatus(raw),
      rawStatus: raw || undefined,
      updatedAt: typeof data.fecha === 'string' ? data.fecha : ISO(this.now()),
    };
  }

  parseWebhook(payload: unknown): TrackingUpdate | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    const tracking = String(p.numeroGuia ?? p.guia ?? p.tracking ?? '');
    if (!tracking) return null;
    const raw = String(p.estado ?? p.status ?? '');
    return {
      trackingNumber: tracking,
      status: normalizeInterrapidisimoStatus(raw),
      rawStatus: raw || undefined,
      updatedAt: typeof p.fecha === 'string' ? p.fecha : ISO(this.now()),
    };
  }
}
