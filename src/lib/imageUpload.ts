/**
 * Límites de subida de imágenes. Fuente ÚNICA para que la validación del cliente
 * (conveniencia) y la del servidor (autoridad real) NO se desincronicen: antes el
 * tamaño máximo y los tipos permitidos estaban duplicados como literales en la
 * ruta de subida, el selector de logo y la pantalla de productos.
 */
export const MAX_IMAGE_MB = 5;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Valor para el atributo `accept` de un <input type="file">. */
export const ALLOWED_IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(',');

export function isAllowedImageType(type: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}
