# Roadmap — Plataforma multi-tenant de ecommerce

Estado a v1.014. Honesto sobre qué está **listo y probado**, qué es **base
funcional** y qué está **diseñado pero pendiente**.

## Fase 1 — Multi-tenant, roles, seguridad ✅ LISTO

- [x] Tabla `tenants` + seed (Meraki, PrimeraMayo).
- [x] Tabla `users` con `tenant_id`, bcrypt y roles (admin/member/viewer).
- [x] `tenant_id` en products/orders/inventory/settings/expenses + backfill.
- [x] Guard de aislamiento automático (cliente y servidor), retrocompatible.
- [x] Rutas server-side acotadas por tenant (settings, export, import, wipe, IA).
- [x] Marca dinámica por tenant (logo, nombre, tema).
- [x] Gate de validación (`npm run validate`).
- [x] 84 unit tests (incluye el guard y los agentes).

**Hardening de Fase 1 ✅ ACTIVO en producción (2026-06-17)**: aislamiento
forzado por la BD. `SUPABASE_JWT_SECRET` configurada en Vercel; la app firma un
JWT por usuario con `tenant_id` y la migración `003_strict_rls.sql` está aplicada
(políticas RLS `tenant_id = jwt_tenant_id()` en todas las tablas de negocio).
Verificado: con sesión se ven los datos del propio tenant; con la anon key cruda,
la base devuelve vacío. La race del trigger de plan se cerró con la migración 005.

## Fase 2 — Agentes IA + dashboards inteligentes ✅ BASE FUNCIONAL

5 agentes como **funciones puras** + endpoints acotados por tenant + pantalla
`/agents`. Son deterministas (no dependen de un LLM), por eso están testeados:

- [x] **Auditor** — duplicados, inventario negativo, pedidos sin margen, entregados sin recaudo.
- [x] **QA** — estados inválidos, fechas futuras, códigos duplicados, integridad.
- [x] **Inventario** — quiebres de stock, recomendación de compra, productos lentos.
- [x] **Financiero** — utilidad, margen, pérdidas por pedido, recaudo pendiente.
- [x] **Comercial** — productos estrella/muertos, recomendación de bundle y promociones.

**Siguiente paso**: enriquecer con LLM (usar `tenants.config.ts → ai.systemPrompt`
por negocio: pantuflas vs. cascos/repuestos con compatibilidades de moto) y
ejecutar los agentes en background con alertas.

## Fase 3 — Automatizaciones ✅ BASE FUNCIONAL

Motor `src/lib/automations/engine.ts` (función pura, testeada) + endpoint
`/api/automations/run` + panel de alertas en `/agents`. Convierte hallazgos +
datos en alertas accionables:
- [x] Reposición automática (consolida quiebres + stock bajo → orden de compra).
- [x] Alertas de stock, ventas (productos muertos → promoción), finanzas (pérdidas).
- [x] Alertas de devoluciones/cambios y de garantías/defectuosos (status 'Malo').

**Siguiente paso**: ejecutar el motor en background (cron) y notificar (email/push).

## Fase 4 — Marketplace de módulos ✅ BASE FUNCIONAL

Registro de módulos `src/lib/modules.ts` + navegación construida por tenant
(`navModules` + `moduleLabels` en `TenantConfig`). Cada negocio habilita sus
módulos con pantalla y les pone su propio nombre (PrimeraMayo: "Catálogo",
"Ventas"). Los módulos core (dashboard/config) van siempre.

**Siguiente paso**: pantallas propias de los módulos conceptuales de motos
(compras, garantías, proveedores) y un instalador/activador por tenant en la UI.

## Fase 5 — SaaS comercial completo 🟢 AVANZADO

- [x] Administración por tenant: pantalla `/admin` + API `/api/admin/*` (solo
      rol admin) para crear usuarios del propio negocio, cambiar rol, activar/
      desactivar y ver el plan. Todo acotado al propio tenant.
- [x] Campo `plan` (free/pro/enterprise) en `tenants`.
- [x] **Rol superadmin + onboarding**: pantalla `/superadmin` + API
      `/api/superadmin/tenants` para crear negocios nuevos y su primer admin,
      listarlos y activar/desactivarlos. Cada negocio creado muestra su propia
      marca (nombre/logo desde BD, vía claims de sesión).
- [x] **Consola de operador**: `/api/superadmin/metrics` + UI con uso por negocio
      (pedidos/productos/usuarios) y cambio de plan (Free/Pro/Enterprise).
- [x] **Planes con efecto**: `src/lib/plans.ts`; el tope de usuarios se enforza
      al crear (pedidos/productos como uso informativo, para no frenar la operación).
- [ ] **Cobro automático (billing)**: integración con pasarela de pagos —
      pendiente, requiere credenciales (ej. Stripe). Hoy el plan se asigna a mano
      desde la consola del superadmin.
- [ ] Login por subdominio/slug (multi-email entre tenants) — opcional, futuro.

---

### Por qué este orden

Fase 1 es el cimiento: sin aislamiento correcto, todo lo demás filtra datos entre
negocios. Se priorizó hacerla **bien y sin romper producción** (retrocompatible,
testeada, con gate) antes de construir encima.
