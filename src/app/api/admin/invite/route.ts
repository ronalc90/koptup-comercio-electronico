import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Código de invitación del propio negocio (modo B del registro). El admin lo
 * consulta, lo (re)genera o lo desactiva. Quien se registre con este código
 * queda como member PENDIENTE en este negocio (lo aprueba el admin).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = getServiceClient();
  const { data, error } = await db.from('tenants').select('invite_code').eq('id', auth.ctx.tenantId).maybeSingle();
  if (error) {
    console.error('admin/invite GET:', error.message);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
  return NextResponse.json({ inviteCode: data?.invite_code ?? null });
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = getServiceClient();
  // Código corto, legible y único (suficiente entropía para un código de invitación).
  const code = crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  const { error } = await db.from('tenants').update({ invite_code: code }).eq('id', auth.ctx.tenantId);
  if (error) {
    console.error('admin/invite POST:', error.message);
    return NextResponse.json({ error: 'No se pudo generar el código' }, { status: 500 });
  }
  return NextResponse.json({ inviteCode: code });
}

export async function DELETE() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = getServiceClient();
  const { error } = await db.from('tenants').update({ invite_code: null }).eq('id', auth.ctx.tenantId);
  if (error) {
    console.error('admin/invite DELETE:', error.message);
    return NextResponse.json({ error: 'No se pudo desactivar el código' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
