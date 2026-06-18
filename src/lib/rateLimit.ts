/**
 * Rate limiter en memoria (ventana fija). Best-effort: en serverless es POR
 * INSTANCIA, así que no es una defensa fuerte, pero frena ráfagas de fuerza
 * bruta de login desde una misma IP/usuario. Para algo robusto: Vercel KV/Redis.
 *
 * Puro y testeable: se puede inyectar `now` para los tests.
 */
interface Hit {
  count: number;
  resetAt: number;
}

const store = new Map<string, Hit>();

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Registra un intento para `key` y dice si está permitido.
 * @param max     intentos permitidos por ventana
 * @param windowMs duración de la ventana en ms
 */
export function rateLimit(key: string, max: number, windowMs: number, now: number = Date.now()): RateResult {
  const h = store.get(key);
  if (!h || now >= h.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfterSec: 0 };
  }
  if (h.count >= max) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((h.resetAt - now) / 1000)) };
  }
  h.count++;
  return { allowed: true, remaining: max - h.count, retryAfterSec: 0 };
}

/** Limpia el contador de un key (ej. tras un login exitoso). */
export function clearRateLimit(key: string): void {
  store.delete(key);
}

/** Solo para tests: vacía todo el store. */
export function _resetRateLimitStore(): void {
  store.clear();
}
