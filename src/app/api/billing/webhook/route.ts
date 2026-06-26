import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { planForPriceId } from '@/lib/stripe';
import { getServiceClient } from '@/lib/supabase';
import { addMonths, billingEffectForEvent } from '@/lib/billing';
import { isPlan, planPrice, type Plan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/**
 * Webhook de Stripe: activa/extiende la licencia del negocio según el pago.
 * - invoice.paid (primera y renovaciones) → extiende 1 mes + registra el cargo.
 * - checkout.session.completed → activa el plan (sin cobrar; lo hace invoice.paid).
 * - invoice.payment_failed / subscription.deleted → suspende la licencia.
 * Verifica la firma con STRIPE_WEBHOOK_SECRET. Si no está configurado, 503.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTenantAndPlan(obj: any): { tenantId: number | null; plan: Plan | null } {
  const md = obj?.metadata || obj?.subscription_details?.metadata || {};
  const tid = Number(md.tenantId ?? obj?.client_reference_id);
  let plan: Plan | null = isPlan(md.plan) ? md.plan : null;
  if (!plan) {
    const priceId = obj?.lines?.data?.[0]?.price?.id ?? obj?.items?.data?.[0]?.price?.id ?? null;
    plan = planForPriceId(priceId);
  }
  return { tenantId: Number.isInteger(tid) ? tid : null, plan };
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 });
  }

  const sig = request.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Sin firma' }, { status: 400 });

  const raw = await request.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret);
  } catch (e: unknown) {
    console.error('Stripe webhook firma inválida:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  const effect = billingEffectForEvent(event.type);
  if (!effect.billingStatus && !effect.extendLicense) {
    return NextResponse.json({ received: true }); // evento que no nos interesa
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = event.data.object as any;
  const { tenantId, plan } = extractTenantAndPlan(obj);
  if (!tenantId) {
    console.warn('Stripe webhook sin tenantId resoluble; evento', event.type);
    return NextResponse.json({ received: true });
  }

  const db = getServiceClient();
  try {
    if (effect.billingStatus === 'suspended') {
      await db.from('tenants').update({ billing_status: 'suspended' }).eq('id', tenantId);
      return NextResponse.json({ received: true });
    }

    // billingStatus === 'active'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = { billing_status: 'active' };
    if (plan && plan !== 'free') update.plan = plan;

    if (effect.extendLicense) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: t } = await db.from('tenants').select('license_until').eq('id', tenantId).maybeSingle();
      const base = t?.license_until && (t.license_until as string) > today ? (t.license_until as string) : today;
      const newUntil = addMonths(base, 1);
      update.license_until = newUntil;
      await db.from('tenants').update(update).eq('id', tenantId);
      if (plan) {
        await db.from('charges').insert({
          tenant_id: tenantId,
          amount: planPrice(plan),
          concept: `Stripe: plan ${plan} (1 mes)`,
          period_start: base,
          period_end: newUntil,
        });
      }
    } else {
      await db.from('tenants').update(update).eq('id', tenantId);
    }
    return NextResponse.json({ received: true });
  } catch (e: unknown) {
    console.error('Stripe webhook procesamiento:', e instanceof Error ? e.message : e);
    // 500 → Stripe reintentará; nuestra lógica es segura de reintentar salvo el
    // charge duplicado (riesgo bajo: Stripe no reintenta un 2xx). Devolvemos 500
    // solo si algo falló de verdad.
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 });
  }
}
