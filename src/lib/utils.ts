import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Decimales del formato de moneda. Lo fija PrefsApplier según la preferencia
// `currency_format` del owner (mismo patrón que el tenant activo), de modo que la
// opción "Con decimales" de Configuración SÍ tenga efecto en toda la app sin
// tener que pasar el owner a cada `formatCurrency`. SSR usa el default (0).
let _currencyDecimals = 0;

/** Activa/desactiva los decimales del formato de moneda en toda la app. */
export function setCurrencyDecimals(withDecimals: boolean): void {
  _currencyDecimals = withDecimals ? 2 : 0;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: _currencyDecimals,
    maximumFractionDigits: _currencyDecimals,
  }).format(value);
}

/**
 * Normaliza un monto COP escrito como "45000", "45.000", "$ 45.000", "45,000".
 * Devuelve null si no puede interpretarlo o si es negativo.
 * Ignora decimales (COP en la app no los usa).
 */
export function parseCopAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  }
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('-')) return null;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export function whatsappUrl(phone: string, message?: string): string {
  // Normalize Colombian phone: remove spaces, dashes, dots
  let clean = phone.replace(/[\s\-\.()]/g, '');
  // Add country code if missing
  if (clean.startsWith('3') && clean.length === 10) clean = '57' + clean;
  if (!clean.startsWith('+') && !clean.startsWith('57')) clean = '57' + clean;
  const url = `https://wa.me/${clean}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

export function formatShortDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function generateOrderCode(date: Date, sequence: number): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const seq = String(sequence).padStart(2, '0');
  return `4${month}${day}${seq}`;
}

export function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month - 1, d));
  }
  return days;
}

export function getDayOfWeek(date: Date): string {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[date.getDay()];
}

/**
 * Devuelve el nombre de la vendedora a persistir en la BD a partir del
 * identificador de sesión. La sesión guarda el username en minúsculas
 * (ej. "paola"), pero queremos que la columna `vendor` quede con la
 * primera letra en mayúscula para que los conteos por vendedora sean
 * consistentes entre formularios (/orders/new) y el asistente.
 *
 * No se asume ninguna vendedora por defecto: la app es multi-tenant y el
 * vendedor debe reflejar al usuario/negocio real. Si no hay `owner`, se
 * devuelve `fallback` (por defecto cadena vacía).
 */
export function vendorDisplayName(
  owner: string | null | undefined,
  fallback = '',
): string {
  const raw = (owner ?? '').trim();
  if (!raw) return fallback;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Compara vendedores de forma insensible a mayúsculas/espacios. */
export function sameVendor(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}
