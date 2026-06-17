'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Bug, Boxes, DollarSign, TrendingUp, Bell } from 'lucide-react';
import type { AgentKey, AgentReport, Severity } from '@/lib/agents/types';
import type { AutomationResult } from '@/lib/automations/types';

const AGENTS: { key: AgentKey; label: string; desc: string; icon: React.ElementType }[] = [
  { key: 'auditor', label: 'Auditor', desc: 'Errores de negocio e inconsistencias', icon: ShieldCheck },
  { key: 'qa', label: 'QA', desc: 'Integridad de datos y salud del sistema', icon: Bug },
  { key: 'inventario', label: 'Inventario', desc: 'Quiebres, compras y productos lentos', icon: Boxes },
  { key: 'financiero', label: 'Financiero', desc: 'Utilidad, margen y recaudo', icon: DollarSign },
  { key: 'comercial', label: 'Comercial', desc: 'Productos estrella, muertos y bundles', icon: TrendingUp },
];

const SEV_STYLE: Record<Severity, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-slate-50 text-slate-600 border-slate-200',
};

async function fetchAll() {
  const entries = await Promise.all(
    AGENTS.map(async ({ key }) => {
      try {
        const res = await fetch(`/api/agents/${key}`, { cache: 'no-store' });
        return [key, await res.json()] as const;
      } catch {
        return [key, { error: 'No se pudo cargar' }] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

async function fetchAutomations(): Promise<AutomationResult | null> {
  try {
    const res = await fetch('/api/automations/run', { cache: 'no-store' });
    const json = await res.json();
    return 'error' in json ? null : (json as AutomationResult);
  } catch {
    return null;
  }
}

export default function AgentsPage() {
  const [reports, setReports] = useState<Record<string, AgentReport | { error: string } | null>>({});
  const [automations, setAutomations] = useState<AutomationResult | null>(null);
  const [loading, setLoading] = useState(true);

  // Refresco manual (handler de evento): puede tocar estado de inmediato.
  const load = useCallback(async () => {
    setLoading(true);
    const [r, a] = await Promise.all([fetchAll(), fetchAutomations()]);
    setReports(r);
    setAutomations(a);
    setLoading(false);
  }, []);

  // Carga inicial: el efecto empieza con un await, sin setState síncrono.
  useEffect(() => {
    let active = true;
    (async () => {
      const [r, a] = await Promise.all([fetchAll(), fetchAutomations()]);
      if (active) {
        setReports(r);
        setAutomations(a);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agentes IA</h1>
          <p className="text-sm text-gray-500">Análisis automático de tu negocio. Datos solo de tu tienda.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--brand-primary, #7c3aed)' }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Analizando…' : 'Re-analizar'}
        </button>
      </div>

      {/* Panel de automatizaciones / alertas accionables */}
      {automations && automations.alerts.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5" style={{ color: 'var(--brand-primary, #7c3aed)' }} />
            <h2 className="font-bold text-gray-900 text-sm">Alertas y automatizaciones</h2>
            <div className="ml-auto flex gap-1 text-[11px] font-semibold">
              {automations.counts.critical > 0 && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">{automations.counts.critical}</span>}
              {automations.counts.warning > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{automations.counts.warning}</span>}
            </div>
          </div>
          <ul className="grid gap-1.5 md:grid-cols-2">
            {automations.alerts.slice(0, 12).map((a) => (
              <li key={a.id} className={`rounded-lg border px-2.5 py-1.5 text-xs ${SEV_STYLE[a.severity]}`}>
                <span className="font-semibold uppercase opacity-60 text-[10px]">{a.kind}</span>
                <span className="font-semibold"> · {a.title}</span>
                <div className="opacity-80">{a.message}</div>
                {a.suggestedAction && (
                  <div className="mt-0.5 font-semibold opacity-90">→ {a.suggestedAction}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {AGENTS.map(({ key, label, desc, icon: Icon }) => {
          const r = reports[key];
          const report = r && !('error' in r) ? (r as AgentReport) : null;
          return (
            <div key={key} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center"
                  style={{ background: 'color-mix(in srgb, var(--brand-primary, #7c3aed) 12%, white)' }}>
                  <Icon className="w-5 h-5" style={{ color: 'var(--brand-primary, #7c3aed)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-gray-900 text-sm">Agente {label}</h2>
                  <p className="text-xs text-gray-400 truncate">{desc}</p>
                </div>
                {report && (
                  <div className="flex gap-1 text-[11px] font-semibold">
                    {report.counts.critical > 0 && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">{report.counts.critical}</span>}
                    {report.counts.warning > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{report.counts.warning}</span>}
                  </div>
                )}
              </div>

              {!r && <p className="text-xs text-gray-400">Cargando…</p>}
              {r && 'error' in r && <p className="text-xs text-red-500">{r.error}</p>}
              {report && (
                <>
                  <p className="text-xs text-gray-600 mb-3">{report.summary}</p>
                  <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                    {report.findings.length === 0 && (
                      <li className="text-xs text-gray-400">Sin hallazgos.</li>
                    )}
                    {report.findings.slice(0, 30).map((f) => (
                      <li key={f.id} className={`rounded-lg border px-2.5 py-1.5 text-xs ${SEV_STYLE[f.severity]}`}>
                        <span className="font-semibold">{f.title}</span>
                        {f.entity && <span className="opacity-60"> · {f.entity}</span>}
                        <div className="opacity-80">{f.detail}</div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
