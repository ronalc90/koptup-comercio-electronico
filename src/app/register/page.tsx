'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { INDUSTRY_PRESETS, INDUSTRY_KEYS } from '@/lib/registration';
import LogoPicker from '@/components/shared/LogoPicker';

/**
 * Registro público (sin sesión). Dos modos:
 *  - Con ?invite=CODIGO → empleado que se une a un negocio existente (modo B).
 *  - Sin código → negocio nuevo (modo A).
 * Nunca inicia sesión: la cuenta queda en revisión hasta que un admin la apruebe.
 */
export default function RegisterPage() {
  const [invite, setInvite] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Negocio (modo A)
  const [businessName, setBusinessName] = useState('');
  const [logo, setLogo] = useState('🏪');
  const [industry, setIndustry] = useState('otro');
  const [description, setDescription] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [categories, setCategories] = useState('');
  const [phone, setPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  // Empleado (modo B)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // Comunes
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('invite');
    setInvite(code && code.trim() ? code.trim() : null);
    setReady(true);
  }, []);

  async function suggestWithAI() {
    if (!description.trim()) { toast.error('Escribe una breve descripción de tu negocio'); return; }
    setSuggesting(true);
    try {
      const res = await fetch('/api/ai/suggest-business', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.available) { toast('La IA no está disponible ahora; elige el tipo manualmente.', { icon: 'ℹ️' }); return; }
      setIndustry(data.industry);
      setCategories((data.categories || []).join(', '));
      toast.success('Sugerencias aplicadas — puedes ajustarlas');
    } catch (err) {
      console.error('suggest error:', err);
      toast.error('No se pudo sugerir; elige el tipo manualmente');
    } finally {
      setSuggesting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast.error('Las contraseñas no coinciden'); return; }
    if (!terms) { toast.error('Debes aceptar los términos'); return; }

    const body = invite
      ? { inviteCode: invite, name, email, password, acceptedTerms: terms }
      : {
          businessName, industry, logo,
          categories: categories.split(',').map((c) => c.trim()).filter(Boolean),
          phone, contactEmail, adminName, adminEmail, adminPassword: password, acceptedTerms: terms,
        };

    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { console.error('registro falló:', res.status, data); throw new Error(data.error || 'No se pudo registrar'); }
      setDone(true);
    } catch (err) {
      console.error('registro error:', err);
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-50 to-white px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl text-3xl mb-2"
            style={{ background: 'rgba(124,58,237,0.1)' }}>🛒</div>
          <h1 className="text-2xl font-bold text-gray-900">koptup Comercio Electrónico</h1>
          <p className="text-sm text-gray-500 mt-1">
            {invite ? 'Únete a tu negocio' : 'Registra tu negocio'}
          </p>
        </div>

        {done ? (
          <div className="rounded-2xl bg-white border border-green-100 shadow-sm p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-gray-900">¡Solicitud recibida!</h2>
            <p className="text-sm text-gray-600 mt-2">
              Tu cuenta está en revisión. Te avisaremos cuando un administrador la apruebe.
              Esto suele tardar menos de 24 horas.
            </p>
            <Link href="/login" className="inline-block mt-4 text-sm font-semibold text-purple-700 hover:underline">
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 space-y-3">
            {invite ? (
              <>
                <p className="text-xs rounded-lg bg-purple-50 text-purple-700 px-3 py-2">
                  Te unirás al negocio con el código <strong>{invite}</strong>. Quedarás como miembro
                  pendiente hasta que el administrador te apruebe.
                </p>
                <Field label="Tu nombre" value={name} onChange={setName} placeholder="Nombre y apellido" />
                <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="tu@email.com" />
              </>
            ) : (
              <>
                <div>
                  <span className="text-xs font-medium text-gray-600">Logo del negocio</span>
                  <div className="mt-1"><LogoPicker value={logo} onChange={setLogo} allowUpload={false} /></div>
                </div>
                <Field label="Nombre del negocio" value={businessName} onChange={setBusinessName} placeholder="Mi Tienda" />

                <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Describe tu negocio (opcional)</span>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                      placeholder="Ej: vendo cascos y repuestos para moto"
                      className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
                  </label>
                  <button type="button" onClick={suggestWithAI} disabled={suggesting}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-60">
                    {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {suggesting ? 'Sugiriendo…' : 'Sugerir tipo y categorías con IA'}
                  </button>
                </div>

                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Tipo de negocio</span>
                  <select value={industry} onChange={(e) => setIndustry(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none">
                    {INDUSTRY_KEYS.map((k) => <option key={k} value={k}>{INDUSTRY_PRESETS[k].label}</option>)}
                  </select>
                  <span className="text-[11px] text-gray-400">Categorías sugeridas: {INDUSTRY_PRESETS[industry].categories.join(', ')}</span>
                </label>
                <Field label="Categorías (opcional, separadas por coma)" value={categories} onChange={setCategories}
                  placeholder={INDUSTRY_PRESETS[industry].categories.join(', ')} />
                <Field label="Teléfono de contacto" value={phone} onChange={setPhone} placeholder="3001234567" />
                <Field label="Email de contacto" type="email" value={contactEmail} onChange={setContactEmail} placeholder="negocio@email.com" />
                <Field label="Tu nombre (responsable)" value={adminName} onChange={setAdminName} placeholder="Nombre y apellido" />
                <Field label="Email del administrador" type="email" value={adminEmail} onChange={setAdminEmail} placeholder="admin@email.com" />
              </>
            )}

            <Field label="Contraseña" type="password" value={password} onChange={setPassword} placeholder="Mínimo 8 caracteres, 1 número" />
            <Field label="Confirmar contraseña" type="password" value={confirm} onChange={setConfirm} placeholder="Repite la contraseña" />

            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5" />
              <span>Acepto los términos y condiciones y el tratamiento de mis datos.</span>
            </label>

            <button type="submit" disabled={busy}
              className="w-full rounded-xl py-2.5 text-sm font-bold text-white shadow-md transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9061f9 100%)' }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? 'Enviando…' : 'Enviar solicitud'}
            </button>

            <p className="text-center text-xs text-gray-500">
              ¿Ya tienes cuenta? <Link href="/login" className="font-semibold text-purple-700 hover:underline">Inicia sesión</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
      />
    </label>
  );
}
