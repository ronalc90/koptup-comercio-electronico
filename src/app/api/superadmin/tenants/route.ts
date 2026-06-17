import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase';
import { hashPassword, validatePassword } from '@/lib/auth';
import { isPlan, productLimit } from '@/lib/plans';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Única superficie CROSS-TENANT legítima: gestiona TODOS los negocios. Por eso
// usa el service client crudo y exige rol superadmin.

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita diacríticos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Lista todos los tenants de la plataforma. */
export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getServiceClient();
  const { data, error } = await db
    .from('tenants')
    .select('id, name, slug, logo, industry, plan, active, created_at')
    .order('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenants: data ?? [] });
}

/** Crea un tenant nuevo + su primer usuario admin (onboarding). */
export async function POST(request: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = slugify(typeof body.slug === 'string' && body.slug.trim() ? body.slug : name);
  const industry = typeof body.industry === 'string' ? body.industry.trim() : null;
  const logo = typeof body.logo === 'string' && body.logo.trim() ? body.logo.trim() : '🏪';
  const plan = ['free', 'pro', 'enterprise'].includes(body.plan) ? body.plan : 'free';
  const adminEmail = typeof body.adminEmail === 'string' ? body.adminEmail.trim().toLowerCase() : '';
  const adminPassword = typeof body.adminPassword === 'string' ? body.adminPassword : '';

  if (!name || !slug) return NextResponse.json({ error: 'Nombre/slug requeridos' }, { status: 400 });
  // Validar el admin ANTES de crear el tenant evita la mayoría de huérfanos.
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail);
  if (!emailOk) {
    return NextResponse.json({ error: 'Email válido del admin requerido' }, { status: 400 });
  }
  const passwordError = validatePassword(adminPassword);
  if (passwordError) {
    return NextResponse.json({ error: `Contraseña del admin inválida: ${passwordError}` }, { status: 400 });
  }

  const db = getServiceClient();

  // 1) Crear el tenant.
  const { data: tenant, error: tErr } = await db
    .from('tenants')
    .insert({ name, slug, industry, logo, plan, active: true })
    .select('id, name, slug, logo, industry, plan, active')
    .single();
  if (tErr || !tenant) {
    const conflict = (tErr as { code?: string })?.code === '23505';
    return NextResponse.json(
      { error: conflict ? `El slug "${slug}" ya existe` : tErr?.message || 'No se pudo crear el tenant' },
      { status: conflict ? 409 : 500 },
    );
  }

  // 2) Crear su primer admin.
  const password_hash = await hashPassword(adminPassword);
  const { error: uErr } = await db.from('users').insert({
    tenant_id: tenant.id,
    email: adminEmail,
    username: adminEmail,
    password_hash,
    role: 'admin',
  });
  if (uErr) {
    // Rollback best-effort: borramos el tenant recién creado para no dejarlo
    // huérfano (sin admin no habría forma de entrar).
    await db.from('tenants').delete().eq('id', tenant.id);
    return NextResponse.json({ error: `No se pudo crear el admin: ${uErr.message}` }, { status: 400 });
  }

  await recordAudit(db, {
    tenantId: tenant.id,
    actor: { userId: auth.ctx.userId, username: auth.ctx.username, role: auth.ctx.role },
    action: 'tenant_created',
    entity: 'tenant',
    entityId: tenant.id,
    detail: { name, slug, plan, adminEmail },
  });

  return NextResponse.json({ success: true, tenant });
}

/** Cambia estado (activo/inactivo) y/o plan de un tenant. */
export async function PATCH(request: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  const updates: { active?: boolean; plan?: string; billing_status?: string } = {};
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (isPlan(body.plan)) updates.plan = body.plan;
  if (['trial', 'active', 'suspended', 'cancelled'].includes(body.billing_status)) {
    updates.billing_status = body.billing_status;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar (active/plan/billing_status)' }, { status: 400 });
  }

  const db = getServiceClient();

  // Si se baja de plan, el negocio no puede quedar por ENCIMA del nuevo tope de
  // productos (si no, no podría agregar ni uno más y quedaría inconsistente).
  if (updates.plan) {
    const { count } = await db.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', id);
    const lim = productLimit(updates.plan);
    if ((count ?? 0) > lim) {
      return NextResponse.json(
        { error: `El negocio tiene ${count} productos; el plan ${updates.plan} permite ${lim === Infinity ? '∞' : lim}. Elimina productos o elige un plan mayor.` },
        { status: 400 },
      );
    }
  }

  const { error } = await db.from('tenants').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit(db, {
    tenantId: id,
    actor: { userId: auth.ctx.userId, username: auth.ctx.username, role: auth.ctx.role },
    action: updates.plan ? 'plan_changed' : 'tenant_status_changed',
    entity: 'tenant',
    entityId: id,
    detail: updates,
  });

  return NextResponse.json({ success: true });
}
