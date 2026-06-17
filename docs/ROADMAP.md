# Roadmap — Plataforma multi-tenant de ecommerce

Estado a v1.013. Honesto sobre qué está **listo y probado**, qué es **base
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

**Pendiente de Fase 1** (no bloqueante): pantalla de administración de tenants y
usuarios (hoy se gestionan por SQL/seed); RLS estricta (ver "ruta de hardening"
en ARCHITECTURE_MULTITENANT.md).

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

## Fase 3 — Automatizaciones 🟡 DISEÑADO

Reposición automática, alertas de stock/ventas/devoluciones/garantías.

- Diseño: cron (Supabase scheduled functions o un runner) que ejecuta los
  agentes por tenant y dispara acciones (crear orden de compra sugerida, notificar).
- Base ya disponible: los agentes producen `Finding[]` con severidad → un
  despachador puede convertir `critical/warning` en alertas/acciones.

## Fase 4 — Marketplace de módulos 🟡 DISEÑADO

Cada tenant activa/desactiva módulos. Ya existe `TenantConfig.modules`; falta el
registro de módulos instalables y el gating de rutas/navegación por módulo.

## Fase 5 — SaaS comercial completo 🟡 DISEÑADO

Onboarding self-service de tenants, planes/billing, límites por plan, panel de
superadmin. Requiere: subdominio/slug por tenant en el login, integración de
pagos y métricas de uso por tenant.

---

### Por qué este orden

Fase 1 es el cimiento: sin aislamiento correcto, todo lo demás filtra datos entre
negocios. Se priorizó hacerla **bien y sin romper producción** (retrocompatible,
testeada, con gate) antes de construir encima.
