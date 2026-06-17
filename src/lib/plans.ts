/**
 * Planes del SaaS (Fase 5). Definen límites por negocio. El cobro automático
 * (pasarela de pagos) queda fuera de alcance — el superadmin asigna el plan a
 * mano; aquí solo modelamos qué permite cada uno.
 *
 * Diseño conservador: el ÚNICO límite que se ENFORZA es el de usuarios (acción
 * rara, de admin). Pedidos/productos son informativos (uso vs. tope), para NO
 * bloquear la operación diaria de un negocio en vivo.
 */
export type Plan = 'free' | 'pro' | 'enterprise';
export const PLANS_ORDER: Plan[] = ['free', 'pro', 'enterprise'];

export interface PlanLimits {
  /** Tope informativo de pedidos. */
  orders: number;
  /** Tope informativo de productos. */
  products: number;
  /** Tope ENFORZADO de usuarios. */
  users: number;
}

export interface PlanDef {
  key: Plan;
  label: string;
  limits: PlanLimits;
}

const INF = Number.POSITIVE_INFINITY;

export const PLANS: Record<Plan, PlanDef> = {
  free: { key: 'free', label: 'Free', limits: { orders: 1000, products: 1000, users: 5 } },
  pro: { key: 'pro', label: 'Pro', limits: { orders: 20000, products: 10000, users: 20 } },
  enterprise: { key: 'enterprise', label: 'Enterprise', limits: { orders: INF, products: INF, users: INF } },
};

export function isPlan(v: unknown): v is Plan {
  return typeof v === 'string' && (PLANS_ORDER as string[]).includes(v);
}

export function getPlan(plan: string | null | undefined): PlanDef {
  return isPlan(plan) ? PLANS[plan] : PLANS.free;
}

export function planLimit(plan: string | null | undefined, key: keyof PlanLimits): number {
  return getPlan(plan).limits[key];
}

/** ¿Una cantidad actual está en/sobre el tope del plan para esa métrica? */
export function atOrOverLimit(plan: string | null | undefined, key: keyof PlanLimits, current: number): boolean {
  return current >= planLimit(plan, key);
}
