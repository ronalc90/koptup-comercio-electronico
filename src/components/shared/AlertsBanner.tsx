'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Alert {
  id: number;
  severity: string;
  title: string;
  message: string;
}

const SEV: Record<string, string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-slate-200 bg-slate-50 text-slate-600',
};

/** Tira de alertas sin resolver del negocio (las generan los agentes IA). */
export default function AlertsBanner() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/alerts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (active) setAlerts(d.alerts ?? []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function resolve(id: number) {
    setAlerts((a) => a.filter((x) => x.id !== id));
    fetch('/api/alerts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
        <AlertTriangle className="w-3.5 h-3.5" /> Alertas ({alerts.length})
      </div>
      {alerts.slice(0, 4).map((a) => (
        <div key={a.id} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${SEV[a.severity] ?? SEV.info}`}>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{a.title}</p>
            <p className="opacity-80">{a.message}</p>
          </div>
          <button onClick={() => resolve(a.id)} aria-label="Marcar alerta como resuelta"
            className="shrink-0 opacity-60 hover:opacity-100 min-w-[44px] min-h-[44px] flex items-center justify-center -my-2 -mr-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
