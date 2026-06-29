'use client';

import { useCallback, useEffect, useState } from 'react';
import { Boxes, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import { periodRange, PERIOD_LABELS, type Period } from '@/lib/dateRanges';

interface ConsumoRow { supplierId: number | null; name: string; units: number; cost: number }
interface PayableRow { supplierId: number; owed: number; status: 'al_dia' | 'por_vencer' | 'vencido' }
interface MergedRow { id: number | null; name: string; units: number; cost: number; owed: number; status: PayableRow['status'] | null }

const STATUS_DOT: Record<string, string> = {
  vencido: 'bg-red-500',
  por_vencer: 'bg-amber-500',
  al_dia: 'bg-emerald-500',
};

/**
 * Sección "Consumo de proveedores" del Dashboard (Fase B). Selector DÍA/SEMANA/MES
 * con un clic; por proveedor: unidades y $ consumidos en el periodo + cuánto se
 * le debe (semáforo). Reutiliza /api/suppliers/reports (lógica pura ya testeada).
 * Si el módulo de proveedores no aplica (403) o no hay datos, no estorba.
 */
export default function SupplierConsumo() {
  const [period, setPeriod] = useState<Period>('mes');
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [rows, setRows] = useState<MergedRow[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalOwed, setTotalOwed] = useState(0);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { from, to } = periodRange(p, today);
      const qs = new URLSearchParams({ type: 'consumo', from, to });
      const [cRes, pRes] = await Promise.all([
        fetch(`/api/suppliers/reports?${qs.toString()}`, { cache: 'no-store' }),
        fetch('/api/suppliers/reports?type=payables', { cache: 'no-store' }),
      ]);
      if (cRes.status === 403) { setHidden(true); return; }
      const cJson = await cRes.json().catch(() => null);
      const pJson = await pRes.json().catch(() => null);
      const consumo: ConsumoRow[] = cJson?.report?.rows ?? [];
      const payables: PayableRow[] = pJson?.report?.rows ?? [];
      const owedById = new Map<number, PayableRow>();
      for (const r of payables) owedById.set(r.supplierId, r);

      const merged: MergedRow[] = consumo
        .filter((r) => r.units > 0 || r.cost > 0)
        .map((r) => {
          const pay = r.supplierId != null ? owedById.get(r.supplierId) : undefined;
          return { id: r.supplierId, name: r.name, units: r.units, cost: r.cost, owed: pay?.owed ?? 0, status: pay?.status ?? null };
        });
      setRows(merged);
      setTotalCost(cJson?.report?.totalCost ?? 0);
      setTotalOwed(pJson?.report?.totalOwed ?? 0);
    } catch {
      setHidden(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  if (hidden) return null;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <Boxes className="w-4 h-4" /> Consumo de proveedores
        </h2>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
          {(['dia', 'semana', 'mes'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${period === p ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">Sin consumo de proveedores en este periodo.</p>
      ) : (
        <>
          <ul className="divide-y divide-gray-50">
            {rows.map((r) => (
              <li key={r.id ?? 'na'} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                    {r.status && <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[r.status]}`} />}
                    {r.name}
                  </p>
                  <p className="text-xs text-gray-400">{r.units} u · consumo {formatCurrency(r.cost)}</p>
                </div>
                {r.owed > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-gray-700">debe {formatCurrency(r.owed)}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-2.5 text-sm">
            <span className="text-gray-500">Total consumo: <b className="text-gray-900">{formatCurrency(totalCost)}</b></span>
            <span className="text-gray-500">Por pagar: <b className="text-gray-900">{formatCurrency(totalOwed)}</b></span>
          </div>
          <Link href="/suppliers" className="flex items-center justify-center gap-1 border-t border-gray-100 px-4 py-2.5 text-xs font-semibold text-purple-700 hover:bg-purple-50">
            Ver proveedores y cuentas por pagar <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </>
      )}
    </div>
  );
}
