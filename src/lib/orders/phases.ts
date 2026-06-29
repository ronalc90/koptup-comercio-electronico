/**
 * Máquina de FASES del pedido (lógica PURA, testeable). Define el pipeline lineal
 * de alistamiento → despacho → entrega sobre los `delivery_status` reales:
 *
 *   Confirmado → EnAlistamiento → Alistado → Enviado(=Despachado) → Entregado
 *
 * Estados fuera del pipeline lineal (no tienen "siguiente fase"):
 *   - Pagado: cobro registrado (terminal de pago).
 *   - Devolucion / Cancelado: excepciones.
 *
 * Las fases nuevas ('EnAlistamiento', 'Alistado') sólo se persisten si la
 * migración 018 ya amplió el CHECK (ver isOrderShippingSupported); la lógica
 * pura es independiente de la BD.
 */
import type { OrderStatus } from '@/lib/assistant/constants';

/** Orden del pipeline lineal. El índice define el avance. */
export const ORDER_PHASE_FLOW: OrderStatus[] = [
  'Confirmado',
  'EnAlistamiento',
  'Alistado',
  'Enviado',
  'Entregado',
];

/** Etiqueta humana de cada estado/fase (única fuente para UI de fases). */
export const PHASE_LABELS: Record<OrderStatus, string> = {
  Confirmado: 'Confirmado',
  EnAlistamiento: 'En alistamiento',
  Alistado: 'Alistado',
  Enviado: 'Despachado',
  Entregado: 'Entregado',
  Pagado: 'Pagado',
  Devolucion: 'Devolución',
  Cancelado: 'Cancelado',
};

export function phaseLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return PHASE_LABELS[status as OrderStatus] ?? status;
}

/** Posición en el pipeline lineal, o -1 si el estado no es parte del flujo. */
export function phaseIndex(status: string | null | undefined): number {
  return ORDER_PHASE_FLOW.indexOf(status as OrderStatus);
}

/** ¿El estado pertenece al pipeline lineal (no es Pagado/Devolución/Cancelado)? */
export function isPipelinePhase(status: string | null | undefined): boolean {
  return phaseIndex(status) >= 0;
}

/** Siguiente fase del pipeline, o null si el estado es terminal/fuera de flujo. */
export function nextPhase(status: string | null | undefined): OrderStatus | null {
  const i = phaseIndex(status);
  if (i < 0 || i >= ORDER_PHASE_FLOW.length - 1) return null;
  return ORDER_PHASE_FLOW[i + 1];
}

/** Fase anterior del pipeline, o null si es la primera/fuera de flujo. */
export function prevPhase(status: string | null | undefined): OrderStatus | null {
  const i = phaseIndex(status);
  if (i <= 0) return null;
  return ORDER_PHASE_FLOW[i - 1];
}

/** ¿Se puede avanzar a una fase siguiente desde este estado? */
export function canAdvance(status: string | null | undefined): boolean {
  return nextPhase(status) !== null;
}

/**
 * Etiqueta del botón "avanzar" según la fase actual (lo que el usuario hará al
 * avanzar). Null si no hay avance posible.
 */
export function advanceActionLabel(status: string | null | undefined): string | null {
  const next = nextPhase(status);
  if (!next) return null;
  switch (next) {
    case 'EnAlistamiento': return 'Iniciar alistamiento';
    case 'Alistado': return 'Marcar alistado';
    case 'Enviado': return 'Despachar';
    case 'Entregado': return 'Marcar entregado';
    default: return `Avanzar a ${phaseLabel(next)}`;
  }
}

/**
 * Valida una transición de estado. Permite:
 *   - avanzar/retroceder UN paso dentro del pipeline,
 *   - saltar a un estado de excepción (Devolucion/Cancelado/Pagado) desde
 *     cualquier estado del pipeline,
 *   - quedarse igual (idempotente).
 * Devuelve true si la transición es válida.
 */
export function isValidTransition(from: string | null | undefined, to: OrderStatus): boolean {
  if (from === to) return true;
  const exceptions: OrderStatus[] = ['Pagado', 'Devolucion', 'Cancelado'];
  if (exceptions.includes(to)) return true;
  const fi = phaseIndex(from);
  const ti = phaseIndex(to);
  if (fi < 0) {
    // Desde una excepción solo se permite volver al inicio del pipeline.
    return to === 'Confirmado';
  }
  return ti >= 0 && Math.abs(ti - fi) === 1;
}
