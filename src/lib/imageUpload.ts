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

/** Carpeta por defecto dentro del prefijo del tenant (`t{id}/…`). */
export const DEFAULT_UPLOAD_FOLDER = 'products';
// Un solo segmento: solo minúsculas, dígitos, `-` y `_`. Sin `/` ni `.`, así que
// no admite `..` ni subcarpetas para salirse del prefijo `t{tenantId}/`.
const UPLOAD_FOLDER_RE = /^[a-z0-9_-]{1,40}$/;

/**
 * Valida la carpeta que manda el cliente para la subida. Ausente o vacía →
 * carpeta por defecto. Devuelve `null` si no es un segmento válido (la ruta
 * responde 400 en vez de construir una ruta de Storage con ella).
 */
export function sanitizeUploadFolder(folder: unknown): string | null {
  if (folder === undefined || folder === null || folder === '') return DEFAULT_UPLOAD_FOLDER;
  if (typeof folder !== 'string') return null;
  return UPLOAD_FOLDER_RE.test(folder) ? folder : null;
}
