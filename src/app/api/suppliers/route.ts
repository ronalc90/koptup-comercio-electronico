import { NextRequest, NextResponse } from 'next/server';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { isAdministrativeRole } from '@/lib/permissions';
import { roleAtLeast } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/**
 * Proveedores (módulo de negocio). Scoping por tenant vía getRequestScopedClient
 * (withTenant inyecta tenant_id en inserts y filtra lecturas) + RLS de la
 * migración 016 como defensa en profundidad. Roles: operar = member, leer =
 * viewer; los roles administrativos (admin/superadmin) no operan el negocio.
 */

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

export async function GET() {
  const scoped = await getRequestScopedClient();
  if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (isAdministrativeRole(scoped.ctx.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { data, error } = await scoped.client
    .from('suppliers')
    .select('id, name, contact, phone, plazo_dias, dia_corte, active, notes, created_at')
    .order('active', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    console.error('Suppliers GET error:', error.message);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
  return NextResponse.json({ suppliers: data ?? [] });
}

export async function POST(request: NextRequest) {
  const scoped = await getRequestScopedClient();
  if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  // Escritura: solo quien OPERA el negocio (member). viewer es solo lectura.
  if (isAdministrativeRole(scoped.ctx.role) || !roleAtLeast(scoped.ctx.role, 'member')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'El nombre del proveedor es obligatorio' }, { status: 400 });

  const payload = {
    name,
    contact: typeof body.contact === 'string' ? body.contact.trim() : null,
    phone: typeof body.phone === 'string' ? body.phone.trim() : null,
    plazo_dias: clampInt(body.plazo_dias, 0, 3650, 30),
    dia_corte: clampInt(body.dia_corte, 1, 31, 1),
    notes: typeof body.notes === 'string' ? body.notes.trim() : null,
    active: true,
  };

  const { data, error } = await scoped.client
    .from('suppliers')
    .insert(payload)
    .select('id, name, contact, phone, plazo_dias, dia_corte, active, notes, created_at')
    .single();

  if (error) {
    const conflict = (error as { code?: string }).code === '23505';
    if (!conflict) console.error('Suppliers POST error:', error.message);
    return NextResponse.json(
      { error: conflict ? `Ya existe un proveedor llamado "${name}"` : 'No se pudo crear el proveedor' },
      { status: conflict ? 409 : 500 },
    );
  }
  return NextResponse.json({ supplier: data });
}

export async function PATCH(request: NextRequest) {
  const scoped = await getRequestScopedClient();
  if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (isAdministrativeRole(scoped.ctx.role) || !roleAtLeast(scoped.ctx.role, 'member')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id = Math.round(Number(body.id));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id de proveedor inválido' }, { status: 400 });
  }

  // Solo se actualizan los campos presentes (no se reescribe lo no enviado).
  const update: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 });
    update.name = name;
  }
  if (typeof body.contact === 'string') update.contact = body.contact.trim() || null;
  if (typeof body.phone === 'string') update.phone = body.phone.trim() || null;
  if (typeof body.notes === 'string') update.notes = body.notes.trim() || null;
  if (body.plazo_dias !== undefined) update.plazo_dias = clampInt(body.plazo_dias, 0, 3650, 30);
  if (body.dia_corte !== undefined) update.dia_corte = clampInt(body.dia_corte, 1, 31, 1);
  if (typeof body.active === 'boolean') update.active = body.active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const { data, error } = await scoped.client
    .from('suppliers')
    .update(update)
    .eq('id', id)
    .select('id, name, contact, phone, plazo_dias, dia_corte, active, notes, created_at')
    .single();

  if (error) {
    const conflict = (error as { code?: string }).code === '23505';
    if (!conflict) console.error('Suppliers PATCH error:', error.message);
    return NextResponse.json(
      { error: conflict ? 'Ya existe un proveedor con ese nombre' : 'No se pudo actualizar el proveedor' },
      { status: conflict ? 409 : 500 },
    );
  }
  if (!data) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
  return NextResponse.json({ supplier: data });
}

export async function DELETE(request: NextRequest) {
  const scoped = await getRequestScopedClient();
  if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (isAdministrativeRole(scoped.ctx.role) || !roleAtLeast(scoped.ctx.role, 'member')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const id = Math.round(Number(new URL(request.url).searchParams.get('id')));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id de proveedor inválido' }, { status: 400 });
  }

  // Borrado lógico: conserva el histórico (pedidos con supplier_id congelado).
  const { data, error } = await scoped.client
    .from('suppliers')
    .update({ active: false })
    .eq('id', id)
    .select('id')
    .single();

  if (error) {
    console.error('Suppliers DELETE error:', error.message);
    return NextResponse.json({ error: 'No se pudo desactivar el proveedor' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
  return NextResponse.json({ success: true });
}
