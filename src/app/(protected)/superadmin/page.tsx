'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, Plus } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { PLANS_ORDER, getPlan } from '@/lib/plans';

interface TenantRow {
  id: number;
  name: string;
  slug: string;
  logo: string;
  industry: string | null;
  plan: string;
  active: boolean;
  usage?: { orders: number; products: number; inventory: number; expenses: number; users: number };
}

const EMPTY = { name: '', slug: '', industry: '', logo: '', plan: 'free', adminEmail: '', adminPassword: '' };

export default function SuperadminPage() {
  const { role } = useTenant();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/superadmin/metrics', { cache: 'no-store' }).then((x) => x.json()).catch(() => ({}));
    setTenants(r.metrics ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const r = await fetch('/api/superadmin/metrics', { cache: 'no-store' }).then((x) => x.json()).catch(() => ({}));
      if (active) setTenants(r.metrics ?? []);
    })();
    return () => { active = false; };
  }, []);

  async function changePlan(id: number, plan: string) {
    const res = await fetch('/api/superadmin/tenants', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, plan }),
    });
    if (res.ok) { toast.success('Plan actualizado'); await load(); } else toast.error('No se pudo cambiar el plan');
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

  async function toggleActive(t: TenantRow) {
    const res = await fetch('/api/superadmin/tenants', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, active: !t.active }),
    });
    if (res.ok) { toast.success('Actualizado'); await load(); } else toast.error('No se pudo actualizar');
  }

  if (role !== 'superadmin') {
    return <p className="text-sm text-gray-500">Esta sección es solo para el superadministrador de la plataforma.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Building2 className="w-6 h-6" style={{ color: 'var(--brand-primary, #7c3aed)' }} />
        <h1 className="text-2xl font-bold text-gray-900">Plataforma</h1>
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
            {['free', 'pro', 'enterprise'].map((p) => <option key={p} value={p}>{p}</option>)}
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
            const lim = getPlan(t.plan).limits;
            const u = t.usage;
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm flex-wrap">
                <span className="text-xl">{t.logo}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{t.name}</p>
                  <p className="text-xs text-gray-400 truncate">{t.slug} · {t.industry || '—'}</p>
                  {u && (
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {u.orders} pedidos · {u.products} productos · {u.users}/{lim.users === Infinity ? '∞' : lim.users} usuarios
                    </p>
                  )}
                </div>
                <select
                  value={t.plan}
                  onChange={(e) => changePlan(t.id, e.target.value)}
                  className="rounded-lg border px-2 py-1 text-xs"
                  title="Plan"
                >
                  {PLANS_ORDER.map((p) => <option key={p} value={p}>{getPlan(p).label}</option>)}
                </select>
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
