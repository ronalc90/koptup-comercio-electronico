/**
 * Adaptador SANDBOX: transportadora funcional en memoria (NO es un stub muerto).
 * Ejecuta el flujo completo —crear guía, consultar estado, recibir webhook— de
 * forma determinista, para que el flujo de despacho sea verificable de extremo a
 * extremo cuando el tenant todavía no cargó credenciales de un carrier real.
 *
 * La guía generada avanza created → in_transit → delivered en consultas
 * sucesivas (o se fuerza por webhook), de modo que los tests e2e pueden mover el
 * pedido hasta "Entregado" sin red externa.
 */
import type {
  CarrierAdapter,
  GuideResult,
  NormalizedShipmentStatus,
  ShipmentRequest,
  TrackingUpdate,
} from './types';

interface SandboxShipment {
  trackingNumber: string;
  orderCode: string;
  step: number; // 0=created,1=in_transit,2=delivered
}

const STEP_STATUS: NormalizedShipmentStatus[] = ['created', 'in_transit', 'delivered'];

export class SandboxCarrierAdapter implements CarrierAdapter {
  readonly carrier = 'sandbox';
  private store = new Map<string, SandboxShipment>();
  private seq: () => number;
  private now: () => number;

  /** `seq`/`now` inyectables para determinismo en tests. */
  constructor(opts?: { seq?: () => number; now?: () => number }) {
    let counter = 0;
    this.seq = opts?.seq ?? (() => ++counter);
    this.now = opts?.now ?? Date.now;
  }

  async createGuide(req: ShipmentRequest): Promise<GuideResult> {
    const n = this.seq();
    const trackingNumber = `SBX${String(n).padStart(8, '0')}`;
    this.store.set(trackingNumber, { trackingNumber, orderCode: req.orderCode, step: 0 });
    return { carrier: this.carrier, trackingNumber, status: 'created' };
  }

  async getStatus(trackingNumber: string): Promise<TrackingUpdate> {
    const s = this.store.get(trackingNumber);
    if (!s) {
      return { trackingNumber, status: 'unknown', updatedAt: new Date(this.now()).toISOString() };
    }
    // Cada consulta avanza una etapa hasta entregado.
    if (s.step < STEP_STATUS.length - 1) s.step += 1;
    const status = STEP_STATUS[s.step];
    return { trackingNumber, status, rawStatus: status.toUpperCase(), updatedAt: new Date(this.now()).toISOString() };
  }

  /** Permite forzar un estado por "webhook" (p. ej. {tracking, status}). */
  parseWebhook(payload: unknown): TrackingUpdate | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    const trackingNumber = String(p.tracking ?? p.trackingNumber ?? '');
    if (!trackingNumber) return null;
    const status = (String(p.status ?? 'in_transit') as NormalizedShipmentStatus);
    const s = this.store.get(trackingNumber);
    if (s) s.step = STEP_STATUS.indexOf(status) >= 0 ? STEP_STATUS.indexOf(status) : s.step;
    return { trackingNumber, status, rawStatus: status.toUpperCase(), updatedAt: new Date(this.now()).toISOString() };
  }
}
