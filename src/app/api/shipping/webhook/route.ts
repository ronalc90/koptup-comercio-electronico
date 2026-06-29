import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isOrderShippingSupported, isTenantShippingConfigSupported } from '@/lib/db';
import { getCarrierAdapter, orderStatusForTracking, type TenantShippingConfig } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/**
 * Webhook de la transportadora: actualiza el estado de un pedido a partir de un
 * número de guía. No hay sesión (lo llama el carrier), así que:
 *   - se exige el secreto `SHIPPING_WEBHOOK_SECRET` (header x-shipping-secret),
 *   - se ubica el pedido por `tracking_number` con el service client y se acota
 *     al tenant dueño de esa guía para construir su adaptador y aplicar la
 *     actualización solo a ESE pedido.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SHIPPING_WEBHOOK_SECRET;
  if (!secret || request.headers.get('x-shipping-secret') !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!(await isOrderShippingSupported())) {
    return NextResponse.json({ received: true, skipped: 'shipping no soportado' });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  // Número de guía: aceptamos las claves usuales de los carriers.
  const tracking = String(
    (payload.numeroGuia ?? payload.guia ?? payload.tracking ?? payload.trackingNumber ?? '') as string,
  ).trim();
  if (!tracking) return NextResponse.json({ error: 'Sin número de guía' }, { status: 400 });

  const db = getServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('id, tenant_id, tracking_number, delivery_status')
    .eq('tracking_number', tracking)
    .maybeSingle();
  if (!order) return NextResponse.json({ received: true, matched: false });

  let shippingConfig: TenantShippingConfig | null = null;
  if (await isTenantShippingConfigSupported()) {
    const { data: t } = await db.from('tenants').select('shipping_config').eq('id', order.tenant_id).maybeSingle();
    shippingConfig = (t?.shipping_config as TenantShippingConfig | null) ?? null;
  }
  const adapter = getCarrierAdapter(shippingConfig);
  const update = adapter.parseWebhook(payload);
  if (!update) return NextResponse.json({ received: true, parsed: false });

  const patch: Record<string, unknown> = {
    tracking_status: update.status,
    tracking_updated_at: update.updatedAt,
  };
  const mapped = orderStatusForTracking(update.status);
  if (mapped) patch.delivery_status = mapped;

  // Update acotado por id + tenant_id (defensa: solo el pedido de ese tenant).
  await db.from('orders').update(patch).eq('id', order.id).eq('tenant_id', order.tenant_id);
  return NextResponse.json({ received: true, matched: true, status: update.status });
}
