/**
 * Preferencias del usuario persistidas en localStorage.
 * Scoped por "owner" (cuenta) para que cada usuario tenga las suyas.
 */

export type PrintFontSize = 'small' | 'medium' | 'large' | 'custom';

export interface PrintSizes {
  header: number; // pt
  body: number;
  bold: number;
  footer: number;
}

export const PRINT_PRESETS: Record<Exclude<PrintFontSize, 'custom'>, PrintSizes> = {
  small:  { header: 10, body: 10, bold: 11, footer: 8 },
  medium: { header: 11, body: 12, bold: 13, footer: 9 },
  large:  { header: 12, body: 14, bold: 15, footer: 10 },
};

export const PRINT_SIZE_MIN = 6;
export const PRINT_SIZE_MAX = 24;
const DEFAULT_CUSTOM_SIZES: PrintSizes = { ...PRINT_PRESETS.medium };
export type UiFontSize = 'small' | 'medium' | 'large' | 'xlarge';
export type ThemeMode = 'light' | 'dark' | 'system';
export type UiDensity = 'comfortable' | 'compact';
export type CurrencyFormat = 'cop-nodecimals' | 'cop-decimals';

const DEFAULT_PRINT_FONT_SIZE: PrintFontSize = 'medium';
const DEFAULT_UI_FONT_SIZE: UiFontSize = 'medium';
const DEFAULT_THEME: ThemeMode = 'light';
const DEFAULT_DENSITY: UiDensity = 'comfortable';
const DEFAULT_CURRENCY: CurrencyFormat = 'cop-nodecimals';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function scopeOf(owner: string | null | undefined): string {
  return (owner ?? 'default').trim() || 'default';
}
function keyFor(owner: string | null | undefined, name: string): string {
  return `koptup.pref.${scopeOf(owner)}.${name}`;
}
/** Clave histórica (prefijo meraki.*) que se lee como respaldo y se migra al nuevo. */
function legacyKeyFor(owner: string | null | undefined, name: string): string {
  return `meraki.pref.${scopeOf(owner)}.${name}`;
}

function getString(owner: string | null | undefined, name: string): string | null {
  if (!isBrowser()) return null;
  try {
    const v = window.localStorage.getItem(keyFor(owner, name));
    if (v !== null) return v;
    // Respaldo: preferencia guardada antes del rebrand → se migra al prefijo nuevo.
    const legacy = window.localStorage.getItem(legacyKeyFor(owner, name));
    if (legacy !== null) {
      try { window.localStorage.setItem(keyFor(owner, name), legacy); } catch { /* ignore */ }
    }
    return legacy;
  } catch { return null; }
}

function setString(owner: string | null | undefined, name: string, value: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(keyFor(owner, name), value);
  } catch { /* ignore */ }
}

function getBool(owner: string | null | undefined, name: string, fallback: boolean): boolean {
  const v = getString(owner, name);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

function setBool(owner: string | null | undefined, name: string, value: boolean): void {
  setString(owner, name, value ? 'true' : 'false');
}

/* ─────────── Print font size (tamaño de letra impresión) ─────────── */

export function getPrintFontSize(owner: string | null | undefined): PrintFontSize {
  const v = getString(owner, 'print_font_size');
  if (v === 'small' || v === 'medium' || v === 'large' || v === 'custom') return v;
  return DEFAULT_PRINT_FONT_SIZE;
}

export function setPrintFontSize(owner: string | null | undefined, value: PrintFontSize): void {
  setString(owner, 'print_font_size', value);
}

export const PRINT_FONT_LABELS: Record<PrintFontSize, string> = {
  small: 'Pequeño',
  medium: 'Mediano',
  large: 'Grande',
  custom: 'Personalizado',
};

function clampPt(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CUSTOM_SIZES.body;
  return Math.min(PRINT_SIZE_MAX, Math.max(PRINT_SIZE_MIN, Math.round(n * 10) / 10));
}

export function getPrintCustomSizes(owner: string | null | undefined): PrintSizes {
  const raw = getString(owner, 'print_custom_sizes');
  if (!raw) return { ...DEFAULT_CUSTOM_SIZES };
  try {
    const parsed = JSON.parse(raw) as Partial<PrintSizes>;
    return {
      header: clampPt(Number(parsed.header ?? DEFAULT_CUSTOM_SIZES.header)),
      body: clampPt(Number(parsed.body ?? DEFAULT_CUSTOM_SIZES.body)),
      bold: clampPt(Number(parsed.bold ?? DEFAULT_CUSTOM_SIZES.bold)),
      footer: clampPt(Number(parsed.footer ?? DEFAULT_CUSTOM_SIZES.footer)),
    };
  } catch {
    return { ...DEFAULT_CUSTOM_SIZES };
  }
}

export function setPrintCustomSizes(owner: string | null | undefined, sizes: PrintSizes): void {
  const clamped: PrintSizes = {
    header: clampPt(sizes.header),
    body: clampPt(sizes.body),
    bold: clampPt(sizes.bold),
    footer: clampPt(sizes.footer),
  };
  setString(owner, 'print_custom_sizes', JSON.stringify(clamped));
}

/** Devuelve los tamaños efectivos (en pt) según el modo seleccionado. */
export function resolvePrintSizes(owner: string | null | undefined): PrintSizes {
  const mode = getPrintFontSize(owner);
  if (mode === 'custom') return getPrintCustomSizes(owner);
  return { ...PRINT_PRESETS[mode] };
}

/* ─────────── UI font size (tamaño de letra aplicación) ─────────── */

export function getUiFontSize(owner: string | null | undefined): UiFontSize {
  const v = getString(owner, 'ui_font_size');
  if (v === 'small' || v === 'medium' || v === 'large' || v === 'xlarge') return v;
  return DEFAULT_UI_FONT_SIZE;
}

export function setUiFontSize(owner: string | null | undefined, value: UiFontSize): void {
  setString(owner, 'ui_font_size', value);
}

export const UI_FONT_LABELS: Record<UiFontSize, string> = {
  small: 'Pequeño',
  medium: 'Normal',
  large: 'Grande',
  xlarge: 'Muy grande',
};

export const UI_FONT_SCALE: Record<UiFontSize, number> = {
  small: 0.9,
  medium: 1,
  large: 1.125,
  xlarge: 1.25,
};

/* ─────────── Theme mode (modo claro / oscuro / sistema) ─────────── */

export function getThemeMode(owner: string | null | undefined): ThemeMode {
  const v = getString(owner, 'theme_mode');
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return DEFAULT_THEME;
}

export function setThemeMode(owner: string | null | undefined, value: ThemeMode): void {
  setString(owner, 'theme_mode', value);
}

export const THEME_LABELS: Record<ThemeMode, string> = {
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema',
};

/* ─────────── UI density (densidad de la interfaz) ─────────── */

export function getUiDensity(owner: string | null | undefined): UiDensity {
  const v = getString(owner, 'ui_density');
  if (v === 'comfortable' || v === 'compact') return v;
  return DEFAULT_DENSITY;
}

export function setUiDensity(owner: string | null | undefined, value: UiDensity): void {
  setString(owner, 'ui_density', value);
}

export const DENSITY_LABELS: Record<UiDensity, string> = {
  comfortable: 'Cómoda',
  compact: 'Compacta',
};

/* ─────────── Currency format ─────────── */

export function getCurrencyFormat(owner: string | null | undefined): CurrencyFormat {
  const v = getString(owner, 'currency_format');
  if (v === 'cop-nodecimals' || v === 'cop-decimals') return v;
  return DEFAULT_CURRENCY;
}

export function setCurrencyFormat(owner: string | null | undefined, value: CurrencyFormat): void {
  setString(owner, 'currency_format', value);
}

export const CURRENCY_LABELS: Record<CurrencyFormat, string> = {
  'cop-nodecimals': 'Sin decimales ($ 15.000)',
  'cop-decimals': 'Con decimales ($ 15.000,00)',
};

/* ─────────── Reduce motion (accesibilidad) ─────────── */

export function getReduceMotion(owner: string | null | undefined): boolean {
  return getBool(owner, 'reduce_motion', false);
}

export function setReduceMotion(owner: string | null | undefined, value: boolean): void {
  setBool(owner, 'reduce_motion', value);
}

/* ─────────── Sonidos de confirmación ─────────── */

export function getSoundsEnabled(owner: string | null | undefined): boolean {
  return getBool(owner, 'sounds_enabled', true);
}

export function setSoundsEnabled(owner: string | null | undefined, value: boolean): void {
  setBool(owner, 'sounds_enabled', value);
}

/* ─────────── Confirmar antes de borrar ─────────── */

export function getConfirmDestructive(owner: string | null | undefined): boolean {
  return getBool(owner, 'confirm_destructive', true);
}

export function setConfirmDestructive(owner: string | null | undefined, value: boolean): void {
  setBool(owner, 'confirm_destructive', value);
}

/* ─────────── Auto abrir diálogo de impresión ─────────── */

export function getAutoOpenPrintDialog(owner: string | null | undefined): boolean {
  return getBool(owner, 'auto_print_dialog', false);
}

export function setAutoOpenPrintDialog(owner: string | null | undefined, value: boolean): void {
  setBool(owner, 'auto_print_dialog', value);
}

/* ─────────── Mostrar logo en guías de despacho ─────────── */

export function getShowPrintLogo(owner: string | null | undefined): boolean {
  return getBool(owner, 'show_print_logo', true);
}

export function setShowPrintLogo(owner: string | null | undefined, value: boolean): void {
  setBool(owner, 'show_print_logo', value);
}

/* ─────────── Borrado total: limpiar prefs locales ─────────── */

export function clearAllPreferences(owner: string | null | undefined): void {
  if (!isBrowser()) return;
  try {
    const scope = (owner ?? 'default').trim() || 'default';
    // Limpia el prefijo nuevo y el histórico (meraki.*) por si quedaron datos.
    const prefixes = [`koptup.pref.${scope}.`, `meraki.pref.${scope}.`];
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && prefixes.some((p) => k.startsWith(p))) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch { /* ignore */ }
}
