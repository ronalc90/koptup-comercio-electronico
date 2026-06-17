import { supabase, supabaseConfigured } from './supabase';

let _ownerSupported: boolean | null = null;
let _paymentTimingSupported: boolean | null = null;
let _courierPendingRenamed: boolean | null = null;
let _tenantSupported: boolean | null = null;

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

export async function isOwnerSupported(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  if (_ownerSupported !== null) return _ownerSupported;
  try {
    const { error } = await supabase.from('products').select('owner').limit(1);
    _ownerSupported = !error;
  } catch {
    _ownerSupported = false;
  }
  return _ownerSupported;
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
