# 🛒 koptup Comercio Electrónico

**Plataforma multi-negocio (SaaS) para la gestión integral de comercio**: pedidos, inventario, despachos, catálogo, finanzas y un asistente de IA que opera el negocio por lenguaje natural y voz. Una sola instalación atiende a varios negocios (tenants) aislados entre sí.

> **koptup** es la plataforma; cada negocio que la usa es un **tenant** con su propia marca, catálogo, categorías y especialización de IA. Ejemplos de tenants en código: **Tu Tienda Meraki** (pantuflas, maxisacos, bolsos y pocillos) y **PrimeraMayo** (cascos, repuestos y accesorios de moto).

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20RLS-3ECF8E?logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS%204-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-gpt--4o--mini-412991?logo=openai)](https://platform.openai.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Suscripciones-635BFF?logo=stripe)](https://stripe.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000?logo=vercel)](https://vercel.com/)

---

## Tabla de contenidos

- [¿Qué es koptup?](#qué-es-koptup)
- [Arquitectura multi-tenant](#arquitectura-multi-tenant)
- [Roles y permisos](#roles-y-permisos)
- [Funcionalidades](#funcionalidades)
  - [Asistente de IA (núcleo)](#asistente-de-ia-núcleo)
  - [Pedidos](#pedidos)
  - [Inventario](#inventario)
  - [Catálogo de productos](#catálogo-de-productos)
  - [Despacho e impresión de guías](#despacho-e-impresión-de-guías)
  - [Dashboard y finanzas](#dashboard-y-finanzas)
  - [Agentes de IA y automatizaciones](#agentes-de-ia-y-automatizaciones)
  - [Administración del negocio](#administración-del-negocio)
  - [Plataforma (superadministrador)](#plataforma-superadministrador)
  - [Facturación y planes](#facturación-y-planes)
  - [Importar / Exportar](#importar--exportar)
- [Seguridad](#seguridad)
- [Stack tecnológico](#stack-tecnológico)
- [Puesta en marcha](#puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [Migraciones de base de datos](#migraciones-de-base-de-datos)
- [Pruebas automatizadas](#pruebas-automatizadas)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Scripts útiles](#scripts-útiles)
- [Deploy](#deploy)
- [Documentación adicional](#documentación-adicional)

---

## ¿Qué es koptup?

koptup Comercio Electrónico es una aplicación web (PWA, mobile-first) pensada para pequeños y medianos negocios de Colombia que venden y despachan productos. Resuelve el ciclo completo de la operación:

**Capturar el pedido → validar stock → confirmar → imprimir guía → despachar → cobrar → medir.**

Lo distintivo es que el **núcleo es la IA**: el comerciante puede pegar un texto de WhatsApp, dictar por voz o conversar con el asistente para crear pedidos, mover inventario y consultar el negocio, sin llenar formularios. La plataforma valida todo contra el catálogo e inventario reales y **pregunta** cuando algo es ambiguo, en lugar de adivinar.

Al ser multi-tenant, la misma instalación sirve a varios negocios con marcas, categorías, módulos y prompts de IA distintos, completamente aislados a nivel de base de datos.

---

## Arquitectura multi-tenant

- Cada fila de datos lleva un `tenant_id`. El aislamiento es real: políticas **RLS** de PostgreSQL filtran por `tenant_id = jwt_tenant_id()` (migración `003_strict_rls.sql`), reforzadas por el scoping del servidor (`getRequestScopedClient` / `withTenant`).
- La **marca por tenant** (nombre, logo, colores, tagline, categorías, módulos visibles, etiquetas de navegación y especialización de la IA) vive en [`src/lib/tenants.config.ts`](src/lib/tenants.config.ts) como base estática, y se puede sobrescribir por negocio desde la BD (columna `tenants.config`, jsonb).
- Un negocio nuevo creado en runtime arranca con un **base genérico neutro** (no hereda categorías ni IA de ningún otro tenant) y el superadministrador lo personaliza.
- El frontend pinta la marca sin parpadeo porque la config estática del slug está disponible de forma síncrona.

Detalle completo en [`docs/ARCHITECTURE_MULTITENANT.md`](docs/ARCHITECTURE_MULTITENANT.md).

---

## Roles y permisos

Cuatro roles jerárquicos ([`src/lib/permissions.ts`](src/lib/permissions.ts)):

| Rol | Alcance |
|---|---|
| **superadmin** | La **plataforma** completa: gestiona todos los negocios, usuarios de cualquier tenant, métricas globales y facturación. No opera el día a día de un negocio. |
| **admin** | **Solo administra su negocio**: usuarios del equipo, auditoría y la cuenta. No entra a las pantallas de operación (pedidos, inventario, etc.). |
| **member** | **Opera el negocio**: pedidos, inventario, productos, despacho y asistente de IA. |
| **viewer** | El negocio en **modo lectura**. |

La navegación y las rutas se restringen por rol: los roles administrativos no ven módulos de operación, y cada quien aterriza en su pantalla de inicio (superadmin → Plataforma, admin → Administración, member/viewer → Dashboard).

---

## Funcionalidades

### Asistente de IA (núcleo)

Chat conversacional (texto y **voz**, Web Speech API en `es-CO`) que opera todo el negocio en lenguaje natural: crear/editar pedidos, consultar y mover inventario, registrar gastos, responder sobre el estado del negocio.

- **Modelo propone-y-confirma**: el servidor (`/api/ai/assistant`) **solo propone** acciones tipadas `{action, data, needs_confirmation}`; **nunca escribe** por su cuenta. La escritura la ejecuta el cliente tras la confirmación humana, vía Supabase con RLS por tenant. La confirmación + RLS + constraints de BD son la barrera real ante prompt-injection.
- **Coincidencia estricta**: las acciones por nombre difuso piden desambiguar si hay 0 o varias coincidencias (nunca tocan la fila equivocada).
- **Acciones destructivas** exigen escribir literalmente **"Acepto"** antes de ejecutarse.
- Especialización por tenant: los ejemplos, categorías y el prompt salen de la config del negocio (no hay nada hardcodeado de un tenant en otro).

### Pedidos

Tres formas de crear un pedido, todas con la misma integridad:

1. **Pedido por IA (texto o voz)** — pega el texto de WhatsApp o dícta­lo. El endpoint [`/api/ai/parse-order`](src/app/api/ai/parse-order/route.ts):
   - Extrae cliente, teléfono, dirección, complemento, valor y las **líneas de producto** (modelo/color/talla/cantidad), ignorando el ruido (saludos, emojis, "porfa", teléfonos alternativos).
   - **Resuelve ambigüedades preguntando**: si faltan datos de despacho, o el color/talla de una unidad, o pides una variante/combinación que no existe en stock, el asistente hace **preguntas concretas** y completa el pedido en la misma conversación, manteniendo el contexto entre turnos.
   - **Valida contra el inventario real** (colores, tallas y combinaciones en stock) antes de confirmar; el servidor manda sobre el modelo (lógica pura y testeable en [`src/lib/orders/parseClarify.ts`](src/lib/orders/parseClarify.ts)).
   - **Degradación elegante**: si no hay API key de OpenAI, invita al formulario manual; los pedidos largos o respuestas truncadas no rompen el chat.
2. **Formulario manual** — campos estructurados (cliente, dirección, producto con talla/color/cantidad, valor, forma de pago) con validación y descuento de inventario al guardar.
3. **Inventario por IA** — captura masiva de inventario desde texto ([`/api/ai/parse-inventory`](src/app/api/ai/parse-inventory/route.ts)).

Vistas: **calendario mensual** (recaudo y cantidad por día) y **vista diaria** con KPIs en tiempo real. Generación automática de `order_code` único por negocio.

### Inventario

- Control por **canasta/ubicación física** y por variante (modelo, color, talla, cantidad).
- Estados **Bueno / Malo**, filtros por modelo/color/talla/categoría y búsqueda instantánea.
- **Sincronización automática**: al confirmar un pedido se descuenta el stock una sola vez ([`src/lib/inventorySync.ts`](src/lib/inventorySync.ts)).

### Catálogo de productos

- Productos con código, nombre, costo y categoría (las categorías son propias de cada tenant).
- Búsqueda automática del costo al crear pedidos (para calcular utilidad).
- **Análisis de producto por IA** desde foto/descripción ([`/api/ai/analyze-product`](src/app/api/ai/analyze-product/route.ts)).
- El **tope de productos** lo define el plan y se **enforza en la base de datos** (trigger): al llegar al límite no se pueden agregar más hasta subir de plan; los existentes nunca se borran.

### Despacho e impresión de guías

- Selección de fecha y de múltiples pedidos confirmados para despachar.
- **Guías imprimibles** con el nombre real del negocio (la marca del tenant, no la de la plataforma).
- **Sugerencia de ruta** agrupando pedidos por barrio/zona.

### Dashboard y finanzas

- KPIs: pedidos, recaudo, costos y utilidad.
- Desglose por **forma de pago** (efectivo, transferencia, pendiente de mensajero) y por vendedor.
- Gráfica de recaudo diario (Recharts).
- Registro de **gastos** por categoría del negocio.

### Agentes de IA y automatizaciones

**Cinco agentes** analizan los datos del tenant y producen hallazgos priorizados ([`src/lib/agents/`](src/lib/agents/)):

| Agente | Qué revisa |
|---|---|
| **auditor** | Consistencia e integridad de los datos |
| **qa** | Calidad de los registros (estados inválidos, campos fuera de rango) |
| **inventario** | Quiebres de stock y reposición |
| **financiero** | Pérdidas, costos/precios sospechosos |
| **comercial** | Productos sin rotación, oportunidades de venta |

El **motor de automatizaciones** ([`src/lib/automations/engine.ts`](src/lib/automations/engine.ts)) convierte esos hallazgos en **alertas accionables** (ej. "Generar orden de compra", "Lanzar promoción o descontinuar"). La lógica es pura y determinista (testeable). Los agentes se pueden disparar a mano desde la pantalla Plataforma o automáticamente vía **Vercel Cron** (`/api/cron/run-agents`).

### Administración del negocio

El rol **admin** gestiona su equipo: crear usuarios, cambiar roles, activar/desactivar y revisar la **auditoría** de acciones ([`/api/admin/*`](src/app/api/admin/)).

### Plataforma (superadministrador)

El **superadmin** administra **todos** los negocios desde la pantalla **Plataforma**: alta de tenants, gestión de usuarios de cualquier negocio, **métricas globales**, estado de facturación y disparo manual de agentes ([`/api/superadmin/*`](src/app/api/superadmin/)).

### Facturación y planes

Suscripción mensual por negocio vía **Stripe** ([`src/lib/plans.ts`](src/lib/plans.ts), [`src/lib/billing.ts`](src/lib/billing.ts)):

| Plan | Tope de productos | Precio mensual (COP) |
|---|---|---|
| **Free** | 50 | $0 |
| **Pro** | 500 | $49.900 |
| **Enterprise** | Ilimitado | $149.900 |

- Checkout y renovación automática (`/api/billing/checkout`, `/api/billing/webhook`).
- **Webhook idempotente**: si Stripe reenvía un evento de pago, no se cobra ni se renueva dos veces (índice único `stripe_event_id`, migración `015`).
- Si no se configura Stripe, los pagos quedan desactivados y la app funciona igual. Guía: [`docs/STRIPE_SETUP.md`](docs/STRIPE_SETUP.md).

### Importar / Exportar

- **Importar** catálogo/datos desde Excel/CSV (`/api/import`).
- **Exportar** la información del negocio con su marca real (`/api/export`).

---

## Seguridad

- **Autenticación** con JWT (jose, HS256) en cookie httpOnly (30 días) y contraseñas con bcrypt.
- **Aislamiento por tenant** con RLS de PostgreSQL (no solo guard de JS).
- **Constraints de negocio en la BD**: montos no negativos, estados válidos, cantidades positivas, `order_code` único por negocio (migraciones `009`/`010`/`013`).
- **Manejo centralizado** de autenticación/autorización en cada route handler; rate limiting en endpoints sensibles.
- Acciones destructivas con confirmación explícita ("Acepto").

Procedimientos operativos en [`docs/RUNBOOK_HARDENING.md`](docs/RUNBOOK_HARDENING.md).

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 |
| Estilos | Tailwind CSS 4 (mobile-first, PWA) |
| Base de datos | Supabase (PostgreSQL + RLS) |
| IA | OpenAI `gpt-4o-mini` (parseo y asistente) |
| Voz | Web Speech API (nativa del navegador) |
| Gráficas | Recharts |
| Auth | JWT (jose) + bcrypt |
| Pagos | Stripe (suscripciones) |
| Tests | Vitest (unit) + Playwright (E2E) |
| Deploy | Vercel (+ Vercel Cron) |

> ⚠️ Esta versión de Next.js trae cambios importantes respecto a versiones previas. Antes de programar, consulta la guía pertinente en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

---

## Puesta en marcha

### Prerrequisitos

- Node.js **20+**
- Cuenta en [Supabase](https://supabase.com)
- API Key de [OpenAI](https://platform.openai.com) (opcional; también se configura por negocio en Configuración)

### 1. Clonar e instalar

```bash
git clone https://github.com/ronalc90/koptup-comercio-electronico.git
cd koptup-comercio-electronico/meraki-app
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` (ver la sección siguiente y los comentarios del propio `.env.example`).

### 3. Crear el esquema en Supabase

En el **SQL Editor** de Supabase ejecuta `supabase-schema.sql` y luego, en orden, las migraciones de `migrations/` (ver más abajo).

### 4. Iniciar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

---

## Variables de entorno

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Anon key de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **Prod** | Operaciones del servidor (admin, login, cron…). Sin ella, degrada a anon |
| `AUTH_SECRET` | **Prod** | Firma los JWT de sesión (HS256, ≥32 chars). La app no arranca sin ella en prod |
| `OPENAI_API_KEY` | No | IA. También configurable por negocio (tiene prioridad sobre esta) |
| `SUPABASE_JWT_SECRET` | No | Activa el aislamiento por RLS (migración 003) |
| `CRON_SECRET` | No | Autoriza el cron de agentes IA (Vercel Cron) |
| `SUPABASE_ACCESS_TOKEN` | No | Solo tooling: aplicar migraciones con `npm run db:exec` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | No | Pagos de licencias. Sin ellas, los pagos quedan desactivados |

Genera `AUTH_SECRET` con `openssl rand -hex 32`. Empieza Stripe siempre con llaves de **prueba** (`sk_test_`/`pk_test_`).

---

## Migraciones de base de datos

Aplica en orden, sobre `supabase-schema.sql`, los archivos de [`migrations/`](migrations/):

| # | Migración | Qué trae |
|---|---|---|
| 002 | `multi_tenant` | Tablas de tenants/usuarios y `tenant_id` en todas las tablas |
| 003 | `strict_rls` | RLS estricto por `tenant_id` |
| 004 | `billing` | Licencias y cobros |
| 005 | `fix_product_limit_race` | Tope de productos sin condición de carrera |
| 006 | `audit_log` | Auditoría de acciones |
| 007 | `alerts` | Alertas de automatizaciones |
| 008 | `fix_trigger_security_definer` | Endurecimiento de triggers |
| 009–010 | `business_constraints` | Constraints de negocio (montos, estados, cantidades) |
| 011 | `product_image_url` | Imagen de producto |
| 012 | `tenant_config` | Override de config por tenant (jsonb) |
| 013 | `assistant_hardening` | `order_code` único, cantidades, endurecimiento |
| 014 | `fix_expenses_rls` | Cierra fuga de RLS en gastos |
| 015 | `charges_idempotency` | Idempotencia del webhook de Stripe |

Puedes aplicarlas con el tooling: `npm run db:exec` (requiere `SUPABASE_ACCESS_TOKEN`).

---

## Pruebas automatizadas

### Unit (Vitest)

Cubren la lógica pura de `src/lib/` (formato de moneda, parseo de montos, códigos de pedido, intenciones del asistente, **aclaración conversacional de pedidos**, validación de variantes, planes, permisos, billing, agentes, automatizaciones, etc.). Los archivos viven junto al código con sufijo `.test.ts`.

```bash
npm test            # suite completa
npm run test:watch  # modo watch
```

### E2E (Playwright)

Flujos completos en Chromium real: login, navegación, ayuda contextual, toggle de vistas en Pedidos y el **flujo conversacional de parseo de pedidos** (con la ruta de IA mockeada).

```bash
npm run test:e2e:install   # solo la primera vez
npm run test:e2e
```

Los tests autenticados se saltean si no hay credenciales:

```bash
MERAKI_E2E_USER=Paola MERAKI_E2E_PASSWORD='tu-password' npm run test:e2e
# Apuntar a un preview de Vercel:
MERAKI_E2E_BASE_URL=https://<deploy>.vercel.app npm run test:e2e
```

---

## Estructura del proyecto

```
meraki-app/
├── src/
│   ├── app/
│   │   ├── login/                 # Login (marca de plataforma)
│   │   ├── (protected)/           # Rutas con sesión
│   │   │   ├── dashboard/         # KPIs y finanzas del negocio
│   │   │   ├── orders/            # Pedidos (mensual, diario, nuevo)
│   │   │   ├── assistant/         # Asistente de IA (chat + voz)
│   │   │   ├── inventory/         # Inventario por canasta/variante
│   │   │   ├── products/          # Catálogo de productos
│   │   │   ├── dispatch/          # Despacho e impresión de guías
│   │   │   ├── agents/            # Agentes de IA y alertas
│   │   │   ├── billing/           # Mi licencia / pago
│   │   │   ├── admin/             # Administración del negocio
│   │   │   ├── superadmin/        # Plataforma (todos los negocios)
│   │   │   └── settings/          # Configuración del negocio
│   │   └── api/                   # Route handlers (ai, auth, admin,
│   │                              #   superadmin, billing, agents,
│   │                              #   automations, cron, import/export…)
│   ├── components/                # UI (layout, orders, shared…)
│   └── lib/
│       ├── tenants.config.ts      # Marca/config por tenant
│       ├── permissions.ts         # Roles y acceso a módulos/rutas
│       ├── plans.ts / billing.ts  # Planes y facturación
│       ├── assistant/             # Lógica pura del asistente
│       ├── orders/parseClarify.ts # Aclaración conversacional de pedidos
│       ├── agents/                # 5 agentes de IA
│       ├── automations/           # Motor de alertas
│       ├── auth.ts / supabase.ts  # Auth y acceso a datos
│       └── …                      # tenant, audit, rateLimit, utils…
├── migrations/                    # SQL incremental (002…015)
├── docs/                          # Arquitectura, roadmap, runbook, Stripe
├── scripts/                       # Tooling (db:exec, validate, import)
└── tests/e2e/                     # Playwright
```

---

## Scripts útiles

```bash
npm run dev          # desarrollo
npm run build        # build de producción
npm run start        # servir el build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # unit (Vitest)
npm run test:e2e     # E2E (Playwright)
npm run db:exec      # aplicar SQL/migraciones (Management API)
npm run validate     # validación del proyecto
```

---

## Deploy

1. Conecta el repositorio en [vercel.com](https://vercel.com).
2. Define las variables de entorno en **Settings → Environment Variables**.
3. **Auto-deploy** en cada push a `main`.
4. (Opcional) Configura **Vercel Cron** para `/api/cron/run-agents` con `CRON_SECRET`.

---

## Documentación adicional

- [`docs/ARCHITECTURE_MULTITENANT.md`](docs/ARCHITECTURE_MULTITENANT.md) — arquitectura multi-tenant y aislamiento.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — hoja de ruta del producto.
- [`docs/RUNBOOK_HARDENING.md`](docs/RUNBOOK_HARDENING.md) — operación y seguridad.
- [`docs/STRIPE_SETUP.md`](docs/STRIPE_SETUP.md) — configurar pagos.
- `AGENTS.md` — nota importante sobre esta versión de Next.js.

---

## Licencia

Proyecto privado. Todos los derechos reservados.

Desarrollado por **Ronald** 🇨🇴
