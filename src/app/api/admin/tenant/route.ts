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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenant: data });
}

/** Actualiza nombre, logo o plan del propio tenant. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const updates: { name?: string; logo?: string; plan?: string } = {};
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.logo === 'string') updates.logo = body.logo;
  if (typeof body.plan === 'string' && ['free', 'pro', 'enterprise'].includes(body.plan)) {
    updates.plan = body.plan;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  }

  const db = getServiceClient();
  const { error } = await db.from('tenants').update(updates).eq('id', auth.ctx.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
