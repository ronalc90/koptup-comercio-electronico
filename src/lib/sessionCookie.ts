/**
 * Nombre de la cookie de sesión. Vive en su PROPIO módulo (sin dependencias
 * pesadas) para poder reutilizarse tanto desde el proxy/middleware —que corre en
 * un runtime restringido y no puede arrastrar bcrypt/supabase— como desde las
 * rutas de auth, evitando hardcodear el literal en cuatro sitios.
 */
export const COOKIE_NAME = 'koptup-session';
// Nombre histórico (antes del rebrand a koptup). Se sigue LEYENDO como respaldo
// para NO cerrar las sesiones ya abiertas; solo se escribe el nuevo (COOKIE_NAME).
export const LEGACY_COOKIE_NAME = 'meraki-session';
