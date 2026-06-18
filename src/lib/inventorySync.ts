/**
 * Reglas de inventario al guardar un pedido (v1.010):
 *
 * 1) Si el producto existe en inventario → descontamos la cantidad del pedido
 *    con `Math.max(0, stock - qty)` para NUNCA quedar en negativo.
 *
 * 2) Si NO existe en inventario pero sí en el catálogo (products) →
 *    creamos un registro de inventario con cantidad 0 y `reference = cost`
 *    para que la contabilidad tenga el costo de referencia disponible.
 *    Esto evita perder el costo histórico cuando se venden unidades que
 *    no habían sido registradas en stock.
 *
 * 3) Si el producto tampoco está en el catálogo → no podemos inferir el
 *    costo; devolvemos `noop` y la contabilidad usará el product_cost que
 *    ya quedó guardado en la orden.
 */
import { supabase } from './supabase';
import type { Product } from './types';

export type InventorySyncOutcome =
  | { kind: 'decremented'; inventoryId: number; newQty: number }
  | { kind: 'createdZeroStock'; inventoryId: number }
  | { kind: 'noop' };

export type InventorySyncResult = InventorySyncOutcome & {
  createdZeroStock: boolean;
  decremented: boolean;
};

interface SyncArgs {
  owner: string;
  hasOwner: boolean;
  productRef: string;
  detail: string;
  searchTerm: string;
  quantity: number;
  product: Product | null;
}

function bestMatch(
  items: Array<{ id: number; model: string; quantity: number }>,
  haystacks: string[],
): { id: number; model: string; quantity: number } | null {
  const tokens = haystacks
    .map((h) => h.toLowerCase().trim())
    .filter(Boolean);
  if (!tokens.length) return null;
  for (const item of items) {
    const model = (item.model || '').toLowerCase();
    if (!model) continue;
    for (const t of tokens) {
      if (t.includes(model) || model.includes(t.split(/\s+/)[0])) {
        return item;
      }
    }
  }
  return null;
}

export async function syncInventoryOnOrderSave(args: SyncArgs): Promise<InventorySyncResult> {
  const { owner, hasOwner, productRef, detail, searchTerm, quantity, product } = args;

  const wrap = (o: InventorySyncOutcome): InventorySyncResult => ({
    ...o,
    createdZeroStock: o.kind === 'createdZeroStock',
    decremented: o.kind === 'decremented',
  });

  if (!productRef && !detail && !searchTerm && !product) return wrap({ kind: 'noop' });

  // 1) Buscar en inventario usando el término más específico primero
  let query = supabase.from('inventory').select('id, model, quantity, product_id').eq('status', 'Bueno');
  if (hasOwner) query = query.eq('owner', owner);
  const { data: inv } = await query;
  const items = inv ?? [];

  // Match exacto por product_id si el catálogo lo define, si no por modelo
  let match:
    | { id: number; model: string; quantity: number; product_id?: string }
    | null = null;
  if (product?.code && items.length) {
    match = items.find((i) => i.product_id === product.code) ?? null;
  }
  if (!match) {
    match = bestMatch(items, [searchTerm, detail, productRef]);
  }

  if (match) {
    const newQty = Math.max(0, (match.quantity ?? 0) - quantity);
    const { error } = await supabase.from('inventory').update({ quantity: newQty }).eq('id', match.id);
    if (error) return wrap({ kind: 'noop' });
    return wrap({ kind: 'decremented', inventoryId: match.id, newQty });
  }

  // 2) No existe en inventario: si tenemos el producto del catálogo,
  //    creamos un registro en cero con el costo de referencia.
  if (!product) return wrap({ kind: 'noop' });

  const payload: Record<string, unknown> = {
    model: product.name,
    category: product.category || 'Otro',
    product_id: product.code,
    color: '',
    size: '',
    quantity: 0,
    basket_location: '',
    type: '',
    observations: 'Creado automáticamente al vender producto sin stock previo',
    status: 'Bueno',
    verified: false,
    reference: product.cost || 0,
  };
  if (hasOwner) payload.owner = owner;

  const { data, error } = await supabase.from('inventory').insert(payload).select('id').single();
  if (error || !data) return wrap({ kind: 'noop' });
  return wrap({ kind: 'createdZeroStock', inventoryId: data.id });
}
