/**
 * Cliente Stripe (solo servidor) y mapeo plan↔precio. Todo es OPCIONAL: si no
 * hay STRIPE_SECRET_KEY, getStripe() devuelve null y las rutas de pago responden
 * "pagos no configurados" sin romper nada. Así desplegar esto NO cambia el
 * comportamiento hasta que se conecten las llaves de Stripe.
 *
 * Modelo: SUSCRIPCIÓN mensual. Cada plan de pago (pro/enterprise) tiene un Price
 * recurrente creado en Stripe; su ID se inyecta por variable de entorno
 * (STRIPE_PRICE_PRO / STRIPE_PRICE_ENTERPRISE). El precio en COP lo define Stripe;
 * nuestra tabla `charges` guarda el precio del plan (plans.ts) para el historial.
 */
import Stripe from 'stripe';
import type { Plan } from './plans';

let _stripe: Stripe | null = null;

/** Cliente Stripe, o null si no está configurado (sin llave secreta). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

/** ¿Pagos por Stripe operativos? Requiere llave secreta + secreto de webhook. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/** Price ID recurrente de un plan de pago (null para free o si no está configurado). */
export function priceIdForPlan(plan: Plan): string | null {
  if (plan === 'pro') return process.env.STRIPE_PRICE_PRO || null;
  if (plan === 'enterprise') return process.env.STRIPE_PRICE_ENTERPRISE || null;
  return null;
}

/** Plan correspondiente a un Price ID de Stripe (para webhooks de renovación). */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return 'enterprise';
  return null;
}
