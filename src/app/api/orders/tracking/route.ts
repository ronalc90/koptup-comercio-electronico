import { NextRequest, NextResponse } from 'next/server';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { getServiceClient } from '@/lib/supabase';
import { isAdministrativeRole } from '@/lib/permissions';
import { roleAtLeast } from '@/lib/tenant';
import { isOrderShippingSupported, isTenantShippingConfigSupported } from '@/lib/db';
import { getCarrierAdapter, orderStatusForTracking, type TenantShippingConfig } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/**
 * Refresca el estado de envío de un pedido consultando a la transportadora y, si
 * el envío avanzó (en tránsito/entregado/devuelto), mueve el `delivery_status`
 * en consecuencia. member opera; admin/viewer no.
 */
export async function POST(request: NextRequest) {
  const scoped = await getRequestScopedClient();
  if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (isAdministrativeRole(scoped.ctx.role) || !roleAtLeast(scoped.ctx.role, 'member')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (!(await isOrderShippingSupported())) {
    return NextResponse.json({ error: 'El seguimiento de envíos no está disponible (migración pendiente)' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const id = Math.round(Number(body.id));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  const { data: order } = await scoped.client
    .from('orders').select('id, tracking_number, carrier, delivery_status').eq('id', id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  if (!order.tracking_number) return NextResponse.json({ error: 'El pedido no tiene guía de transportadora' }, { status: 400 });

  let shippingConfig: TenantShippingConfig | null = null;
  if (await isTenantShippingConfigSupported()) {
    const { data: t } = await getServiceClient().from('tenants').select('shipping_config').eq('id', scoped.ctx.tenantId).maybeSingle();
    shippingConfig = (t?.shipping_config as TenantShippingConfig | null) ?? null;
  }
  const adapter = getCarrierAdapter(shippingConfig);

  let trackingStatus: string;
  let mapped: ReturnType<typeof orderStatusForTracking>;
  try {
    const upd = await adapter.getStatus(String(order.tracking_number));
    trackingStatus = upd.status;
    mapped = orderStatusForTracking(upd.status);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo consultar la transportadora' }, { status: 502 });
  }

  const update: Record<string, unknown> = {
    tracking_status: trackingStatus,
    tracking_updated_at: new Date().toISOString(),
  };
  // Solo avanza hacia adelante (no retrocede una entrega ya marcada).
  if (mapped) update.delivery_status = mapped;

  const { data: updated, error } = await scoped.client
    .from('orders').update(update).eq('id', id)
    .select('id, delivery_status, tracking_status, tracking_updated_at').single();
  if (error) return NextResponse.json({ error: 'No se pudo actualizar el pedido' }, { status: 500 });
  return NextResponse.json({ order: updated });
}
