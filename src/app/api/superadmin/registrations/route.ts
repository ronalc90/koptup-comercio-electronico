import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase';
import { recordAudit, type AuditAction } from '@/lib/audit';
import { isPlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

const PURGE_DAYS = 30;

/**
 * Registros de NEGOCIOS nuevos (modo A): tenants source='self_signup' con su
 * admin pendiente o rechazado. Solo el superadmin (gestiona la plataforma).
 */
export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getServiceClient();
  const { data: tenants, error } = await db
    .from('tenants')
    .select('id, name, slug, industry, plan, active, created_at')
    .eq('source', 'self_signup')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('superadmin/registrations GET tenants:', error.message);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }

  const ids = (tenants ?? []).map((t) => t.id);
  const admins = ids.length
    ? (await db.from('users').select('tenant_id, email, username, status, rejected_at')
        .in('tenant_id', ids).eq('role', 'admin')).data ?? []
    : [];
  const adminByTenant = new Map(admins.map((a) => [a.tenant_id, a]));

  const now = Date.now();
  const pending: unknown[] = [];
  const rejected: unknown[] = [];
  for (const t of tenants ?? []) {
    const a = adminByTenant.get(t.id);
    const row = { ...t, admin: a ? { email: a.email, username: a.username } : null };
    if (a?.status === 'pending') pending.push(row);
    else if (a?.status === 'rejected') {
      const days = a.rejected_at
        ? Math.max(0, PURGE_DAYS - Math.floor((now - new Date(a.rejected_at).getTime()) / 86_400_000))
        : PURGE_DAYS;
      rejected.push({ ...row, rejected_at: a.rejected_at, daysUntilPurge: days });
    }
  }
  return NextResponse.json({ pending, rejected });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const tenantId = Number(body.tenantId);
  const action = body.action;
  if (!Number.isInteger(tenantId) || !['approve', 'reject', 'reenable'].includes(action)) {
    return NextResponse.json({ error: 'tenantId o acción inválidos' }, { status: 400 });
  }

  const db = getServiceClient();
  // Solo registros de auto-servicio: nunca tocar negocios creados a mano.
  const { data: t, error: tErr } = await db
    .from('tenants').select('id, source').eq('id', tenantId).maybeSingle();
  if (tErr) {
    console.error('superadmin/registrations PATCH buscar tenant:', tErr.message);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
  if (!t || t.source !== 'self_signup') {
    return NextResponse.json({ error: 'No es un registro de auto-servicio' }, { status: 404 });
  }

  let tenantUpd: Record<string, unknown> = {};
  let userUpd: Record<string, unknown> = {};
  let auditAction: AuditAction;
  if (action === 'approve') {
    tenantUpd = { active: true };
    if (isPlan(body.plan) && body.plan !== 'free') tenantUpd.plan = body.plan;
    userUpd = { status: 'approved', active: true, rejected_at: null };
    auditAction = 'registration_approved';
  } else if (action === 'reject') {
    tenantUpd = { active: false };
    userUpd = { status: 'rejected', active: false, rejected_at: new Date().toISOString() };
    auditAction = 'registration_rejected';
  } else {
    // reenable: vuelve a pendiente (el tenant sigue inactivo hasta re-aprobar).
    tenantUpd = { active: false };
    userUpd = { status: 'pending', active: false, rejected_at: null };
    auditAction = 'registration_reenabled';
  }

  const e1 = (await db.from('tenants').update(tenantUpd).eq('id', tenantId)).error;
  const e2 = (await db.from('users').update(userUpd).eq('tenant_id', tenantId).eq('role', 'admin')).error;
  if (e1 || e2) {
    console.error('superadmin/registrations PATCH update:', e1?.message || e2?.message, { tenantId, action });
    return NextResponse.json({ error: `No se pudo ${action}: ${(e1 || e2)?.message}` }, { status: 500 });
  }

  await recordAudit(db, {
    tenantId,
    actor: { userId: auth.ctx.userId, username: auth.ctx.username, role: auth.ctx.role },
    action: auditAction,
    entity: 'tenant',
    entityId: tenantId,
    detail: { action, plan: tenantUpd.plan },
  });
  return NextResponse.json({ success: true });
}
