import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase';
import { hashPassword, validatePassword } from '@/lib/auth';
import { roleAtLeast } from '@/lib/tenant';
import { recordAudit, type AuditAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Roles asignables desde la gestión de un tenant: NUNCA 'superadmin' (rol de
// plataforma cross-tenant). Mismo criterio que /api/superadmin/users.
const ASSIGNABLE_ROLES = ['admin', 'member', 'viewer'] as const;
function isAssignable(r: unknown): r is (typeof ASSIGNABLE_ROLES)[number] {
  return typeof r === 'string' && (ASSIGNABLE_ROLES as readonly string[]).includes(r);
}
// Validación de email consistente con /api/superadmin/users.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// NOTA: `users` NO es una tabla del guard multi-tenant, así que aquí filtramos
// SIEMPRE explícitamente por `tenant_id` del admin. Nunca se devuelve
// password_hash.

/** Lista los usuarios del propio tenant. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getServiceClient();
  const { data, error } = await db
    .from('users')
    .select('id, email, username, role, active, status, rejected_at, created_at')
    .eq('tenant_id', auth.ctx.tenantId)
    .order('id');
  if (error) {
    console.error('admin/users GET error:', error.message);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
  return NextResponse.json({ users: data ?? [] });
}

/** Crea un usuario en el propio tenant. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  // Rol asignable (admin/member/viewer); 'superadmin' nunca se crea por esta vía.
  const role = isAssignable(body.role) ? body.role : 'member';

  // Defensa en profundidad: tampoco un rol superior/igual indebido.
  if (!roleAtLeast(auth.ctx.role, role)) {
    return NextResponse.json({ error: 'No puedes asignar un rol superior al tuyo' }, { status: 403 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const db = getServiceClient();

  // Tenant destino. Un admin normal solo crea usuarios en SU negocio. El
  // superadmin opera la plataforma y DEBE indicar a qué negocio pertenece el
  // usuario (no se asume el suyo, que históricamente es meraki).
  let targetTenantId = auth.ctx.tenantId;
  if (auth.ctx.role === 'superadmin') {
    const tid = Number(body.tenantId);
    if (!Number.isInteger(tid) || tid <= 0) {
      return NextResponse.json({ error: 'Selecciona el negocio del usuario' }, { status: 400 });
    }
    const { data: t, error: tErr } = await db.from('tenants').select('id').eq('id', tid).maybeSingle();
    if (tErr) {
      console.error('admin/users POST validar tenant:', tErr.message);
      return NextResponse.json({ error: 'No se pudo validar el negocio' }, { status: 500 });
    }
    if (!t) return NextResponse.json({ error: 'El negocio seleccionado no existe' }, { status: 400 });
    targetTenantId = tid;
  }

  const password_hash = await hashPassword(password);
  const { error } = await db.from('users').insert({
    tenant_id: targetTenantId,
    email,
    username: username || email,
    password_hash,
    role,
  });
  if (error) {
    // 23505 = unique_violation (email ya existe en el tenant)
    const conflict = (error as { code?: string }).code === '23505';
    if (!conflict) console.error('admin/users POST insert error:', error.message, { targetTenantId, email, role });
    return NextResponse.json(
      { error: conflict ? 'Ya existe un usuario con ese email en ese negocio' : `No se pudo crear el usuario: ${error.message}` },
      { status: conflict ? 409 : 500 },
    );
  }
  await recordAudit(db, {
    tenantId: targetTenantId,
    actor: { userId: auth.ctx.userId, username: auth.ctx.username, role: auth.ctx.role },
    action: 'user_created',
    entity: 'user',
    detail: { email, role, tenantId: targetTenantId },
  });
  return NextResponse.json({ success: true });
}

/** Actualiza rol/estado de un usuario del propio tenant. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  const updates: { role?: string; active?: boolean; status?: string; rejected_at?: string | null } = {};
  let auditAction: AuditAction = 'user_updated';

  // Ciclo de aprobación del auto-registro (modo B: empleados de este negocio).
  if (body.action === 'approve') {
    updates.status = 'approved'; updates.active = true; updates.rejected_at = null;
    auditAction = 'registration_approved';
  } else if (body.action === 'reject') {
    updates.status = 'rejected'; updates.active = false; updates.rejected_at = new Date().toISOString();
    auditAction = 'registration_rejected';
  } else if (body.action === 'reenable') {
    updates.status = 'pending'; updates.active = false; updates.rejected_at = null;
    auditAction = 'registration_reenabled';
  }

  if (body.role !== undefined) {
    // Solo roles asignables (admin/member/viewer); no se promueve a superadmin.
    if (!isAssignable(body.role) || !roleAtLeast(auth.ctx.role, body.role)) {
      return NextResponse.json({ error: 'Rol no permitido' }, { status: 403 });
    }
    updates.role = body.role;
  }
  if (typeof body.active === 'boolean' && !body.action) updates.active = body.active;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  }

  const db = getServiceClient();
  // Doble filtro id + tenant_id: un admin no puede tocar usuarios de otro tenant.
  // `.select()` nos da las filas afectadas: si es 0, el usuario NO es de este
  // negocio → 404 y NO se audita (evita respuestas/auditoría engañosas en IDOR).
  const { data: affected, error } = await db
    .from('users')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', auth.ctx.tenantId)
    .select('id');
  if (error) {
    console.error('admin/users PATCH error:', error.message, { id, updates });
    return NextResponse.json({ error: `No se pudo actualizar el usuario: ${error.message}` }, { status: 500 });
  }
  if (!affected || affected.length === 0) {
    return NextResponse.json({ error: 'Usuario no encontrado en tu negocio' }, { status: 404 });
  }
  await recordAudit(db, {
    tenantId: auth.ctx.tenantId,
    actor: { userId: auth.ctx.userId, username: auth.ctx.username, role: auth.ctx.role },
    action: auditAction,
    entity: 'user',
    entityId: id,
    detail: updates,
  });
  return NextResponse.json({ success: true });
}
