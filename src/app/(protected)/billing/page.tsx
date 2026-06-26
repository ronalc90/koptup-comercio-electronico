'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CreditCard, Package, CalendarClock, Receipt, Sparkles } from 'lucide-react';
import { formatCOP, PLANS, type Plan } from '@/lib/plans';
import { LICENSE_LABELS, type LicenseStatus } from '@/lib/billing';

interface Charge {
  id: number; amount: number; concept: string | null;
  period_start: string | null; period_end: string | null; paid_at: string;
}
interface Billing {
  plan: string; planLabel: string; price: number;
  productLimit: number | null; productCount: number;
  license: { status: LicenseStatus; daysLeft: number | null };
  licenseUntil: string | null; totalPaid: number; charges: Charge[];
  paymentsEnabled?: boolean; purchasablePlans?: string[];
}

const STATUS_STYLE: Record<LicenseStatus, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  trial: 'bg-slate-50 text-slate-600 border-slate-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
  suspended: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function BillingPage() {
  const [b, setB] = useState<Billing | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch('/api/billing', { cache: 'no-store' });
      if (res.status === 403) { if (active) { setDenied(true); setLoading(false); } return; }
      const json = await res.json().catch(() => null);
      if (active) { setB(json && !json.error ? json : null); setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  // Mensaje al volver de Stripe (success/cancel).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('paid') === '1') toast.success('¡Pago recibido! Tu licencia se actualiza en unos segundos.');
    else if (q.get('cancel') === '1') toast('Pago cancelado.', { icon: 'ℹ️' });
  }, []);

  async function startCheckout(plan: string) {
    setPaying(plan);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.url) { window.location.href = json.url; return; }
      toast.error(json.error || 'No se pudo iniciar el pago');
    } catch {
      toast.error('Error al iniciar el pago');
    } finally {
      setPaying(null);
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Cargando…</p>;
  if (denied) return <p className="text-sm text-gray-500">La facturación es solo para administradores.</p>;
  if (!b) return <p className="text-sm text-red-500">No se pudo cargar la facturación.</p>;

  const pct = b.productLimit ? Math.min(100, Math.round((b.productCount / b.productLimit) * 100)) : 0;
  const near = b.productLimit !== null && b.productCount / b.productLimit >= 0.8;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <CreditCard className="w-6 h-6" style={{ color: 'var(--brand-primary, #7c3aed)' }} />
        <h1 className="text-2xl font-bold text-gray-900">Mi licencia</h1>
      </div>

      {/* Plan + licencia */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Plan</p>
          <p className="text-2xl font-bold text-gray-900">{b.planLabel}</p>
          <p className="text-sm text-gray-500">{b.price === 0 ? 'Gratis' : `${formatCOP(b.price)} / mes`}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <CalendarClock className="w-3.5 h-3.5" /> Licencia
          </p>
          <span className={`inline-block mt-1 rounded-lg border px-2 py-0.5 text-sm font-semibold ${STATUS_STYLE[b.license.status]}`}>
            {LICENSE_LABELS[b.license.status]}
          </span>
          {b.licenseUntil && (
            <p className="text-sm text-gray-500 mt-1">
              Vence el {b.licenseUntil}
              {b.license.daysLeft !== null && b.license.daysLeft >= 0 && ` · ${b.license.daysLeft} día(s)`}
              {b.license.daysLeft !== null && b.license.daysLeft < 0 && ` · vencida hace ${-b.license.daysLeft} día(s)`}
            </p>
          )}
        </div>
      </div>

      {/* Uso de productos */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-1">
          <Package className="w-3.5 h-3.5" /> Productos
        </p>
        <p className="text-sm text-gray-700 font-semibold">
          {b.productCount} {b.productLimit !== null ? `de ${b.productLimit}` : '(ilimitado)'}
        </p>
        {b.productLimit !== null && (
          <>
            <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: near ? '#f59e0b' : 'var(--brand-primary, #7c3aed)' }} />
            </div>
            {near && <p className="text-xs text-amber-600 mt-1">Cerca del límite del plan — considera subir de plan.</p>}
          </>
        )}
      </div>

      {/* Mejorar plan / pagar (solo si Stripe está configurado) */}
      {b.paymentsEnabled && (b.purchasablePlans?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4 shadow-sm">
          <p className="text-xs text-purple-700 uppercase tracking-wide flex items-center gap-1 mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Plan y pago
          </p>
          <p className="text-sm text-gray-600 mb-3">Suscríbete o cambia de plan. El cobro es mensual automático; puedes cancelar cuando quieras.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {b.purchasablePlans!.map((p) => {
              const def = PLANS[p as Plan];
              const isCurrent = p === b.plan;
              return (
                <button
                  key={p}
                  onClick={() => startCheckout(p)}
                  disabled={paying !== null || isCurrent}
                  className="flex items-center justify-between gap-2 rounded-xl border border-purple-200 bg-white px-3 py-3 text-sm font-semibold text-purple-700 transition hover:bg-purple-50 active:scale-[0.98] disabled:opacity-50"
                >
                  <span>{def.label}</span>
                  <span className="text-gray-600">{isCurrent ? 'Plan actual' : paying === p ? 'Abriendo…' : `${formatCOP(def.priceMonthly)}/mes`}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagos */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Receipt className="w-3.5 h-3.5" /> Pagos
          </p>
          <p className="text-sm font-bold text-gray-900">Total: {formatCOP(b.totalPaid)}</p>
        </div>
        <ul className="divide-y divide-gray-100">
          {b.charges.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-1.5 text-sm">
              <div className="min-w-0">
                <p className="text-gray-800 truncate">{c.concept || 'Pago'}</p>
                <p className="text-xs text-gray-400">{c.paid_at?.slice(0, 10)}{c.period_end ? ` · hasta ${c.period_end}` : ''}</p>
              </div>
              <span className="font-semibold text-gray-900">{formatCOP(c.amount)}</span>
            </li>
          ))}
          {b.charges.length === 0 && <li className="text-xs text-gray-400 py-2">Aún no hay pagos registrados.</li>}
        </ul>
      </div>
    </div>
  );
}
