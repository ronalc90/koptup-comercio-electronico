/**
 * Contrato de TRANSPORTADORA (Fase E). Una sola interfaz `CarrierAdapter` que
 * todos los adaptadores (Interrapidísimo, sandbox, futuros) implementan. La
 * lógica de mapeo de estados es PURA y testeable; el IO va por un `HttpClient`
 * inyectable, de modo que el flujo completo (crear guía → guardar tracking →
 * recibir actualización → mover a entregado) se ejercita en tests sin tocar la
 * red real.
 */

/** Estado normalizado del envío (independiente de la jerga de cada carrier). */
export type NormalizedShipmentStatus =
  | 'created'
  | 'in_transit'
  | 'delivered'
  | 'returned'
  | 'cancelled'
  | 'unknown';

export interface ShipmentRequest {
  /** order_code del pedido (referencia del cliente para la guía). */
  orderCode: string;
  recipient: {
    name: string;
    phone: string;
    city: string;
    address: string;
  };
  /** Valor declarado de la mercancía (COP). */
  declaredValue: number;
  /** Monto a cobrar contra entrega (COP); 0 si va pago anticipado. */
  codAmount?: number;
  weightKg?: number;
  notes?: string;
}

export interface GuideResult {
  carrier: string;
  trackingNumber: string;
  status: NormalizedShipmentStatus;
  /** URL del rótulo/etiqueta si el carrier la entrega. */
  labelUrl?: string;
  raw?: unknown;
}

export interface TrackingUpdate {
  trackingNumber: string;
  status: NormalizedShipmentStatus;
  /** Estado crudo del carrier (para auditoría/UI). */
  rawStatus?: string;
  /** ISO 8601 del momento de la actualización. */
  updatedAt: string;
}

/** Cliente HTTP inyectable: en producción usa fetch; en tests, un fake. */
export interface HttpClient {
  request(opts: {
    method: 'GET' | 'POST' | 'PUT';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<{ status: number; json: unknown }>;
}

export interface CarrierAdapter {
  /** Slug del carrier (p. ej. 'interrapidisimo', 'sandbox'). */
  readonly carrier: string;
  /** Crea la guía y devuelve el número de seguimiento. */
  createGuide(req: ShipmentRequest): Promise<GuideResult>;
  /** Consulta el estado actual de una guía. */
  getStatus(trackingNumber: string): Promise<TrackingUpdate>;
  /** Interpreta un payload de webhook del carrier → actualización normalizada. */
  parseWebhook(payload: unknown): TrackingUpdate | null;
}

/**
 * Mapea un estado normalizado de envío al `delivery_status` del pedido.
 * - created: la guía existe pero no cambia la fase (sigue donde estaba).
 * - in_transit → Enviado (despachado), delivered → Entregado,
 *   returned → Devolucion, cancelled → Cancelado.
 * Devuelve null cuando no debe tocarse el estado del pedido.
 */
export function orderStatusForTracking(
  status: NormalizedShipmentStatus,
): 'Enviado' | 'Entregado' | 'Devolucion' | 'Cancelado' | null {
  switch (status) {
    case 'in_transit': return 'Enviado';
    case 'delivered': return 'Entregado';
    case 'returned': return 'Devolucion';
    case 'cancelled': return 'Cancelado';
    default: return null;
  }
}
