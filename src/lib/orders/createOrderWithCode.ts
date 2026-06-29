import type { SupabaseClient } from '@supabase/supabase-js';
import { generateOrderCode } from '@/lib/utils';

/**
 * Inserta un pedido resolviendo el `order_code` (fecha + secuencial del día) con
 * REINTENTOS ante colisión de unicidad (índice `uq_orders_tenant_code`,
 * migración 013).
 *
 * Unifica la estrategia que antes estaba DUPLICADA y divergente entre el
 * asistente (que sí reintentaba) y los formularios de pedido nuevo manual/IA
 * (que hacían un solo intento y fallaban con "Error al guardar" si el secuencial
 * colisionaba por concurrencia o por un pedido borrado). El secuencial sale de un
 * conteo leído justo antes de insertar; ante un 23505 se prueba el siguiente.
 *
 * `payload` NO debe traer `order_code`: se fija aquí en cada intento. Devuelve el
 * `order_code` efectivamente insertado.
 */
export async function createOrderWithCode(
  client: SupabaseClient,
  payload: Record<string, unknown>,
  date: Date,
  dateStr: string,
): Promise<string> {
  let lastErr: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: existing } = await client
      .from('orders')
      .select('id')
      .gte('order_date', dateStr)
      .lte('order_date', dateStr);
    const seq = (existing?.length || 0) + 1 + attempt;
    const orderCode = generateOrderCode(date, seq);
    const { error } = await client.from('orders').insert({ ...payload, order_code: orderCode });
    if (!error) return orderCode;
    lastErr = error;
    if (error.code !== '23505') break; // no es colisión de unicidad → no reintentar
  }
  throw new Error(lastErr?.message || 'No se pudo guardar el pedido');
}
