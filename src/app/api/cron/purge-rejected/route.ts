import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { roleAtLeast } from '@/lib/tenant';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Borra los registros RECHAZADOS tras 30 días. Autorización: bearer CRON_SECRET
// (Vercel Cron) o sesión superadmin (disparo manual). Patrón igual a run-agents.

const PURGE_DAYS = 30;

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
  const cutoff = new Date(Date.now() - PURGE_DAYS * 86_400_000).toISOString();

  // A) Negocios de auto-registro (modo A) cuyo admin lleva >30 días rechazado:
  //    se borra el TENANT y el CASCADE (FK users.tenant_id ON DELETE CASCADE)
  //    elimina a su usuario admin. Solo source='self_signup' e inactivos.
  let deletedTenants = 0;
  const { data: selfTenants } = await db
    .from('tenants').select('id').eq('source', 'self_signup').eq('active', false);
  const selfIds = (selfTenants ?? []).map((t) => t.id);
  if (selfIds.length) {
    const { data: rejAdmins } = await db
      .from('users').select('tenant_id')
      .in('tenant_id', selfIds).eq('role', 'admin').eq('status', 'rejected').lt('rejected_at', cutoff);
    const toDelete = [...new Set((rejAdmins ?? []).map((a) => a.tenant_id))];
    if (toDelete.length) {
      const { error } = await db.from('tenants').delete().in('id', toDelete);
      if (error) console.error('purge-rejected borrar tenants:', error.message);
      else deletedTenants = toDelete.length;
    }
  }

  // B) Usuarios rechazados restantes >30 días (modo B: empleados de negocios
  //    existentes). Tras (A), los admins de self_signup ya no existen.
  let deletedUsers = 0;
  const { data: rejUsers } = await db
    .from('users').select('id').eq('status', 'rejected').lt('rejected_at', cutoff);
  const userIds = (rejUsers ?? []).map((u) => u.id);
  if (userIds.length) {
    const { error } = await db.from('users').delete().in('id', userIds);
    if (error) console.error('purge-rejected borrar usuarios:', error.message);
    else deletedUsers = userIds.length;
  }

  if (deletedTenants || deletedUsers) {
    await recordAudit(db, {
      tenantId: null,
      actor: { userId: null, username: 'cron', role: 'superadmin' },
      action: 'registration_purged',
      entity: 'registration',
      detail: { deletedTenants, deletedUsers, cutoff },
    });
  }
  return NextResponse.json({ ok: true, deletedTenants, deletedUsers });
}
