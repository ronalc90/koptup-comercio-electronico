import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase';
import { hashPassword } from '@/lib/auth';
import { isRole, roleAtLeast } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

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
    .select('id, email, username, role, active, created_at')
    .eq('tenant_id', auth.ctx.tenantId)
    .order('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  const role = isRole(body.role) ? body.role : 'member';

  // Nadie puede crear un usuario con un rol SUPERIOR al suyo (un admin no puede
  // fabricar un superadmin y obtener acceso cross-tenant).
  if (!roleAtLeast(auth.ctx.role, role)) {
    return NextResponse.json({ error: 'No puedes asignar un rol superior al tuyo' }, { status: 403 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 4 caracteres' }, { status: 400 });
  }

  const db = getServiceClient();
  const password_hash = await hashPassword(password);
  const { error } = await db.from('users').insert({
    tenant_id: auth.ctx.tenantId,
    email,
    username: username || email,
    password_hash,
    role,
  });
  if (error) {
    // 23505 = unique_violation (email ya existe en el tenant)
    const conflict = (error as { code?: string }).code === '23505';
    return NextResponse.json({ error: error.message }, { status: conflict ? 409 : 500 });
  }
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
  const updates: { role?: string; active?: boolean } = {};
  if (isRole(body.role)) {
    if (!roleAtLeast(auth.ctx.role, body.role)) {
      return NextResponse.json({ error: 'No puedes asignar un rol superior al tuyo' }, { status: 403 });
    }
    updates.role = body.role;
  }
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  }

  const db = getServiceClient();
  // Doble filtro id + tenant_id: un admin no puede tocar usuarios de otro tenant.
  const { error } = await db.from('users').update(updates).eq('id', id).eq('tenant_id', auth.ctx.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
