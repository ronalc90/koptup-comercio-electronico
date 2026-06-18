import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase';
import { addMonths } from '@/lib/billing';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Gestión de facturación a nivel plataforma (solo superadmin): registrar pagos,
// extender licencias y ver ingresos. Es cross-tenant por diseño.

/** Ingresos totales y por negocio. */
export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getServiceClient();
  const { data: charges, error } = await db.from('charges').select('tenant_id, amount');
  if (error) return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });

  const byTenant: Record<number, number> = {};
  let total = 0;
  for (const c of charges ?? []) {
    byTenant[c.tenant_id] = (byTenant[c.tenant_id] ?? 0) + (c.amount || 0);
    total += c.amount || 0;
  }
  return NextResponse.json({ total, byTenant });
}

/** Registra un pago y extiende la licencia del negocio. */
export async function POST(request: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const tenantId = Number(body.tenantId);
  // Enteros estrictos (no redondear decimales en silencio) + tope de meses.
  const amount = Number(body.amount);
  const months = Number(body.months);
  const concept = typeof body.concept === 'string' && body.concept.trim() ? body.concept.trim() : null;

  if (!Number.isInteger(tenantId)) return NextResponse.json({ error: 'tenantId inválido' }, { status: 400 });
  // Tope superior sano: evita fat-finger (montos astronómicos que distorsionan
  // los totales) y el desbordamiento del int4 de charges.amount.
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000_000) {
    return NextResponse.json({ error: 'monto inválido (entero entre 1 y 100.000.000)' }, { status: 400 });
  }
  if (!Number.isInteger(months) || months < 1 || months > 120) {
    return NextResponse.json({ error: 'meses inválido (entero entre 1 y 120)' }, { status: 400 });
  }

  const db = getServiceClient();
  const { data: t } = await db.from('tenants').select('license_until').eq('id', tenantId).maybeSingle();
  if (!t) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  // Extiende desde la fecha de vencimiento si aún es vigente; si no, desde hoy.
  const base = t.license_until && t.license_until > today ? (t.license_until as string) : today;
  const newUntil = addMonths(base, months);

  const { error: cErr } = await db.from('charges').insert({
    tenant_id: tenantId,
    amount,
    concept: concept ?? `Licencia ${months} mes(es)`,
    period_start: base,
    period_end: newUntil,
  });
  if (cErr) return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });

  const { error: uErr } = await db
    .from('tenants')
    .update({ license_until: newUntil, billing_status: 'active' })
    .eq('id', tenantId);
  if (uErr) return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });

  await recordAudit(db, {
    tenantId,
    actor: { userId: auth.ctx.userId, username: auth.ctx.username, role: auth.ctx.role },
    action: 'payment_recorded',
    entity: 'charge',
    detail: { amount, months, license_until: newUntil, concept },
  });

  return NextResponse.json({ success: true, license_until: newUntil });
}
