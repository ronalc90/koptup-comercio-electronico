'use client';

import { useCallback, useEffect, useState } from 'react';
import { Boxes, Plus, Pencil, Power, RefreshCw, AlertTriangle, CheckCircle2, Clock, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/utils';
import { useTenant } from '@/lib/TenantContext';
import { roleAtLeast } from '@/lib/tenant';
import type { Supplier } from '@/lib/types';
import type {
  ConsumoReport,
  PayablesReport,
  RotacionReport,
  PayableStatus,
} from '@/lib/suppliers/calculations';

type Tab = 'proveedores' | 'cierre' | 'pagar' | 'rotacion';

const TABS: { key: Tab; label: string }[] = [
  { key: 'proveedores', label: 'Proveedores' },
  { key: 'cierre', label: 'Cierre' },
  { key: 'pagar', label: 'Cuentas por pagar' },
  { key: 'rotacion', label: 'Rotación' },
];

const EMPTY_FORM = { id: 0, name: '', contact: '', phone: '', plazo_dias: 30, dia_corte: 1, notes: '' };

const STATUS_BADGE: Record<PayableStatus, { label: string; cls: string; icon: React.ElementType }> = {
  vencido: { label: 'Vencido', cls: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
  por_vencer: { label: 'Por vencer', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  al_dia: { label: 'Al día', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
};

export default function SuppliersPage() {
  const { role } = useTenant();
  const canWrite = roleAtLeast(role, 'member') && role !== 'admin' && role !== 'superadmin';

  const [tab, setTab] = useState<Tab>('proveedores');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [consumo, setConsumo] = useState<ConsumoReport | null>(null);
  const [payables, setPayables] = useState<PayablesReport | null>(null);
  const [rotacion, setRotacion] = useState<RotacionReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/suppliers', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setSuppliers(data.suppliers ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron cargar los proveedores');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReport = useCallback(async (which: Tab) => {
    if (which === 'proveedores') return;
    setReportLoading(true);
    try {
      const type = which === 'cierre' ? 'consumo' : which === 'pagar' ? 'payables' : 'rotacion';
      const qs = new URLSearchParams({ type });
      if (which === 'cierre' && from && to) { qs.set('from', from); qs.set('to', to); }
      const res = await fetch(`/api/suppliers/reports?${qs.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      if (which === 'cierre') setConsumo(data.report);
      else if (which === 'pagar') setPayables(data.report);
      else setRotacion(data.report);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cargar el reporte');
    } finally {
      setReportLoading(false);
    }
  }, [from, to]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);
  useEffect(() => { loadReport(tab); }, [tab, loadReport]);

  function startCreate() {
    setForm({ ...EMPTY_FORM });
    setEditing(true);
  }
  function startEdit(s: Supplier) {
    setForm({
      id: s.id, name: s.name, contact: s.contact ?? '', phone: s.phone ?? '',
      plazo_dias: s.plazo_dias, dia_corte: s.dia_corte, notes: s.notes ?? '',
    });
    setEditing(true);
  }

  async function save() {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const isEdit = form.id > 0;
      const res = await fetch('/api/suppliers', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(isEdit ? 'Proveedor actualizado' : 'Proveedor creado');
      setEditing(false);
      await loadSuppliers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(s: Supplier) {
    if (!confirm(`¿Desactivar a "${s.name}"? Se conserva el histórico de pedidos.`)) return;
    try {
      const res = await fetch(`/api/suppliers?id=${s.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success('Proveedor desactivado');
      await loadSuppliers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo desactivar');
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-4 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
          <Boxes className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">Proveedores</h1>
          <p className="text-sm text-gray-500">Consumo, cuentas por pagar y rotación por proveedor</p>
        </div>
        <button
          onClick={() => { loadSuppliers(); loadReport(tab); }}
          className="ml-auto p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50"
          aria-label="Refrescar"
        >
          <RefreshCw className={`h-5 w-5 ${reportLoading || loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
              tab === t.key ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Proveedores (CRUD) ── */}
      {tab === 'proveedores' && (
        <div className="space-y-3">
          {canWrite && !editing && (
            <button
              onClick={startCreate}
              className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
            >
              <Plus className="h-4 w-4" /> Nuevo proveedor
            </button>
          )}

          {editing && (
            <div className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">{form.id > 0 ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
                <button onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Nombre *</span>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" placeholder="Proveedor 1" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Contacto</span>
                  <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" placeholder="Nombre del contacto" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Teléfono</span>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" placeholder="3001234567" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Plazo de pago (días)</span>
                  <input type="number" min={0} value={form.plazo_dias}
                    onChange={(e) => setForm({ ...form, plazo_dias: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Día de corte (1-31)</span>
                  <input type="number" min={1} max={31} value={form.dia_corte}
                    onChange={(e) => setForm({ ...form, dia_corte: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-600">Notas</span>
                  <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" placeholder="Opcional" />
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={save} disabled={saving}
                  className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50">
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
                <button onClick={() => setEditing(false)} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="py-8 text-center text-gray-400">Cargando…</p>
          ) : suppliers.length === 0 ? (
            <p className="py-8 text-center text-gray-400">Aún no hay proveedores. {canWrite && 'Crea el primero.'}</p>
          ) : (
            <div className="space-y-2">
              {suppliers.map((s) => (
                <div key={s.id} className={`rounded-xl border bg-white p-3 shadow-sm ${s.active ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 truncate">
                        {s.name} {!s.active && <span className="text-xs font-normal text-gray-400">(inactivo)</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        Plazo {s.plazo_dias}d · corte día {s.dia_corte}
                        {s.phone ? ` · ${s.phone}` : ''}{s.contact ? ` · ${s.contact}` : ''}
                      </p>
                    </div>
                    {canWrite && (
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(s)} className="p-2 text-gray-400 hover:text-purple-600" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                        {s.active && (
                          <button onClick={() => deactivate(s)} className="p-2 text-gray-400 hover:text-red-500" aria-label="Desactivar"><Power className="h-4 w-4" /></button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Cierre por proveedor (consumo) ── */}
      {tab === 'cierre' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Desde</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Hasta</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <button onClick={() => loadReport('cierre')}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">Aplicar</button>
            {(from || to) && (
              <button onClick={() => { setFrom(''); setTo(''); setTimeout(() => loadReport('cierre'), 0); }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">Todo</button>
            )}
          </div>

          {reportLoading || !consumo ? (
            <p className="py-8 text-center text-gray-400">Cargando…</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <SummaryCard label="Vendido" value={formatCurrency(consumo.totalRevenue)} tone="blue" />
                <SummaryCard label="Consumo (costo)" value={formatCurrency(consumo.totalCost)} tone="amber" />
                <SummaryCard label="Utilidad bruta" value={formatCurrency(consumo.grossProfit)} tone="emerald" />
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
                {consumo.rows.map((r) => (
                  <div key={r.supplierId ?? 'x'} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{r.name}</p>
                      <p className="text-xs text-gray-500">{r.units} und</p>
                    </div>
                    <p className="font-semibold text-gray-900">{formatCurrency(r.cost)}</p>
                  </div>
                ))}
                {consumo.unassigned && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/50">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-500 truncate">Sin asignar</p>
                      <p className="text-xs text-gray-400">{consumo.unassigned.units} und</p>
                    </div>
                    <p className="font-semibold text-gray-500">{formatCurrency(consumo.unassigned.cost)}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Cuentas por pagar ── */}
      {tab === 'pagar' && (
        <div className="space-y-3">
          {reportLoading || !payables ? (
            <p className="py-8 text-center text-gray-400">Cargando…</p>
          ) : (
            <>
              <SummaryCard label="Total por pagar" value={formatCurrency(payables.totalOwed)} tone="amber" />
              {payables.rows.length === 0 ? (
                <p className="py-8 text-center text-gray-400">No hay proveedores.</p>
              ) : (
                <div className="space-y-2">
                  {payables.rows.map((r) => {
                    const badge = STATUS_BADGE[r.status];
                    const Icon = badge.icon;
                    return (
                      <div key={r.supplierId} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900 truncate">{r.name}</p>
                            <p className="text-xs text-gray-500">
                              Vence {r.dueDate} · {r.daysToDue < 0 ? `${-r.daysToDue}d vencido` : `en ${r.daysToDue}d`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">{formatCurrency(r.owed)}</p>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                              <Icon className="h-3 w-3" /> {badge.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Rotación ── */}
      {tab === 'rotacion' && (
        <div className="space-y-3">
          {reportLoading || !rotacion ? (
            <p className="py-8 text-center text-gray-400">Cargando…</p>
          ) : rotacion.rows.length === 0 ? (
            <p className="py-8 text-center text-gray-400">No hay proveedores.</p>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                Unidades movidas en los últimos {rotacion.shortDays} y {rotacion.longDays} días. Los estancados primero.
              </p>
              <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
                {rotacion.rows.map((r) => (
                  <div key={r.supplierId} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">
                        {r.name}{' '}
                        {r.estancado && (
                          <span className="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">estancado</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">{r.unitsShort} und ({rotacion.shortDays}d)</p>
                    </div>
                    <p className="font-semibold text-gray-900">{r.unitsLong} <span className="text-xs font-normal text-gray-400">und ({rotacion.longDays}d)</span></p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'amber' | 'emerald' }) {
  const cls = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }[tone];
  return (
    <div className={`rounded-xl p-3 ${cls}`}>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
      <p className="text-base font-bold leading-tight mt-0.5 break-words">{value}</p>
    </div>
  );
}
