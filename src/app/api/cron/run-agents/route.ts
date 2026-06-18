import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { roleAtLeast } from '@/lib/tenant';
import { runAndPersistForTenant } from '@/lib/agents/runAndPersist';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Corre los agentes IA por cada negocio activo y persiste alertas nuevas.
// Autorización: bearer CRON_SECRET (lo manda Vercel Cron si está configurado) O
// una sesión de superadmin (para dispararlo a mano). NO está en las rutas
// "protegidas" del proxy porque el cron no manda cookie.

async function authorize(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return true;
  const ctx = await getSession();
  return !!ctx && roleAtLeast(ctx.role, 'superadmin');
}

export async function GET(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const db = getServiceClient();
  const { data: tenants, error } = await db.from('tenants').select('id, slug').eq('active', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date().toISOString();
  let newAlerts = 0;
  for (const t of tenants ?? []) {
    try {
      newAlerts += await runAndPersistForTenant(t.id, t.slug, now);
    } catch (e) {
      console.error(`run-agents tenant ${t.id} falló:`, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true, tenants: tenants?.length ?? 0, newAlerts });
}
