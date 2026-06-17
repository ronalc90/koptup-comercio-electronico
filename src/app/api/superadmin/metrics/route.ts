import { NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Métricas de uso por negocio (cross-tenant, solo superadmin). Cuenta por tenant
// usando count head (no trae filas).

async function countFor(
  db: ReturnType<typeof getServiceClient>,
  table: string,
  tenantId: number,
): Promise<number> {
  const { count } = await db.from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  return count ?? 0;
}

export async function GET() {
  const auth = await requireSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getServiceClient();
  const { data: tenants, error } = await db
    .from('tenants')
    .select('id, name, slug, plan, active')
    .order('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const metrics = await Promise.all(
    (tenants ?? []).map(async (t) => {
      const [orders, products, inventory, expenses, users] = await Promise.all([
        countFor(db, 'orders', t.id),
        countFor(db, 'products', t.id),
        countFor(db, 'inventory', t.id),
        countFor(db, 'expenses', t.id),
        countFor(db, 'users', t.id),
      ]);
      return { ...t, usage: { orders, products, inventory, expenses, users } };
    }),
  );

  return NextResponse.json({ metrics });
}
