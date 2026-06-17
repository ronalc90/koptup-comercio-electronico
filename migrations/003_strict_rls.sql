-- ============================================================================
-- 003_strict_rls.sql — Aislamiento FORZADO por la base de datos (OPT-IN)
-- ============================================================================
-- Cierra del todo el aislamiento: ya no depende del guard de JS. Cada tabla de
-- negocio queda con RLS que obliga `tenant_id = jwt_tenant_id()`.
--
-- ⚠️ PRERREQUISITO: el cliente del navegador debe autenticarse con un JWT de
--    Supabase firmado con el JWT secret del proyecto que lleve el claim
--    `tenant_id`. La app lo hace automáticamente cuando `SUPABASE_JWT_SECRET`
--    está configurada (Supabase → Settings → API → JWT Secret).
--
--    NO apliques esta migración si el navegador sigue usando la anon key cruda
--    (sin token): romperías todas las lecturas del cliente. Pasos correctos:
--      1) Configurar SUPABASE_JWT_SECRET en el entorno y desplegar.
--      2) Verificar que tras login las consultas del navegador funcionan.
--      3) Recién ahí, ejecutar esta migración.
--
-- El service role (rutas del servidor) OMITE RLS, así que esas rutas siguen
-- funcionando con su acotado por tenant a nivel de app.
-- ============================================================================

-- Lee el tenant_id del JWT que PostgREST expone en request.jwt.claims.
CREATE OR REPLACE FUNCTION jwt_tenant_id() RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json ->> 'tenant_id',
    ''
  )::integer;
$$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['products','orders','inventory','settings','expenses'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    -- Quitamos la política permisiva y ponemos la estricta por tenant.
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for anon" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I FOR ALL
      USING (tenant_id = jwt_tenant_id())
      WITH CHECK (tenant_id = jwt_tenant_id())$p$, tbl);
  END LOOP;
END $$;

-- Para REVERTIR (volver al guard de JS + anon key), reactivar lo permisivo:
--   DO $$ DECLARE tbl text; BEGIN
--     FOREACH tbl IN ARRAY ARRAY['products','orders','inventory','settings','expenses'] LOOP
--       EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
--       EXECUTE format('CREATE POLICY "Allow all for anon" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
--     END LOOP;
--   END $$;
