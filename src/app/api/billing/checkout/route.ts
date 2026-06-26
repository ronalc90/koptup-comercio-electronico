import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getStripe, priceIdForPlan } from '@/lib/stripe';
import { isPlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/**
 * Crea una sesión de Checkout de Stripe (suscripción mensual) para que el admin
 * del negocio contrate/suba de plan. Devuelve { url } para redirigir. Si Stripe
 * no está configurado, responde 503 (pagos no disponibles).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Pagos no disponibles por ahora.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const plan = body.plan;
  if (!isPlan(plan) || plan === 'free') {
    return NextResponse.json({ error: 'Plan inválido para pago' }, { status: 400 });
  }
  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    return NextResponse.json({ error: 'El plan seleccionado no tiene precio configurado en Stripe.' }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  const meta = { tenantId: String(auth.ctx.tenantId), plan };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Identifica el negocio en el webhook (en la sesión y en la suscripción,
      // para que las renovaciones futuras también sepan a qué tenant aplican).
      client_reference_id: String(auth.ctx.tenantId),
      metadata: meta,
      subscription_data: { metadata: meta },
      customer_email: auth.ctx.email ?? undefined,
      allow_promotion_codes: true,
      success_url: `${origin}/billing?paid=1`,
      cancel_url: `${origin}/billing?cancel=1`,
    });
    if (!session.url) {
      return NextResponse.json({ error: 'No se pudo crear el checkout' }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    console.error('Stripe checkout error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'No se pudo iniciar el pago. Inténtalo de nuevo.' }, { status: 502 });
  }
}
