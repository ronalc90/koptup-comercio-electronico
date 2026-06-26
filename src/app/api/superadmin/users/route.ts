import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase';
import { hashPassword, validatePassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Gestión de usuarios de CUALQUIER negocio — SOLO superadmin (a nivel
// plataforma). Las rutas /api/admin/users solo gestionan el tenant propio del
// admin; esta permite al superadmin administrar el equipo de un tenant dado
// (ej. dar de alta usuarios a un negocio que aún no tiene admin propio).
// Roles asignables: admin/member/viewer (un tenant no necesita su propio
// superadmin; ese rol es de plataforma).

const ASSIGNABLE_ROLES = ['admin', 'member', 'viewer'] as const;
function isAssignable(r: unknown): r is (typeof ASSIGNABLE_ROLES)[number] {
  return typeof r === 'string' && (ASSIGNABLE_ROLES as readonly string[]).includes(r);
}

/** Lista los usuarios de un negocio. ?tenantId=N */
export async function GET(request: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenantId = Number(new URL(request.url).searchParams.get('tenantId'));
  if (!Number.isInteger(tenantId)) return NextResponse.json({ error: 'tenantId inválido' }, { status: 400 });

  const db = getServiceClient();
  const { data, error } = await db
    .from('users')
    .select('id, email, username, role, active, created_at')
    .eq('tenant_id', tenantId)
    .order('id');
  if (error) return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

/** Crea un usuario en un negocio dado. */
export async function POST(request: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const tenantId = Number(body.tenantId);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = isAssignable(body.role) ? body.role : 'member';

  if (!Number.isInteger(tenantId)) return NextResponse.json({ error: 'tenantId inválido' }, { status: 400 });
  if (!email || !password) return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 });
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const db = getServiceClient();
  // Verifica que el negocio exista (evita crear usuarios huérfanos).
  const { data: tenant } = await db.from('tenants').select('id').eq('id', tenantId).maybeSingle();
  if (!tenant) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 });

  const password_hash = await hashPassword(password);
  const { error } = await db.from('users').insert({
    tenant_id: tenantId, email, username: username || email, password_hash, role,
  });
  if (error) {
    const conflict = (error as { code?: string }).code === '23505';
    return NextResponse.json(
      { error: conflict ? 'Ya existe un usuario con ese email en ese negocio' : 'No se pudo crear el usuario' },
      { status: conflict ? 409 : 500 },
    );
  }
  await recordAudit(db, {
    tenantId,
    actor: { userId: auth.ctx.userId, username: auth.ctx.username, role: auth.ctx.role },
    action: 'user_created',
    entity: 'user',
    detail: { email, role, by: 'superadmin' },
  });
  return NextResponse.json({ success: true });
}

/** Actualiza rol/estado de un usuario de un negocio dado. */
export async function PATCH(request: NextRequest) {
  const auth = await requireSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  const tenantId = Number(body.tenantId);
  if (!Number.isInteger(id) || !Number.isInteger(tenantId)) {
    return NextResponse.json({ error: 'id/tenantId inválido' }, { status: 400 });
  }
  const updates: { role?: string; active?: boolean } = {};
  if (body.role !== undefined) {
    if (!isAssignable(body.role)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    updates.role = body.role;
  }
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });

  const db = getServiceClient();
  const { data: affected, error } = await db
    .from('users')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id');
  if (error) return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  if (!affected || affected.length === 0) {
    return NextResponse.json({ error: 'Usuario no encontrado en ese negocio' }, { status: 404 });
  }
  await recordAudit(db, {
    tenantId,
    actor: { userId: auth.ctx.userId, username: auth.ctx.username, role: auth.ctx.role },
    action: 'user_updated',
    entity: 'user',
    entityId: id,
    detail: { ...updates, by: 'superadmin' },
  });
  return NextResponse.json({ success: true });
}
