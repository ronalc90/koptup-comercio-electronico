import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Alertas del PROPIO negocio. La tabla alerts es deny-anon; filtramos siempre
// por el tenant de la sesión.

/** Alertas sin resolver del propio negocio. */
export async function GET() {
  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const db = getServiceClient();
  const { data, error } = await db
    .from('alerts')
    .select('id, alert_key, kind, severity, title, message, source, created_at')
    .eq('tenant_id', ctx.tenantId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alerts: data ?? [] });
}

/** Marca una alerta como resuelta (del propio negocio). */
export async function PATCH(request: NextRequest) {
  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  const db = getServiceClient();
  const { error } = await db
    .from('alerts')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
