'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus, ShieldCheck, History } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { roleAtLeast } from '@/lib/tenant';
import { AUDIT_LABELS, type AuditAction } from '@/lib/audit';

interface AdminUser {
  id: number;
  email: string;
  username: string | null;
  role: string;
  active: boolean;
}
interface TenantProfile {
  id: number;
  name: string;
  slug: string;
  plan: string;
  industry: string | null;
}
interface AuditRow {
  id: number;
  actor_name: string | null;
  actor_role: string | null;
  action: AuditAction;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const ROLES = ['admin', 'member', 'viewer'];

export default function AdminPage() {
  const { role } = useTenant();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [form, setForm] = useState({ email: '', username: '', password: '', role: 'member' });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const FAILED = Symbol('failed');
    const [u, t, a] = await Promise.all([
      fetch('/api/admin/users', { cache: 'no-store' }).then((r) => r.json()).catch(() => FAILED),
      fetch('/api/admin/tenant', { cache: 'no-store' }).then((r) => r.json()).catch(() => FAILED),
      fetch('/api/admin/audit', { cache: 'no-store' }).then((r) => r.json()).catch(() => FAILED),
    ]);
    if (u === FAILED && t === FAILED && a === FAILED) {
      setError(true);
      setLoading(false);
      return;
    }
    setUsers(u === FAILED ? [] : u.users ?? []);
    setTenant(t === FAILED ? null : t.tenant ?? null);
    setAudit(a === FAILED ? [] : a.entries ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addUser() {
    if (!form.email || !form.password) { toast.error('Email y contraseña requeridos'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo crear');
      toast.success('Usuario creado');
      setForm({ email: '', username: '', password: '', role: 'member' });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(id: number, patch: { role?: string; active?: boolean }) {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) { toast.success('Actualizado'); await load(); }
    else toast.error('No se pudo actualizar');
  }

  if (!roleAtLeast(role, 'admin')) {
    return <p className="text-sm text-gray-500">Esta sección es solo para administradores.</p>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-sm text-gray-500">
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--brand-primary, #7c3aed)', borderTopColor: 'transparent' }}
        />
        Cargando…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>No se pudieron cargar los datos de administración.</p>
          <button
            onClick={() => load()}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-6 h-6" style={{ color: 'var(--brand-primary, #7c3aed)' }} />
        <h1 className="text-2xl font-bold text-gray-900">Administración</h1>
      </div>

      {tenant && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-gray-900 text-sm mb-1">Negocio</h2>
          <p className="text-sm text-gray-600">{tenant.name} · plan <span className="font-semibold">{tenant.plan}</span></p>
        </div>
      )}

      {/* Alta de usuario */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus className="w-5 h-5" style={{ color: 'var(--brand-primary, #7c3aed)' }} />
          <h2 className="font-bold text-gray-900 text-sm">Nuevo usuario</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="usuario" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="contraseña" type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select className="rounded-xl border px-3 py-2 text-sm" value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button onClick={addUser} disabled={busy}
          className="mt-3 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--brand-primary, #7c3aed)' }}>
          {busy ? 'Creando…' : 'Crear usuario'}
        </button>
      </div>

      {/* Lista de usuarios */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="font-bold text-gray-900 text-sm mb-3">Usuarios ({users.length})</h2>
        <ul className="divide-y divide-gray-100">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <div className="flex-1 min-w-0 basis-full sm:basis-auto">
                <p className="font-semibold text-gray-900 truncate">{u.username || u.email}</p>
                <p className="text-xs text-gray-400 truncate">{u.email}</p>
              </div>
              <select className="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs" value={u.role}
                onChange={(e) => updateUser(u.id, { role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={() => updateUser(u.id, { active: !u.active })}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${u.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {u.active ? 'Activo' : 'Inactivo'}
              </button>
            </li>
          ))}
          {users.length === 0 && <li className="text-xs text-gray-400 py-2">Sin usuarios.</li>}
        </ul>
      </div>

      {/* Actividad reciente (auditoría) */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-5 h-5" style={{ color: 'var(--brand-primary, #7c3aed)' }} />
          <h2 className="font-bold text-gray-900 text-sm">Actividad reciente</h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {audit.map((a) => (
            <li key={a.id} className="py-1.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-800 min-w-0 truncate">{AUDIT_LABELS[a.action] ?? a.action}</span>
                <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">{a.created_at?.slice(0, 16).replace('T', ' ')}</span>
              </div>
              <p className="text-xs text-gray-500 truncate">
                por {a.actor_name || '—'}{a.actor_role ? ` (${a.actor_role})` : ''}
                {a.detail ? ` · ${Object.entries(a.detail).map(([k, v]) => `${k}: ${v}`).join(', ')}` : ''}
              </p>
            </li>
          ))}
          {audit.length === 0 && <li className="text-xs text-gray-400 py-2">Sin actividad registrada aún.</li>}
        </ul>
      </div>
    </div>
  );
}
