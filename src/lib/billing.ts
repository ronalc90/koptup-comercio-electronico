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

/** Avanza una fecha 'YYYY-MM-DD' N meses (para extender la licencia). */
export function addMonths(dateISO: string, months: number): string {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
