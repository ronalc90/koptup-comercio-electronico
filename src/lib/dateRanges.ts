/**
 * Rangos de fecha para el selector DÍA/SEMANA/MES (lógica PURA, UTC, testeable).
 * `today` es 'YYYY-MM-DD'. Devuelve { from, to } inclusivos.
 *   - dia:    hoy..hoy
 *   - semana: lunes de la semana de hoy..hoy
 *   - mes:    día 1 del mes..hoy
 */
export type Period = 'dia' | 'semana' | 'mes';

export const PERIOD_LABELS: Record<Period, string> = {
  dia: 'Día',
  semana: 'Semana',
  mes: 'Mes',
};

function parse(iso: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  return { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) };
}
function iso(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function periodRange(period: Period, today: string): { from: string; to: string } {
  const p = parse(today);
  if (!p) return { from: today, to: today };
  const todayMs = Date.UTC(p.y, p.m0, p.d);
  if (period === 'dia') return { from: today, to: today };
  if (period === 'mes') return { from: iso(Date.UTC(p.y, p.m0, 1)), to: today };
  // semana: lunes de la semana de hoy (getUTCDay: 0=domingo..6=sábado).
  const dow = new Date(todayMs).getUTCDay();
  const backToMonday = (dow + 6) % 7; // domingo→6, lunes→0, martes→1…
  return { from: iso(todayMs - backToMonday * 86_400_000), to: today };
}
