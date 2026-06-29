/**
 * Lógica de licencia/facturación (pura, testeable). El cobro lo registra el
 * superadmin (manual o, a futuro, vía pasarela); aquí derivamos el ESTADO de la
 * licencia a partir de la fecha de vencimiento y calculamos días restantes.
 */
export type LicenseStatus = 'trial' | 'active' | 'expired' | 'suspended';

export interface LicenseState {
  status: LicenseStatus;
  /** Días que faltan para vencer (negativo si ya venció). null en trial/suspended. */
  daysLeft: number | null;
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(fromISO + 'T00:00:00Z');
  const b = Date.parse(toISO + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

/**
 * Estado de licencia.
 * @param billingStatus valor en BD: 'trial' | 'active' | 'suspended' | 'cancelled'
 * @param licenseUntil  fecha 'YYYY-MM-DD' de vencimiento, o null
 * @param todayISO      fecha actual 'YYYY-MM-DD' (se inyecta para testear)
 */
export function licenseState(
  billingStatus: string | null | undefined,
  licenseUntil: string | null | undefined,
  todayISO: string,
): LicenseState {
  if (billingStatus === 'suspended' || billingStatus === 'cancelled') {
    return { status: 'suspended', daysLeft: null };
  }
  if (!licenseUntil) {
    return { status: 'trial', daysLeft: null };
  }
  const daysLeft = daysBetween(todayISO, licenseUntil);
  return { status: daysLeft >= 0 ? 'active' : 'expired', daysLeft };
}

export const LICENSE_LABELS: Record<LicenseStatus, string> = {
  trial: 'Prueba',
  active: 'Activa',
  expired: 'Vencida',
  suspended: 'Suspendida',
};

/** Suma el total pagado a partir del historial de cargos. */
export function totalPaid(charges: ReadonlyArray<{ amount: number }>): number {
  return charges.reduce((s, c) => s + (c.amount || 0), 0);
}

/**
 * Efecto sobre la licencia de un evento de Stripe (puro y testeable). El webhook
 * traduce el tipo de evento a qué hacer con la licencia del negocio:
 *  - pagos OK → extender 1 mes y dejar la licencia ACTIVA.
 *  - fallo/cancelación → SUSPENDER (no se borran datos; solo se bloquea según el plan).
 *  - cualquier otro evento → no hacer nada (ack).
 */
export interface StripeBillingEffect {
  extendLicense: boolean;
  billingStatus: 'active' | 'suspended' | null;
}
export function billingEffectForEvent(eventType: string): StripeBillingEffect {
  switch (eventType) {
    // El pago de una factura (primera y renovaciones) extiende 1 mes y cobra.
    // OJO: Stripe emite `invoice.paid` Y `invoice.payment_succeeded` por el MISMO
    // pago, con `event.id` distinto. Ambos se mapean a "extender" porque cualquiera
    // basta como señal; la NO duplicación la garantiza la clave de idempotencia
    // por factura (`billingIdempotencyKey`), no el tipo de evento.
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return { extendLicense: true, billingStatus: 'active' };
    // El checkout solo ACTIVA el plan; NO extiende ni cobra (de eso se encarga
    // invoice.paid, que también dispara en la primera suscripción) → evita el
    // doble cobro/extensión en el alta.
    case 'checkout.session.completed':
      return { extendLicense: false, billingStatus: 'active' };
    case 'invoice.payment_failed':
    case 'customer.subscription.deleted':
      return { extendLicense: false, billingStatus: 'suspended' };
    default:
      return { extendLicense: false, billingStatus: null };
  }
}

/**
 * Clave de idempotencia para registrar un cargo / extender licencia.
 *
 * Se deriva de la FACTURA, no del evento: en los eventos de factura
 * (`invoice.paid` / `invoice.payment_succeeded`) `event.data.object` ES la
 * factura, así que su `id` (in_…) es ESTABLE entre los dos eventos gemelos del
 * mismo pago. Usar el id de factura como clave hace que el segundo evento (y los
 * reintentos de Stripe) choquen con el índice único `uq_charges_stripe_event` y
 * no vuelvan a cobrar ni extender. Las renovaciones mensuales generan facturas
 * distintas, así que siguen registrándose como cargos separados.
 *
 * Se prefija `inv:` para no colisionar con las filas históricas que guardaban el
 * `event.id` (evt_…). Si no hay id de factura, cae al `fallback` (event.id).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function billingIdempotencyKey(obj: any, fallback: string): string {
  const invoiceId = obj?.id;
  return typeof invoiceId === 'string' && invoiceId ? `inv:${invoiceId}` : fallback;
}

/**
 * Avanza una fecha 'YYYY-MM-DD' N meses (para extender la licencia), fijando el
 * día al último válido del mes destino (ej. 31-ene + 1 mes = 28/29-feb, no
 * desborda a marzo).
 */
export function addMonths(dateISO: string, months: number): string {
  const d = new Date(dateISO + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}
