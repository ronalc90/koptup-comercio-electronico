import { describe, it, expect } from 'vitest';
import { sanitizeIlikeTerm } from './route';

describe('sanitizeIlikeTerm: filter injection en .or() de búsqueda amplia', () => {
  it('elimina comas, paréntesis y puntos del payload de inyección', () => {
    // Intento clásico de filter injection PostgREST: cerrar el ilike y colar un
    // filtro por otro tenant. Tras sanear no deben quedar separadores de filtro.
    const malicious = 'x%,tenant_id.eq.999';
    const safe = sanitizeIlikeTerm(malicious);

    expect(safe).not.toContain(',');
    expect(safe).not.toContain('.');
    expect(safe).not.toContain('(');
    expect(safe).not.toContain(')');
  });

  it('el término saneado no puede inyectar un filtro tenant_id en el string .or()', () => {
    // Reconstruimos exactamente el patrón que usa la ruta para la búsqueda amplia
    // y verificamos que el resultado no contiene un clause `tenant_id.eq.999`
    // capaz de saltar el aislamiento por tenant.
    const term = sanitizeIlikeTerm('x%,tenant_id.eq.999');
    const orClause = `model.ilike.%${term}%,color.ilike.%${term}%,category.ilike.%${term}%`;

    expect(orClause).not.toContain('tenant_id.eq.999');
    // El `%` sobrante es inofensivo: dentro de un ilike es un comodín y NO separa
    // filtros. Lo que rompía el aislamiento era la coma; al quitarla, el .or()
    // queda con exactamente tres filtros ilike por columna y ninguno extra.
    expect(orClause.split(',')).toEqual([
      'model.ilike.%x%tenant_ideq999%',
      'color.ilike.%x%tenant_ideq999%',
      'category.ilike.%x%tenant_ideq999%',
    ]);
  });

  it('conserva términos legítimos de búsqueda', () => {
    expect(sanitizeIlikeTerm('vaquita blanca')).toBe('vaquita blanca');
    expect(sanitizeIlikeTerm('maxisaco')).toBe('maxisaco');
  });
});
