-- ============================================================================
-- 014_fix_expenses_rls.sql — Cierra una fuga de RLS en `expenses`
-- ============================================================================
-- `expenses` tenía DOS políticas RLS:
--   1) tenant_isolation  → USING (tenant_id = jwt_tenant_id())   ✅ correcta
--   2) allow_all_expenses → USING (true) para el rol `public`     ❌ fuga
-- Las políticas permisivas se combinan con OR, así que la #2 ANULABA el
-- aislamiento: cualquiera con la anon key (pública, va en el bundle) podía leer/
-- escribir los gastos de CUALQUIER negocio. Las otras 4 tablas de negocio
-- (products/orders/inventory/settings) solo tienen tenant_isolation, así que
-- esto deja a expenses igual que ellas.
--
-- Seguro: la app accede a expenses con el JWT de tenant (SUPABASE_JWT_SECRET,
-- activo en Vercel) en el navegador, o con el service role en el servidor —
-- ninguno depende de allow_all_expenses. Idempotente.
-- ============================================================================

DROP POLICY IF EXISTS allow_all_expenses ON expenses;
