/**
 * Resolución ESTRICTA de coincidencias para acciones de escritura por nombre
 * difuso (mark_defective, return_order, update_order_status, edit_order por
 * client_name). Antes estos handlers hacían `.ilike('%x%').limit(1)` y tomaban
 * el primer match arbitrario: con dos clientes "María" o dos modelos con prefijo
 * común se editaba/devolvía/marcaba el registro EQUIVOCADO sin avisar.
 *
 * Misma política que update_cost (que sí aborta con 0 o >1 match): el handler
 * consulta con `.limit(N)` y delega aquí la decisión. Si hay ambigüedad, NO
 * escribe y devuelve los candidatos para que la usuaria desambigüe.
 */

export type MatchResolution<T> =
  | { kind: 'one'; item: T }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: T[] };

/**
 * @param items resultado de la query (ya acotado por tenant). `limit(N)` con
 *              N>=2 permite detectar la ambigüedad.
 */
export function resolveSingleMatch<T>(items: T[] | null | undefined): MatchResolution<T> {
  const list = items ?? [];
  if (list.length === 0) return { kind: 'none' };
  if (list.length === 1) return { kind: 'one', item: list[0] };
  return { kind: 'ambiguous', candidates: list };
}
