// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { hasValidCronSecret, secretsMatch } from './cronAuth';

describe('secretsMatch (tiempo constante)', () => {
  it('iguales → true', () => {
    expect(secretsMatch('abc123', 'abc123')).toBe(true);
  });

  it('distintos de la misma longitud → false', () => {
    expect(secretsMatch('abc123', 'abc124')).toBe(false);
  });

  it('longitudes distintas → false (sin lanzar, a diferencia de timingSafeEqual directo)', () => {
    expect(() => secretsMatch('a', 'una-cadena-mucho-mas-larga')).not.toThrow();
    expect(secretsMatch('a', 'una-cadena-mucho-mas-larga')).toBe(false);
    expect(secretsMatch('', 'x')).toBe(false);
  });

  it('caracteres multibyte no rompen la comparación', () => {
    expect(secretsMatch('contraseña-ñ', 'contraseña-ñ')).toBe(true);
    expect(secretsMatch('contraseña-ñ', 'contrasena-n')).toBe(false);
  });
});

describe('hasValidCronSecret', () => {
  const SECRET = 's3creto-del-cron-0123456789';

  it('Bearer <secreto> correcto → true', () => {
    expect(hasValidCronSecret(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ['secreto incorrecto', `Bearer ${SECRET}x`],
    ['sin prefijo Bearer', SECRET],
    ['prefijo en minúsculas', `bearer ${SECRET}`],
    ['vacío', ''],
  ])('%s → false', (_name, header) => {
    expect(hasValidCronSecret(header, SECRET)).toBe(false);
  });

  it('sin cabecera → false', () => {
    expect(hasValidCronSecret(null, SECRET)).toBe(false);
  });

  it('sin CRON_SECRET configurado nunca autoriza (ni con "Bearer " a secas)', () => {
    expect(hasValidCronSecret('Bearer ', undefined)).toBe(false);
    expect(hasValidCronSecret('Bearer ', '')).toBe(false);
    expect(hasValidCronSecret('Bearer undefined', undefined)).toBe(false);
  });
});
