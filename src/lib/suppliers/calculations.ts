/**
 * Lógica PURA (sin IO, determinista, testeable) de los reportes de proveedores.
 *
 * El negocio factura UN recibo al cliente, pero internamente necesita, sobre lo
 * YA VENDIDO/DESPACHADO, el desglose por proveedor:
 *   1) consumoPorProveedor      — unidades y $ a costo por proveedor.
 *   2) cuentasPorPagarPorProveedor — lo adeudado cruzado con día de corte + plazo,
 *      con estado al_dia / por_vencer / vencido.
 *   3) rotacionPorProveedor     — unidades movidas en ventanas (7 y 30 días),
 *      con ranking de estancados.
 *
 * El costo unitario está CONGELADO en la fila del pedido (orders.product_cost) y
 * el proveedor también (orders.supplier_id), resueltos al momento de la venta.
 */
import { ACTIVE_REVENUE_STATUSES, type OrderStatus } from '@/lib/assistant/constants';

export interface SupplierLite {
  id: number;
  name: string;
  /** Plazo de pago en días desde el corte. */
  plazo_dias: number;
  /** Día del mes en que cierra el corte (1..31). */
  dia_corte: number;
}

/** Fila de pedido (una fila = un producto) con lo mínimo para los cálculos. */
export interface SoldOrderLite {
  supplier_id: number | null;
  /** Costo unitario congelado al vender. */
  product_cost: number | null;
  quantity: number | null;
  value_to_collect: number | null;
  delivery_status: string;
  /** YYYY-MM-DD */
  order_date: string;
}

export interface DateRange {
  from: string;
  to: string;
}

const ACTIVE = new Set<string>(ACTIVE_REVENUE_STATUSES as OrderStatus[]);

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Cantidad efectiva de una línea (la BD garantiza >= 1; null ⇒ 1). */
function qtyOf(o: SoldOrderLite): number {
  const q = Math.round(num(o.quantity));
  return q >= 1 ? q : 1;
}

/** Costo total congelado de una línea = costo unitario × cantidad. */
function lineCost(o: SoldOrderLite): number {
  return num(o.product_cost) * qtyOf(o);
}

function isActiveSale(o: SoldOrderLite): boolean {
  return ACTIVE.has(o.delivery_status);
}

function inRange(date: string, range?: DateRange | null): boolean {
  if (!range) return true;
  return date >= range.from && date <= range.to;
}

// ── Helpers de fecha puros (UTC, sin Date.now) ──────────────────────────────

function parseISO(iso: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const y = Number(m[1]);
  const m0 = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (m0 < 0 || m0 > 11 || d < 1 || d > 31) return null;
  return { y, m0, d };
}

function toISO(utcMs: number): string {
  const dt = new Date(utcMs);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function msOf(iso: string): number | null {
  const p = parseISO(iso);
  if (!p) return null;
  return Date.UTC(p.y, p.m0, p.d);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function clampDay(year: number, month0: number, day: number): number {
  return Math.min(day, daysInMonth(year, month0));
}

export function addDays(iso: string, days: number): string {
  const ms = msOf(iso);
  if (ms === null) return iso;
  return toISO(ms + days * 86_400_000);
}

/** Días entre dos fechas (b - a). Positivo si b es posterior. */
export function daysBetween(aIso: string, bIso: string): number {
  const a = msOf(aIso);
  const b = msOf(bIso);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Último corte (fecha) en o antes de `today` para un `dia_corte` del mes.
 * Si el día de hoy ya pasó el corte de este mes, es el de este mes; si no, el del
 * mes anterior. El día se ajusta a la longitud real del mes (ej. corte 31 en feb).
 */
export function lastCutoffOnOrBefore(todayIso: string, diaCorte: number): string {
  const t = parseISO(todayIso);
  if (!t) return todayIso;
  const dc = Math.min(Math.max(Math.round(diaCorte), 1), 31);
  const thisDay = clampDay(t.y, t.m0, dc);
  const thisCut = Date.UTC(t.y, t.m0, thisDay);
  const todayMs = Date.UTC(t.y, t.m0, t.d);
  if (todayMs >= thisCut) return toISO(thisCut);
  // Mes anterior.
  const pm0 = t.m0 === 0 ? 11 : t.m0 - 1;
  const py = t.m0 === 0 ? t.y - 1 : t.y;
  return toISO(Date.UTC(py, pm0, clampDay(py, pm0, dc)));
}

// ── 1) Consumo por proveedor ────────────────────────────────────────────────

export interface ConsumoRow {
  supplierId: number | null;
  name: string;
  units: number;
  cost: number;
}

export interface ConsumoReport {
  rows: ConsumoRow[];
  /** Bucket de líneas sin proveedor asignado (o null si no hay). */
  unassigned: { units: number; cost: number } | null;
  totalUnits: number;
  totalCost: number;
  totalRevenue: number;
  /** Utilidad bruta = ingresos − costo de proveedor (lo del ejemplo del cliente). */
  grossProfit: number;
}

/**
 * Consumo (unidades y $ a costo) por proveedor sobre las ventas ACTIVAS del rango.
 * Incluye TODOS los proveedores (los sin ventas salen en 0) y un bucket aparte
 * para las líneas sin proveedor asignado.
 */
export function consumoPorProveedor(
  orders: SoldOrderLite[],
  suppliers: SupplierLite[],
  range?: DateRange | null,
): ConsumoReport {
  const byId = new Map<number, ConsumoRow>();
  for (const s of suppliers) byId.set(s.id, { supplierId: s.id, name: s.name, units: 0, cost: 0 });
  const unassigned = { units: 0, cost: 0 };
  let hasUnassigned = false;

  let totalUnits = 0;
  let totalCost = 0;
  let totalRevenue = 0;

  for (const o of orders) {
    if (!isActiveSale(o) || !inRange(o.order_date, range)) continue;
    const units = qtyOf(o);
    const cost = lineCost(o);
    totalUnits += units;
    totalCost += cost;
    totalRevenue += num(o.value_to_collect);

    if (o.supplier_id == null) {
      hasUnassigned = true;
      unassigned.units += units;
      unassigned.cost += cost;
      continue;
    }
    const row = byId.get(o.supplier_id);
    if (row) {
      row.units += units;
      row.cost += cost;
    } else {
      // Proveedor referenciado pero no presente en la lista (defensa).
      byId.set(o.supplier_id, { supplierId: o.supplier_id, name: `#${o.supplier_id}`, units, cost });
    }
  }

  const rows = [...byId.values()].sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));
  return {
    rows,
    unassigned: hasUnassigned ? unassigned : null,
    totalUnits,
    totalCost,
    totalRevenue,
    grossProfit: totalRevenue - totalCost,
  };
}

// ── 2) Cuentas por pagar por proveedor ──────────────────────────────────────

export type PayableStatus = 'al_dia' | 'por_vencer' | 'vencido';

export interface PayableRow {
  supplierId: number;
  name: string;
  owed: number;
  /** Fecha de corte aplicada (YYYY-MM-DD). */
  cutoff: string;
  /** Fecha de vencimiento del pago (corte + plazo). */
  dueDate: string;
  /** Días hasta el vencimiento (negativo = ya vencido). */
  daysToDue: number;
  status: PayableStatus;
}

export interface PayablesReport {
  rows: PayableRow[];
  totalOwed: number;
}

const STATUS_ORDER: Record<PayableStatus, number> = { vencido: 0, por_vencer: 1, al_dia: 2 };

/**
 * Cuentas por pagar por proveedor: lo adeudado (costo de lo vendido/despachado)
 * cruzado con el día de corte + plazo de cada proveedor, con semáforo de
 * vencimiento relativo a `today`. `warnDays` define la ventana "por vencer".
 */
export function cuentasPorPagarPorProveedor(
  orders: SoldOrderLite[],
  suppliers: SupplierLite[],
  today: string,
  opts?: { warnDays?: number; range?: DateRange | null },
): PayablesReport {
  const warnDays = opts?.warnDays ?? 5;
  const owedById = new Map<number, number>();
  for (const o of orders) {
    if (!isActiveSale(o) || o.supplier_id == null || !inRange(o.order_date, opts?.range)) continue;
    owedById.set(o.supplier_id, (owedById.get(o.supplier_id) ?? 0) + lineCost(o));
  }

  const rows: PayableRow[] = suppliers.map((s) => {
    const owed = owedById.get(s.id) ?? 0;
    const cutoff = lastCutoffOnOrBefore(today, s.dia_corte);
    const dueDate = addDays(cutoff, Math.max(0, Math.round(num(s.plazo_dias))));
    const daysToDue = daysBetween(today, dueDate);
    let status: PayableStatus;
    if (owed <= 0) status = 'al_dia';
    else if (daysToDue < 0) status = 'vencido';
    else if (daysToDue <= warnDays) status = 'por_vencer';
    else status = 'al_dia';
    return { supplierId: s.id, name: s.name, owed, cutoff, dueDate, daysToDue, status };
  });

  rows.sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.dueDate.localeCompare(b.dueDate),
  );
  const totalOwed = rows.reduce((acc, r) => acc + r.owed, 0);
  return { rows, totalOwed };
}

// ── 3) Rotación por proveedor ───────────────────────────────────────────────

export interface RotacionRow {
  supplierId: number;
  name: string;
  unitsShort: number; // ventana corta (def. 7 días)
  unitsLong: number; // ventana larga (def. 30 días)
  /** Sin movimiento en la ventana larga. */
  estancado: boolean;
}

export interface RotacionReport {
  rows: RotacionRow[];
  shortDays: number;
  longDays: number;
}

/**
 * Rotación por proveedor: unidades vendidas en las últimas `shortDays` y
 * `longDays` (def. 7 y 30) relativas a `today`. Ordena de MENOS a más movimiento
 * (ranking de estancados primero).
 */
export function rotacionPorProveedor(
  orders: SoldOrderLite[],
  suppliers: SupplierLite[],
  today: string,
  opts?: { shortDays?: number; longDays?: number },
): RotacionReport {
  const shortDays = opts?.shortDays ?? 7;
  const longDays = opts?.longDays ?? 30;
  const shortFrom = addDays(today, -shortDays);
  const longFrom = addDays(today, -longDays);

  const shortById = new Map<number, number>();
  const longById = new Map<number, number>();
  for (const o of orders) {
    if (!isActiveSale(o) || o.supplier_id == null) continue;
    const units = qtyOf(o);
    if (o.order_date >= longFrom && o.order_date <= today) {
      longById.set(o.supplier_id, (longById.get(o.supplier_id) ?? 0) + units);
      if (o.order_date >= shortFrom) {
        shortById.set(o.supplier_id, (shortById.get(o.supplier_id) ?? 0) + units);
      }
    }
  }

  const rows: RotacionRow[] = suppliers.map((s) => {
    const unitsLong = longById.get(s.id) ?? 0;
    const unitsShort = shortById.get(s.id) ?? 0;
    return { supplierId: s.id, name: s.name, unitsShort, unitsLong, estancado: unitsLong === 0 };
  });
  rows.sort((a, b) => a.unitsLong - b.unitsLong || a.unitsShort - b.unitsShort || a.name.localeCompare(b.name));
  return { rows, shortDays, longDays };
}
