import { NextRequest, NextResponse } from 'next/server';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { isAdministrativeRole } from '@/lib/permissions';
import { isValidDateString } from '@/lib/assistant/validation';
import {
  consumoPorProveedor,
  cuentasPorPagarPorProveedor,
  rotacionPorProveedor,
  type SupplierLite,
  type SoldOrderLite,
  type DateRange,
} from '@/lib/suppliers/calculations';

export const dynamic = 'force-dynamic';

/**
 * Reportes internos por proveedor sobre lo YA VENDIDO/DESPACHADO. La lógica vive
 * en src/lib/suppliers/calculations.ts (pura/testeable); aquí solo cargamos los
 * datos del tenant (scoped) y delegamos. ?type=consumo|payables|rotacion.
 */
export async function GET(request: NextRequest) {
  const scoped = await getRequestScopedClient();
  if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (isAdministrativeRole(scoped.ctx.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'consumo';
  const fromRaw = url.searchParams.get('from');
  const toRaw = url.searchParams.get('to');
  const range: DateRange | null =
    isValidDateString(fromRaw) && isValidDateString(toRaw) ? { from: fromRaw, to: toRaw } : null;

  const [suppliersRes, ordersRes] = await Promise.all([
    scoped.client.from('suppliers').select('id, name, plazo_dias, dia_corte'),
    scoped.client
      .from('orders')
      .select('supplier_id, product_cost, quantity, value_to_collect, delivery_status, order_date'),
  ]);

  if (suppliersRes.error || ordersRes.error) {
    console.error('Suppliers reports error:', suppliersRes.error?.message || ordersRes.error?.message);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }

  const suppliers = (suppliersRes.data ?? []) as SupplierLite[];
  const orders = (ordersRes.data ?? []) as SoldOrderLite[];
  const today = new Date().toISOString().slice(0, 10);

  if (type === 'payables') {
    return NextResponse.json({ type, report: cuentasPorPagarPorProveedor(orders, suppliers, today) });
  }
  if (type === 'rotacion') {
    return NextResponse.json({ type, report: rotacionPorProveedor(orders, suppliers, today) });
  }
  return NextResponse.json({ type: 'consumo', report: consumoPorProveedor(orders, suppliers, range) });
}
