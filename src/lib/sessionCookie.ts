/**
 * Nombre de la cookie de sesión. Vive en su PROPIO módulo (sin dependencias
 * pesadas) para poder reutilizarse tanto desde el proxy/middleware —que corre en
 * un runtime restringido y no puede arrastrar bcrypt/supabase— como desde las
 * rutas de auth, evitando hardcodear el literal en cuatro sitios.
 */
export const COOKIE_NAME = 'meraki-session';
