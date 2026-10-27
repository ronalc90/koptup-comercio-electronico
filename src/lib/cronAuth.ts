import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compara dos secretos en tiempo constante. `timingSafeEqual` exige buffers de
 * la MISMA longitud (si no, lanza), así que se comparan los SHA-256 de ambos:
 * siempre 32 bytes, y de paso no se filtra la longitud del secreto esperado.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/**
 * ¿La cabecera `Authorization` trae `Bearer <CRON_SECRET>`? (lo que envía Vercel
 * Cron). Sin secreto configurado nunca autoriza por esta vía.
 */
export function hasValidCronSecret(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  return secretsMatch(authorization, `Bearer ${secret}`);
}
