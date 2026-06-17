/**
 * Carga de datos para los agentes. El cliente que recibe YA viene acotado al
 * tenant (vía getRequestScopedClient), así que aquí no hay riesgo de mezclar
 * negocios: cada `.from()` se filtra solo por el tenant del usuario.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantData } from './types';
import type { Order, Product, InventoryItem } from '../types';

export async function loadTenantData(client: SupabaseClient): Promise<TenantData> {
  const [ordersRes, productsRes, inventoryRes, expensesRes] = await Promise.all([
    client.from('orders').select('*'),
    client.from('products').select('*'),
    client.from('inventory').select('*'),
    client.from('expenses').select('*'),
  ]);

  return {
    orders: (ordersRes.data ?? []) as Order[],
    products: (productsRes.data ?? []) as Product[],
    inventory: (inventoryRes.data ?? []) as InventoryItem[],
    expenses: (expensesRes.data ?? []) as TenantData['expenses'],
  };
}
