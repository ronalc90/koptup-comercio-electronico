-- ============================================================================
-- 019_settings_hide_secrets.sql — La API key de OpenAI deja de ser legible por
-- PostgREST
-- ============================================================================
-- `settings` tiene `tenant_isolation` (003): cualquier usuario del negocio, con
-- el JWT de tenant que la app entrega al navegador (SUPABASE_JWT_SECRET), podía
-- leer TODAS las filas de su negocio, incluida `openai_api_key` en texto plano:
--   GET /rest/v1/settings?key=eq.openai_api_key   (apikey anon + Bearer del JWT)
-- La pantalla de Configuración la enmascara (`sk-...1234`) en /api/settings,
-- pero esa máscara se saltaba consultando PostgREST directo, incluso con el rol
-- "Solo lectura".
--
-- Política RESTRICTIVA (se combina con AND con tenant_isolation): las filas de
-- secretos quedan fuera del alcance de anon/authenticated para leer y escribir.
-- El service role (rutas del servidor: /api/settings y las rutas de IA) omite
-- RLS y sigue leyendo y guardando la clave igual que hoy. El navegador nunca
-- consulta `settings` directo, así que la UI no cambia.
--
-- Aditiva e idempotente. No modifica datos ni la política tenant_isolation.
-- Rollback: DROP POLICY IF EXISTS settings_hide_secrets ON settings;
-- ============================================================================

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_hide_secrets ON settings;
CREATE POLICY settings_hide_secrets ON settings AS RESTRICTIVE FOR ALL
  USING (key <> 'openai_api_key')
  WITH CHECK (key <> 'openai_api_key');
