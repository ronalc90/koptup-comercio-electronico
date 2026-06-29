import { NextRequest, NextResponse } from 'next/server';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { getServiceClient } from '@/lib/supabase';
import { isAdministrativeRole } from '@/lib/permissions';
import { roleAtLeast } from '@/lib/tenant';
import { isOrderShippingSupported, isTenantShippingConfigSupported } from '@/lib/db';
import { isValidTransition } from '@/lib/orders/phases';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/assistant/constants';
import { getCarrierAdapter, type TenantShippingConfig } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/**
 * Avance de FASE de un pedido (Fase E). member opera; viewer/admin no.
 * Valida la transición (máquina de fases) y, al pasar a 'Enviado' (despacho),
 * crea la GUÍA con la transportadora del tenant y guarda el tracking. El cliente
 * acotado por tenant garantiza el aislamiento; sólo se toca el pedido propio.
 */
export async function POST(request: NextRequest) {
  const scoped = await getRequestScopedClient();
  if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (isAdministrativeRole(scoped.ctx.role) || !roleAtLeast(scoped.ctx.role, 'member')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id = Math.round(Number(body.id));
  const status = body.status as OrderStatus;
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id de pedido inválido' }, { status: 400 });
  }
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Estado de pedido inválido' }, { status: 400 });
  }

  // Carga el pedido (acotado por tenant). Si no existe en mi tenant → 404.
  const { data: order, error: readErr } = await scoped.client
    .from('orders')
    .select('id, order_code, client_name, phone, city, address, complement, delivery_status, dispatch_date, value_to_collect, prepaid_amount, payment_timing, carrier, tracking_number')
    .eq('id', id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

  if (!isValidTransition(order.delivery_status as string, status)) {
    return NextResponse.json({ error: `Transición no válida (${order.delivery_status} → ${status})` }, { status: 400 });
  }

  const update: Record<string, unknown> = { delivery_status: status };
  const today = new Date().toISOString().slice(0, 10);
  let shippingError: string | null = null;

  // Al DESPACHAR (Enviado): fecha de despacho + crear guía si aún no hay tracking.
  if (status === 'Enviado') {
    if (!order.dispatch_date) update.dispatch_date = today;

    const shippingCols = await isOrderShippingSupported();
    if (shippingCols && !order.tracking_number) {
      try {
        let shippingConfig: TenantShippingConfig | null = null;
        if (await isTenantShippingConfigSupported()) {
          const { data: t } = await getServiceClient()
            .from('tenants').select('shipping_config').eq('id', scoped.ctx.tenantId).maybeSingle();
          shippingConfig = (t?.shipping_config as TenantShippingConfig | null) ?? null;
        }
        const adapter = getCarrierAdapter(shippingConfig);
        // Monto a cobrar contra entrega: lo pendiente (total − abono anticipado).
        const cod = Math.max(0, Number(order.value_to_collect || 0) - Number(order.prepaid_amount || 0));
        const guide = await adapter.createGuide({
          orderCode: String(order.order_code || `#${order.id}`),
          recipient: {
            name: String(order.client_name || ''),
            phone: String(order.phone || ''),
            city: String(order.city || ''),
            address: `${order.address || ''} ${order.complement || ''}`.trim(),
          },
          declaredValue: Number(order.value_to_collect || 0),
          codAmount: order.payment_timing === 'Anticipado' ? 0 : cod,
        });
        update.carrier = guide.carrier;
        update.tracking_number = guide.trackingNumber;
        update.tracking_status = guide.status;
        update.tracking_updated_at = new Date().toISOString();
        update.guide_number = guide.trackingNumber;
      } catch (e) {
        // No bloqueamos el despacho si la transportadora falla: avanzamos la fase
        // y reportamos el problema para reintentar la guía.
        shippingError = e instanceof Error ? e.message : 'No se pudo crear la guía';
        console.error('phase: createGuide error:', shippingError);
      }
    }
  }

  const { data: updated, error: updErr } = await scoped.client
    .from('orders')
    .update(update)
    .eq('id', id)
    .select('id, delivery_status, dispatch_date, carrier, tracking_number, tracking_status, guide_number')
    .single();
  if (updErr) {
    console.error('phase: update error:', updErr.message);
    return NextResponse.json({ error: 'No se pudo actualizar el pedido' }, { status: 500 });
  }
  return NextResponse.json({ order: updated, shippingError });
}
