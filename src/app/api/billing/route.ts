import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase';
import { getPlan, productLimit, planPrice } from '@/lib/plans';
import { licenseState, totalPaid } from '@/lib/billing';
import { stripeConfigured, priceIdForPlan } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Facturación del PROPIO negocio (admin del tenant). Filtra siempre por su
// tenant_id; nunca ve la facturación de otro negocio.

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getServiceClient();
  const tenantId = auth.ctx.tenantId;

  const { data: t } = await db
    .from('tenants')
    .select('plan, billing_status, license_until')
    .eq('id', tenantId)
    .maybeSingle();
  const { count: products } = await db
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  const { data: charges } = await db
    .from('charges')
    .select('id, amount, concept, period_start, period_end, paid_at')
    .eq('tenant_id', tenantId)
    .order('paid_at', { ascending: false });

  const today = new Date().toISOString().slice(0, 10);
  const plan = t?.plan ?? 'free';
  const limit = productLimit(plan);

  return NextResponse.json({
    plan,
    planLabel: getPlan(plan).label,
    price: planPrice(plan),
    productLimit: limit === Infinity ? null : limit, // null = ilimitado
    productCount: products ?? 0,
    license: licenseState(t?.billing_status, t?.license_until, today),
    licenseUntil: t?.license_until ?? null,
    totalPaid: totalPaid(charges ?? []),
    charges: charges ?? [],
    // Pagos con Stripe: si están configurados, la UI muestra el botón de pago.
    // `purchasablePlans` son los planes de pago que tienen precio en Stripe.
    paymentsEnabled: stripeConfigured(),
    purchasablePlans: (['pro', 'enterprise'] as const).filter((p) => priceIdForPlan(p)),
  });
}
