/**
 * Planes del SaaS (Fase 5). Los planes van por CANTIDAD DE PRODUCTOS: cada plan
 * permite hasta `productLimit` productos y tiene un precio mensual. El negocio
 * (tenant) paga por su plan; ve su uso, su licencia y cuánto ha pagado.
 *
 * El tope de productos se ENFORZA a nivel de base de datos (trigger), así no se
 * puede saltar desde el cliente. Los datos existentes nunca se borran: al llegar
 * al tope solo se impide AGREGAR más productos hasta subir de plan.
 */
export type Plan = 'free' | 'pro' | 'enterprise';
export const PLANS_ORDER: Plan[] = ['free', 'pro', 'enterprise'];

export interface PlanDef {
  key: Plan;
  label: string;
  /** Tope de productos del plan (el límite que define el plan). */
  productLimit: number;
  /** Precio mensual en COP. */
  priceMonthly: number;
}

const INF = Number.POSITIVE_INFINITY;

export const PLANS: Record<Plan, PlanDef> = {
  free: { key: 'free', label: 'Free', productLimit: 50, priceMonthly: 0 },
  pro: { key: 'pro', label: 'Pro', productLimit: 500, priceMonthly: 49900 },
  enterprise: { key: 'enterprise', label: 'Enterprise', productLimit: INF, priceMonthly: 149900 },
};

export function isPlan(v: unknown): v is Plan {
  return typeof v === 'string' && (PLANS_ORDER as string[]).includes(v);
}

export function getPlan(plan: string | null | undefined): PlanDef {
  return isPlan(plan) ? PLANS[plan] : PLANS.free;
}

/** Tope de productos del plan. */
export function productLimit(plan: string | null | undefined): number {
  return getPlan(plan).productLimit;
}

/** Precio mensual del plan (COP). */
export function planPrice(plan: string | null | undefined): number {
  return getPlan(plan).priceMonthly;
}

/** ¿La cantidad de productos alcanza/supera el tope del plan? */
export function atOrOverProductLimit(plan: string | null | undefined, productCount: number): boolean {
  return productCount >= productLimit(plan);
}

/** Estado de uso del cupo de productos para la UI (preemptivo, no enforza nada). */
export interface ProductUsage {
  /** Productos usados. */
  count: number;
  /** Tope del plan; null = ilimitado. */
  limit: number | null;
  /** % de uso 0..100 (0 si es ilimitado). */
  percent: number;
  /** Se alcanzó/superó el tope (ilimitado nunca lo alcanza). */
  atLimit: boolean;
  /** Uso >= 80% (ilimitado nunca está cerca). */
  nearLimit: boolean;
}

/**
 * Deriva el estado de uso del cupo de productos a partir del contador y el tope.
 * `limit` puede venir como null (ilimitado) tal como lo expone GET /api/billing.
 */
export function productUsage(productCount: number, limit: number | null): ProductUsage {
  const count = Math.max(0, productCount);
  if (limit === null || !Number.isFinite(limit)) {
    return { count, limit: null, percent: 0, atLimit: false, nearLimit: false };
  }
  const percent = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 100;
  return {
    count,
    limit,
    percent,
    atLimit: count >= limit,
    nearLimit: limit > 0 ? count / limit >= 0.8 : true,
  };
}

/** Formatea un monto en pesos colombianos. */
export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
}
