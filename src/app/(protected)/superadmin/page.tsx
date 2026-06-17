'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, Plus, DollarSign } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { PLANS_ORDER, getPlan, productLimit, planPrice, formatCOP } from '@/lib/plans';
import { licenseState, LICENSE_LABELS, type LicenseStatus } from '@/lib/billing';

interface TenantRow {
  id: number;
  name: string;
  slug: string;
  logo: string;
  industry: string | null;
  plan: string;
  active: boolean;
  billing_status: string | null;
  license_until: string | null;
  usage?: { orders: number; products: number; inventory: number; expenses: number; users: number };
}

const EMPTY = { name: '', slug: '', industry: '', logo: '', plan: 'free', adminEmail: '', adminPassword: '' };
const STATUS_STYLE: Record<LicenseStatus, string> = {
  active: 'bg-green-50 text-green-700',
  trial: 'bg-slate-100 text-slate-600',
  expired: 'bg-red-50 text-red-700',
  suspended: 'bg-amber-50 text-amber-700',
};

export default function SuperadminPage() {
  const { role } = useTenant();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const [m, b] = await Promise.all([
      fetch('/api/superadmin/metrics', { cache: 'no-store' }).then((x) => x.json()).catch(() => ({})),
      fetch('/api/superadmin/billing', { cache: 'no-store' }).then((x) => x.json()).catch(() => ({})),
    ]);
    setTenants(m.metrics ?? []);
    setRevenue(b.total ?? 0);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changePlan(id: number, plan: string) {
    const res = await fetch('/api/superadmin/tenants', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, plan }),
    });
    if (res.ok) { toast.success('Plan actualizado'); await load(); } else toast.error('No se pudo cambiar el plan');
  }

  async function toggleActive(t: TenantRow) {
    const res = await fetch('/api/superadmin/tenants', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, active: !t.active }),
    });
    if (res.ok) { toast.success('Actualizado'); await load(); } else toast.error('No se pudo actualizar');
  }

  async function recordPayment(t: TenantRow) {
    const suggested = planPrice(t.plan);
    const amountStr = window.prompt(`Registrar pago de "${t.name}" (COP):`, String(suggested));
    if (amountStr === null) return;
    const monthsStr = window.prompt('¿Cuántos meses de licencia?', '1');
    if (monthsStr === null) return;
    const res = await fetch('/api/superadmin/billing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: t.id, amount: Number(amountStr), months: Number(monthsStr) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { toast.success(`Pago registrado · licencia hasta ${data.license_until}`); await load(); }
    else toast.error(data.error || 'No se pudo registrar el pago');
  }

  async function createTenant() {
    if (!form.name || !form.adminEmail || !form.adminPassword) {
      toast.error('Nombre, email y contraseña del admin son requeridos');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/superadmin/tenants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo crear');
      toast.success(`Negocio "${data.tenant?.name}" creado`);
      setForm({ ...EMPTY });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  if (role !== 'superadmin') {
    return <p className="text-sm text-gray-500">Esta sección es solo para el superadministrador de la plataforma.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-6 h-6" style={{ color: 'var(--brand-primary, #7c3aed)' }} />
          <h1 className="text-2xl font-bold text-gray-900">Plataforma</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1 justify-end">
            <DollarSign className="w-3.5 h-3.5" /> Ingresos
          </p>
          <p className="text-lg font-bold text-gray-900">{formatCOP(revenue)}</p>
        </div>
      </div>

      {/* Alta de negocio (onboarding) */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-5 h-5" style={{ color: 'var(--brand-primary, #7c3aed)' }} />
          <h2 className="font-bold text-gray-900 text-sm">Nuevo negocio (tenant)</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Nombre del negocio" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="slug (opcional)" value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Industria (ej. motos)" value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Logo (emoji)" value={form.logo}
            onChange={(e) => setForm({ ...form, logo: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Email del admin" value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Contraseña del admin" type="password" value={form.adminPassword}
            onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
          <select className="rounded-xl border px-3 py-2 text-sm" value={form.plan}
            onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            {PLANS_ORDER.map((p) => <option key={p} value={p}>{getPlan(p).label}</option>)}
          </select>
        </div>
        <button onClick={createTenant} disabled={busy}
          className="mt-3 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--brand-primary, #7c3aed)' }}>
          {busy ? 'Creando…' : 'Crear negocio'}
        </button>
      </div>

      {/* Lista de tenants */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="font-bold text-gray-900 text-sm mb-3">Negocios ({tenants.length})</h2>
        <ul className="divide-y divide-gray-100">
          {tenants.map((t) => {
            const lim = productLimit(t.plan);
            const u = t.usage;
            const lic = licenseState(t.billing_status, t.license_until, today);
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm flex-wrap">
                <span className="text-xl">{t.logo}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{t.name}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[lic.status]}`}>
                      {LICENSE_LABELS[lic.status]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{t.slug} · {t.industry || '—'}</p>
                  {u && (
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {u.orders} pedidos · {u.products}/{lim === Infinity ? '∞' : lim} productos · {u.users} usuarios
                      {t.license_until && lic.status !== 'trial' ? ` · vence ${t.license_until}` : ''}
                    </p>
                  )}
                </div>
                <select value={t.plan} onChange={(e) => changePlan(t.id, e.target.value)}
                  className="rounded-lg border px-2 py-1 text-xs" title="Plan">
                  {PLANS_ORDER.map((p) => <option key={p} value={p}>{getPlan(p).label}</option>)}
                </select>
                <button onClick={() => recordPayment(t)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold bg-purple-50 text-purple-700"
                  style={{ background: 'color-mix(in srgb, var(--brand-primary, #7c3aed) 12%, white)', color: 'var(--brand-primary, #7c3aed)' }}>
                  Cobrar
                </button>
                <button onClick={() => toggleActive(t)}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold ${t.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {t.active ? 'Activo' : 'Inactivo'}
                </button>
              </li>
            );
          })}
          {tenants.length === 0 && <li className="text-xs text-gray-400 py-2">Sin negocios.</li>}
        </ul>
      </div>
    </div>
  );
}
