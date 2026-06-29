import { supabase, supabaseConfigured } from './supabase';

let _paymentTimingSupported: boolean | null = null;
let _courierPendingRenamed: boolean | null = null;
let _tenantSupported: boolean | null = null;
let _orderQuantitySupported: boolean | null = null;
let _supplierSupported: boolean | null = null;
let _inventorySupplierSupported: boolean | null = null;
let _orderShippingSupported: boolean | null = null;
let _tenantShippingConfigSupported: boolean | null = null;

/**
 * Detecta si la migración multi-tenant (002) ya corrió comprobando la columna
 * `tenant_id` en `orders`. Mientras devuelva false, el guard multi-tenant
 * permanece desarmado y la app funciona EXACTAMENTE igual que antes.
 * Cachea el resultado.
 */
export async function isTenantSupported(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  // Solo cacheamos el `true`: una vez aplicada, la migración no se revierte. El
  // `false` NO se cachea, así un proceso que arrancó antes de la migración la
  // detecta en cuanto corre (si no, quedaría como passthrough hasta reiniciar).
  if (_tenantSupported === true) return true;
  try {
    const { error } = await supabase.from('orders').select('tenant_id').limit(1);
    if (!error) {
      _tenantSupported = true;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * RETIRADO. La columna legacy `owner` (por-username) separaba datos ANTES del
 * multi-tenant. Hoy el aislamiento lo da `tenant_id` (migración 002 + RLS 003 +
 * guard withTenant), así que filtrar/escribir por `owner` solo creaba silos
 * DENTRO de un mismo negocio (cada usuario veía únicamente lo suyo) y, peor,
 * rompía por mayúsculas: los datos de Meraki tienen owner='Paola' pero los
 * usernames son 'paola'/'ronald'/'lizeth', así que admin/member no veían NADA en
 * las pantallas (productos, pedidos, inventario, dashboard, despacho). Devolvemos
 * siempre false para que ningún call-site filtre ni escriba `owner`; la columna
 * queda inerte (nullable, con default en BD). Se conserva la función para no
 * tocar los ~30 call-sites `if (hasOwner)`.
 */
export async function isOwnerSupported(): Promise<boolean> {
  return false;
}

export async function isPaymentTimingSupported(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  if (_paymentTimingSupported !== null) return _paymentTimingSupported;
  try {
    const { error } = await supabase.from('orders').select('payment_timing').limit(1);
    _paymentTimingSupported = !error;
  } catch {
    _paymentTimingSupported = false;
  }
  return _paymentTimingSupported;
}

/**
 * Detecta si la columna `payment_courier_pending` (nombre v1.012) existe.
 * Si todavía no, la BD tiene `payment_cash_bogo` (nombre legacy) y los
 * call-sites deben escribir/leer con ese nombre. Cachea el resultado.
 */
export async function isCourierPendingRenamed(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  if (_courierPendingRenamed !== null) return _courierPendingRenamed;
  try {
    const { error } = await supabase.from('orders').select('payment_courier_pending').limit(1);
    _courierPendingRenamed = !error;
  } catch {
    _courierPendingRenamed = false;
  }
  return _courierPendingRenamed;
}

/** Devuelve el nombre real de la columna a escribir según haya corrido o no la migración. */
export async function courierPendingColumn(): Promise<'payment_courier_pending' | 'payment_cash_bogo'> {
  return (await isCourierPendingRenamed()) ? 'payment_courier_pending' : 'payment_cash_bogo';
}

/**
 * Detecta si la columna `orders.quantity` (migración 013) existe. Mientras no,
 * el pedido no guarda la cantidad y las devoluciones restauran 1 unidad (igual
 * que antes). Una vez aplicada, create_order la persiste y return_order restaura
 * la cantidad exacta. Cachea solo el `true`.
 */
export async function isOrderQuantitySupported(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  if (_orderQuantitySupported === true) return true;
  try {
    const { error } = await supabase.from('orders').select('quantity').limit(1);
    if (!error) {
      _orderQuantitySupported = true;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Detecta si la columna `orders.supplier_id` (migración 016) existe. Mientras no
 * haya corrido la migración, los pedidos no asocian proveedor y el call-site
 * omite la columna (la app funciona igual). Cachea solo el `true`.
 */
export async function isSupplierSupported(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  if (_supplierSupported === true) return true;
  try {
    const { error } = await supabase.from('orders').select('supplier_id').limit(1);
    if (!error) {
      _supplierSupported = true;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Detecta si la columna `inventory.supplier_id` (migración 018) existe. Mientras
 * no, la captura de inventario no asocia proveedor y el call-site omite la
 * columna. Cachea solo el `true`.
 */
export async function isInventorySupplierSupported(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  if (_inventorySupplierSupported === true) return true;
  try {
    const { error } = await supabase.from('inventory').select('supplier_id').limit(1);
    if (!error) { _inventorySupplierSupported = true; return true; }
    return false;
  } catch { return false; }
}

/**
 * Detecta si la migración 018 amplió `orders` con transportadora/tracking
 * (`carrier`). El mismo 018 también amplió el CHECK de estados con las fases de
 * alistamiento, así que esta detección habilita TANTO las fases nuevas como el
 * tracking. Mientras devuelva false, el pipeline usa los 6 estados clásicos y no
 * se escribe carrier/tracking. Cachea solo el `true`.
 */
export async function isOrderShippingSupported(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  if (_orderShippingSupported === true) return true;
  try {
    const { error } = await supabase.from('orders').select('carrier').limit(1);
    if (!error) { _orderShippingSupported = true; return true; }
    return false;
  } catch { return false; }
}

/** Detecta si `tenants.shipping_config` (migración 018) existe. Cachea solo el `true`. */
export async function isTenantShippingConfigSupported(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  if (_tenantShippingConfigSupported === true) return true;
  try {
    const { error } = await supabase.from('tenants').select('shipping_config').limit(1);
    if (!error) { _tenantShippingConfigSupported = true; return true; }
    return false;
  } catch { return false; }
}
