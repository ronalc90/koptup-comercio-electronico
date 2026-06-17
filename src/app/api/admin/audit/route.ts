import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Últimas operaciones sensibles del propio negocio (admin). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getServiceClient();
  const { data, error } = await db
    .from('audit_log')
    .select('id, actor_name, actor_role, action, entity, entity_id, detail, created_at')
    .eq('tenant_id', auth.ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}
