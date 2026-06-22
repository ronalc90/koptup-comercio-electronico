/**
 * Validadores de negocio del asistente. El navegador escribe directo a
 * PostgREST, así que la BD tiene los CHECK críticos (migración 009/010). Estas
 * funciones son la PRIMERA línea (defensa en profundidad) para que el chat no
 * intente persistir basura que el LLM pudo inventar: estados fuera del enum,
 * categorías que no existen en el negocio, montos negativos, etc. Dan además un
 * mensaje claro a la usuaria en vez de un error 400 críptico de la BD.
 */
import {
  ORDER_STATUSES,
  EXPENSE_CATEGORIES,
  type OrderStatus,
  type ExpenseCategory,
} from './constants';

function stripAccentsLower(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Valida un estado de pedido contra el enum (case-insensitive, normaliza acentos). */
export function normalizeOrderStatus(raw: unknown): OrderStatus | null {
  if (typeof raw !== 'string') return null;
  const target = stripAccentsLower(raw);
  return (
    ORDER_STATUSES.find((s) => stripAccentsLower(s) === target) ?? null
  );
}

export function isValidOrderStatus(raw: unknown): boolean {
  return normalizeOrderStatus(raw) !== null;
}

/**
 * Normaliza la categoría de un gasto al conjunto permitido. Si no coincide,
 * cae a 'otro' (nunca rechaza un gasto por una categoría rara, pero tampoco
 * persiste una categoría inventada).
 */
export function normalizeExpenseCategory(raw: unknown): ExpenseCategory {
  if (typeof raw !== 'string') return 'otro';
  const target = stripAccentsLower(raw);
  const match = EXPENSE_CATEGORIES.find((c) => stripAccentsLower(c) === target);
  return match ?? 'otro';
}

/**
 * Resuelve la categoría de un item de inventario contra las categorías del
 * negocio (tenant). Devuelve la categoría EXACTA del catálogo si coincide
 * (ignorando acentos/mayúsculas); si el LLM mandó algo que no existe, cae a la
 * primera categoría del negocio (en vez de persistir una categoría fantasma).
 */
export function resolveTenantCategory(
  raw: unknown,
  tenantCategories: string[],
): string {
  const fallback = tenantCategories[0] ?? 'Otro';
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const target = stripAccentsLower(raw);
  return tenantCategories.find((c) => stripAccentsLower(c) === target) ?? fallback;
}

/** Un monto válido para la BD: número finito >= 0. */
export function isNonNegativeAmount(n: unknown): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

/** Cantidad de unidades válida: entero >= 1 (default 1). */
export function normalizeQuantity(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Normaliza la talla a un vocabulario CONSISTENTE con el selector de la UI
 * (inventory/page.tsx SIZES: XS/S/M/L/XL/XXL, 35-42, 'Única'). Así un item creado
 * por el chat se puede filtrar/buscar igual que uno creado a mano.
 * - Sin talla / vacío / sinónimos de unitalla → 'Única'.
 * - Tallas alfabéticas (s, m, l, xl…) → MAYÚSCULAS.
 * - Números u otros formatos del negocio → tal cual (NO se convierten a rangos).
 */
export function normalizeInventorySize(raw: unknown): string {
  if (typeof raw !== 'string') return 'Única';
  const t = raw.trim();
  if (!t) return 'Única';
  const key = stripAccentsLower(t);
  if (['u', 'unica', 'unitalla', 'talla unica', 'sin talla', 'na', 'n/a', 'ninguna'].includes(key)) {
    return 'Única';
  }
  if (/^[a-z]{1,3}$/.test(key)) return t.toUpperCase(); // S, M, L, XL, XXL
  return t; // números (38) o formato propio del negocio, sin tocar
}

/** Cantidad de stock válida para ajuste: entero >= 0 (permite 0). null si inválida. */
export function normalizeStockQuantity(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** Valida una fecha en formato YYYY-MM-DD (y que sea una fecha real). */
export function isValidDateString(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(raw + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && raw === d.toISOString().slice(0, 10);
}

/**
 * Resuelve un rango de fechas [from, to] para búsquedas. Si solo viene un
 * extremo, usa `today` como el otro. Si from > to, los intercambia. Devuelve
 * null si ninguna fecha válida (el caller cae a su default).
 */
export function resolveDateRange(
  rawFrom: unknown,
  rawTo: unknown,
  today: string,
): { from: string; to: string } | null {
  const from = isValidDateString(rawFrom) ? rawFrom : null;
  const to = isValidDateString(rawTo) ? rawTo : null;
  if (!from && !to) return null;
  let a = from ?? today;
  let b = to ?? today;
  if (a > b) [a, b] = [b, a];
  return { from: a, to: b };
}
