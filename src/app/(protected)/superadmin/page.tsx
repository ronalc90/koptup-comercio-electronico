'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, Plus, DollarSign, Bot } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { PLANS_ORDER, getPlan, productLimit, planPrice, formatCOP } from '@/lib/plans';
import { licenseState, LICENSE_LABELS, addMonths, type LicenseStatus } from '@/lib/billing';

interface TenantConfigShape {
  categories?: string[];
  tagline?: string;
  phone?: string;
  theme?: { primary?: string };
  ai?: { domain?: string };
}
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
  config: TenantConfigShape | null;
  usage?: { orders: number; products: number; inventory: number; expenses: number; users: number };
}

const EMPTY = {
  name: '', slug: '', industry: '', logo: '', plan: 'free', adminEmail: '', adminPassword: '',
  // Personalización del negocio (categorías separadas por coma, marca, IA).
  categories: '', tagline: '', phone: '', primaryColor: '', aiDomain: '',
};
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
  // Modal de cobro (reemplaza window.prompt).
  const [paying, setPaying] = useState<TenantRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMonths, setPayMonths] = useState('1');
  const [payingBusy, setPayingBusy] = useState(false);
  // Modal de configuración del negocio (categorías/marca/IA).
  const [editingCfg, setEditingCfg] = useState<TenantRow | null>(null);
  const [cfgForm, setCfgForm] = useState({ categories: '', tagline: '', phone: '', primaryColor: '', aiDomain: '' });
  const [cfgBusy, setCfgBusy] = useState(false);

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

  async function runAgentsNow() {
    toast.loading('Corriendo agentes…', { id: 'cron' });
    try {
      const res = await fetch('/api/cron/run-agents', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falló');
      toast.success(`Agentes corridos en ${data.tenants} negocio(s) · ${data.newAlerts} alerta(s) nueva(s)`, { id: 'cron' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error', { id: 'cron' });
    }
  }

  async function toggleActive(t: TenantRow) {
    const res = await fetch('/api/superadmin/tenants', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, active: !t.active }),
    });
    if (res.ok) { toast.success('Actualizado'); await load(); } else toast.error('No se pudo actualizar');
  }

  function recordPayment(t: TenantRow) {
    setPayAmount(String(planPrice(t.plan)));
    setPayMonths('1');
    setPaying(t);
  }

  async function confirmPayment() {
    if (!paying) return;
    const amount = Number(payAmount);
    const months = Number(payMonths);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Monto inválido (debe ser mayor a 0)'); return; }
    if (!Number.isInteger(months) || months < 1) { toast.error('Meses inválido (mínimo 1)'); return; }
    setPayingBusy(true);
    try {
      const res = await fetch('/api/superadmin/billing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: paying.id, amount, months }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar el pago');
      toast.success(`Pago registrado · licencia hasta ${data.license_until}`);
      setPaying(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setPayingBusy(false);
    }
  }

  // Cerrar el modal de cobro con Escape.
  useEffect(() => {
    if (!paying) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPaying(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paying]);

  function openEditConfig(t: TenantRow) {
    const c = t.config ?? {};
    setCfgForm({
      categories: (c.categories ?? []).join(', '),
      tagline: c.tagline ?? '',
      phone: c.phone ?? '',
      primaryColor: c.theme?.primary ?? '',
      aiDomain: c.ai?.domain ?? '',
    });
    setEditingCfg(t);
  }

  async function saveConfig() {
    if (!editingCfg) return;
    setCfgBusy(true);
    try {
      const res = await fetch('/api/superadmin/tenants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCfg.id,
          categories: cfgForm.categories.split(',').map((c) => c.trim()).filter(Boolean),
          tagline: cfgForm.tagline,
          phone: cfgForm.phone,
          primaryColor: cfgForm.primaryColor,
          aiDomain: cfgForm.aiDomain,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
      toast.success('Configuración guardada');
      setEditingCfg(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setCfgBusy(false);
    }
  }

  async function createTenant() {
    if (!form.name || !form.adminEmail || !form.adminPassword) {
      toast.error('Nombre, email y contraseña del admin son requeridos');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/superadmin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          // categorías: de "a, b, c" a array para sanitizeConfigOverride.
          categories: form.categories.split(',').map((c) => c.trim()).filter(Boolean),
        }),
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
        <div className="flex items-center gap-3">
          <button onClick={runAgentsNow}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white"
            style={{ background: 'var(--brand-primary, #7c3aed)' }}
            title="Corre los agentes IA en todos los negocios y genera alertas">
            <Bot className="w-4 h-4" /> Correr agentes
          </button>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1 justify-end">
              <DollarSign className="w-3.5 h-3.5" /> Ingresos
            </p>
            <p className="text-lg font-bold text-gray-900">{formatCOP(revenue)}</p>
          </div>
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

        {/* Personalización del negocio (opcional): sin esto arranca con un base
            genérico, no con el de Meraki. */}
        <details className="mt-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-gray-600">
            Personalización (categorías, marca, IA) — opcional
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input className="rounded-xl border px-3 py-2 text-sm sm:col-span-2" placeholder="Categorías separadas por coma (ej. Cascos, Repuestos, Aceites)"
              value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} />
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Eslogan (ej. Todo para tu moto)"
              value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Teléfono de contacto"
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Rubro para la IA (ej. motocicletas y repuestos)"
              value={form.aiDomain} onChange={(e) => setForm({ ...form, aiDomain: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Color de marca
              <input type="color" className="h-8 w-12 rounded border" value={form.primaryColor || '#7c3aed'}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} />
            </label>
          </div>
        </details>

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
                <button onClick={() => openEditConfig(t)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
                  title="Editar categorías, marca e IA del negocio">
                  Config
                </button>
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

      {/* Modal de cobro (accesible, reemplaza window.prompt) */}
      {paying && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Registrar pago de ${paying.name}`}
          onClick={(e) => { if (e.target === e.currentTarget) setPaying(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Cobrar a {paying.name}</h2>
            <p className="text-xs text-gray-400 mb-4">
              Plan {getPlan(paying.plan).label} · sugerido {formatCOP(planPrice(paying.plan))}/mes
            </p>
            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="pay-amount">Monto (COP)</label>
            <input id="pay-amount" type="number" min="0" value={payAmount} autoFocus
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm mb-3" />
            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="pay-months">Meses de licencia</label>
            <input id="pay-months" type="number" step="1" min="1" value={payMonths}
              onChange={(e) => setPayMonths(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm mb-3" />
            <p className="text-xs text-gray-500 mb-4">
              Nueva licencia hasta:{' '}
              <span className="font-semibold text-gray-800">
                {addMonths(
                  paying.license_until && paying.license_until > today ? paying.license_until : today,
                  Math.max(0, Math.floor(Number(payMonths) || 0)),
                )}
              </span>
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPaying(null)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100">
                Cancelar
              </button>
              <button onClick={confirmPayment} disabled={payingBusy}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'var(--brand-primary, #7c3aed)' }}>
                {payingBusy ? 'Registrando…' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de configuración del negocio (categorías / marca / IA) */}
      {editingCfg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Configurar ${editingCfg.name}`}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingCfg(null); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Configurar {editingCfg.name}</h2>
            <p className="text-xs text-gray-400 mb-4">Categorías, marca e IA propias del negocio. Aplica sin re-login.</p>

            <label className="block text-sm font-semibold text-gray-700 mb-1">Categorías (separadas por coma)</label>
            <input value={cfgForm.categories} onChange={(e) => setCfgForm({ ...cfgForm, categories: e.target.value })}
              placeholder="Cascos, Repuestos, Aceites" className="w-full rounded-xl border px-3 py-2 text-sm mb-3" />

            <label className="block text-sm font-semibold text-gray-700 mb-1">Eslogan</label>
            <input value={cfgForm.tagline} onChange={(e) => setCfgForm({ ...cfgForm, tagline: e.target.value })}
              className="w-full rounded-xl border px-3 py-2 text-sm mb-3" />

            <label className="block text-sm font-semibold text-gray-700 mb-1">Teléfono de contacto</label>
            <input value={cfgForm.phone} onChange={(e) => setCfgForm({ ...cfgForm, phone: e.target.value })}
              className="w-full rounded-xl border px-3 py-2 text-sm mb-3" />

            <label className="block text-sm font-semibold text-gray-700 mb-1">Rubro para la IA</label>
            <input value={cfgForm.aiDomain} onChange={(e) => setCfgForm({ ...cfgForm, aiDomain: e.target.value })}
              placeholder="motocicletas y repuestos" className="w-full rounded-xl border px-3 py-2 text-sm mb-3" />

            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-4">
              Color de marca
              <input type="color" value={cfgForm.primaryColor || '#7c3aed'}
                onChange={(e) => setCfgForm({ ...cfgForm, primaryColor: e.target.value })}
                className="h-8 w-12 rounded border" />
            </label>

            <div className="flex gap-3">
              <button onClick={() => setEditingCfg(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={saveConfig} disabled={cfgBusy}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'var(--brand-primary, #7c3aed)' }}>
                {cfgBusy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
