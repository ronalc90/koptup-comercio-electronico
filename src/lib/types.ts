export interface Product {
  id: number;
  code: string;
  name: string;
  cost: number;
  /** Precio de venta sugerido para el catálogo público (migración 018). Null = "Consultar". */
  price?: number | null;
  category: string;
  active: boolean;
  image_url?: string;
  /** Proveedor del producto (módulo proveedores, migración 016). Null = sin asignar. */
  supplier_id?: number | null;
  created_at: string;
}

/** Proveedor de un negocio (módulo proveedores, migración 016). */
export interface Supplier {
  id: number;
  name: string;
  contact?: string | null;
  phone?: string | null;
  /** Plazo de pago en días desde el corte. */
  plazo_dias: number;
  /** Día del mes en que cierra el corte (1..31). */
  dia_corte: number;
  active: boolean;
  notes?: string | null;
  created_at: string;
}

/**
 * Tipo de envío del pedido. Los valores se renombraron en v1.012 para que
 * sean genéricos para cualquier tienda, en vez de la jerga interna anterior:
 *   Bogo    → Mensajería  (courier que recoge, entrega y cobra)
 *   Bodega  → Recogida    (cliente pasa a buscar al local)
 *   Otros   → Otro
 *
 * El tipo acepta también los valores legacy para que las pantallas no se
 * rompan con pedidos viejos en BDs aún no migradas. `deliveryTypeLabel()`
 * mapea legacy → label amigable.
 */
export type DeliveryType =
  | 'Mensajeria'
  | 'Recogida'
  | 'Otro'
  // Valores legacy — solo lectura tras la migración v1.012
  | 'Bogo'
  | 'Bodega'
  | 'Otros'
  | '';

export const DELIVERY_TYPE_OPTIONS: Array<{ value: Exclude<DeliveryType, '' | 'Bogo' | 'Bodega' | 'Otros'>; label: string }> = [
  { value: 'Mensajeria', label: 'Mensajería' },
  { value: 'Recogida', label: 'Recogida en tienda' },
  { value: 'Otro', label: 'Otro' },
];

export function deliveryTypeLabel(t: DeliveryType | null | undefined): string {
  switch (t) {
    case 'Mensajeria':
    case 'Bogo':
      return 'Mensajería';
    case 'Recogida':
    case 'Bodega':
      return 'Recogida en tienda';
    case 'Otro':
    case 'Otros':
      return 'Otro';
    default:
      return '';
  }
}

/** Normaliza un delivery_type al valor canónico nuevo (para escrituras). */
export function normalizeDeliveryType(t: DeliveryType | null | undefined): DeliveryType {
  switch (t) {
    case 'Bogo': return 'Mensajeria';
    case 'Bodega': return 'Recogida';
    case 'Otros': return 'Otro';
    default: return t ?? '';
  }
}

/**
 * Devuelve el monto pendiente de liquidación por el mensajero, leyendo
 * primero el campo nuevo (`payment_courier_pending`) y cayendo al legacy
 * (`payment_cash_bogo`) por si la migración SQL aún no se aplicó.
 */
export function getCourierPending(o: Pick<Order, 'payment_courier_pending' | 'payment_cash_bogo'> | null | undefined): number {
  if (!o) return 0;
  return o.payment_courier_pending ?? o.payment_cash_bogo ?? 0;
}

export type PaymentTiming = 'Anticipado' | 'ContraEntrega' | 'Mixto' | 'Otro' | '';

export const PAYMENT_TIMING_OPTIONS: Array<{ value: Exclude<PaymentTiming, ''>; label: string; short: string }> = [
  { value: 'ContraEntrega', label: 'Contra entrega', short: 'Contra entrega' },
  { value: 'Anticipado', label: 'Pago anticipado (ya pagó)', short: 'Anticipado' },
  { value: 'Mixto', label: 'Mixto (abono + saldo contra entrega)', short: 'Mixto' },
  { value: 'Otro', label: 'Otro (crédito, especie, canje…)', short: 'Otro' },
];

export interface Order {
  id: number;
  order_code: string;
  client_name: string;
  phone: string;
  city: string;
  address: string;
  complement: string;
  product_ref: string;
  detail: string;
  comment: string;
  /** Proveedor congelado al vender (módulo proveedores, migración 016). Null = sin asignar. */
  supplier_id?: number | null;
  value_to_collect: number;
  /**
   * Efectivo recaudado por el mensajero/courier que aún NO se liquidó al
   * negocio. Renombrado en v1.012 desde `payment_cash_bogo` a un nombre
   * neutro. Para mantener compatibilidad si la migración SQL aún no
   * corrió, ambos campos quedan en el tipo: usá `getCourierPending(order)`
   * para leer y `payment_courier_pending` para escribir.
   */
  payment_courier_pending?: number;
  /** @deprecated v1.012 — usar `payment_courier_pending`. Se elimina cuando la migración SQL haya corrido en todos los entornos. */
  payment_cash_bogo?: number;
  payment_cash: number;
  payment_transfer: number;
  product_cost: number;
  delivery_type: DeliveryType;
  vendor: string;
  delivery_status: 'Confirmado' | 'EnAlistamiento' | 'Alistado' | 'Enviado' | 'Entregado' | 'Pagado' | 'Devolucion' | 'Cancelado';
  status_complement: string;
  /** Transportadora y guía generadas al despachar (migración 018). Opcionales. */
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_status?: string | null;
  tracking_updated_at?: string | null;
  is_exchange: boolean;
  order_date: string;
  dispatch_date: string | null;
  guide_number: string;
  prepaid_amount: number;
  operating_cost: number;
  /** Momento del pago (v1.010). Columna opcional en DB: puede ser undefined si la migración no está aplicada. */
  payment_timing?: PaymentTiming;
  created_at: string;
}

export interface InventoryItem {
  id: number;
  basket_location: string;
  product_id: string;
  category: string;
  type: string;
  reference: number;
  model: string;
  color: string;
  size: string;
  quantity: number;
  status: 'Bueno' | 'Malo';
  observations: string;
  verified: boolean;
  image_url?: string;
  /** Proveedor asignado al INGRESAR la mercancía (migración 018). Null = sin asignar. */
  supplier_id?: number | null;
  created_at: string;
}

export interface DailyKPIs {
  totalOrders: number;
  /** Pedidos entregados por mensajería (antes deliveredBogo). */
  deliveredCourier: number;
  /** Pedidos entregados como recogida en tienda (antes deliveredBodega). */
  deliveredPickup: number;
  /** Pedidos entregados con otro tipo de envío (antes deliveredOtros). */
  deliveredOther: number;
  returns: number;
  exchanges: number;
  cancelled: number;
  /** Recaudo del mensajero pendiente de liquidación (antes revenueBogo). */
  revenueCourierPending: number;
  revenueCash: number;
  revenueTransfer: number;
  totalRevenue: number;
  ordersOwner: number;
  totalCosts: number;
  totalOperatingCosts: number;
  profit: number;
}

export interface ParsedOrder {
  client_name: string;
  phone: string;
  address: string;
  complement: string;
  detail: string;
  value_to_collect: number;
  city?: string;
  product_ref?: string;
  comment?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  parsedOrder?: ParsedOrder;
}
