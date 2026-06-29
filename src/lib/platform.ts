/**
 * Marca de la PLATAFORMA (no de un tenant). Se usa cuando la identidad mostrada
 * debe ser la del producto y no la de un negocio: por ejemplo, el superadmin
 * (que opera la plataforma completa, no un negocio) no debe ver la marca del
 * tenant al que está atada su cuenta.
 */
export const PLATFORM_BRAND = {
  /** Nombre corto para espacios reducidos (sidebar). */
  name: 'koptup',
  /** Nombre completo de la plataforma. */
  fullName: 'koptup Comercio Electrónico',
  /** Logo/emoji de la plataforma. */
  logo: '🛒',
} as const;
