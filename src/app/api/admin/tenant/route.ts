import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Perfil del propio tenant. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getServiceClient();
  const { data, error } = await db
    .from('tenants')
    .select('id, name, slug, logo, industry, plan, active, created_at')
    .eq('id', auth.ctx.tenantId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  return NextResponse.json({ tenant: data });
}

/** Actualiza nombre, logo o plan del propio tenant. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  // El admin solo edita marca (nombre/logo). El PLAN NO se cambia aquí: eso es
  // facturación y solo lo hace el superadmin (/api/superadmin/tenants). Si no,
  // un admin se auto-subiría a enterprise sin pagar y saltaría el límite.
  const updates: { name?: string; logo?: string } = {};
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  // Logo: validar no-vacío y acotar longitud (es un emoji/string corto). Antes un
  // "" dejaba el negocio sin logo y se aceptaba cualquier tamaño.
  if (typeof body.logo === 'string' && body.logo.trim()) updates.logo = body.logo.trim().slice(0, 8);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  }

  const db = getServiceClient();
  const { error } = await db.from('tenants').update(updates).eq('id', auth.ctx.tenantId);
  if (error) return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  return NextResponse.json({ success: true });
}
