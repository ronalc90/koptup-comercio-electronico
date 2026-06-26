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
