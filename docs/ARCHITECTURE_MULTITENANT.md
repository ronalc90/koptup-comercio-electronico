# Arquitectura multi-tenant (Fase 1)

Esta nota explica **cómo** la plataforma koptup Comercio Electrónico pasó de ser
una app de un solo negocio (Meraki) a una capaz de atender varios (multi-tenant),
**sin romper** la app en producción.

## Idea central

Cada negocio es un **tenant** (fila en la tabla `tenants`). Todas las tablas de
negocio llevan una columna `tenant_id`. El tenant `1 = meraki` es el destino del
backfill histórico, por eso es el `DEFAULT` en todos lados.

```
tenants (id, name, slug, logo, industry, active)
users   (id, tenant_id, email, username, password_hash, role, active)

products | orders | inventory | settings | expenses   →  + tenant_id
```

## Aislamiento de datos: el guard

La app consulta Supabase **desde el navegador** con la anon key (82 call-sites
en 8 pantallas). Reescribir cada uno sería arriesgado, así que el aislamiento se
aplica en un **único punto**: un *guard* que envuelve el cliente de Supabase y
acota automáticamente toda consulta a una tabla de negocio.

- `select / update / delete` → se añade `.eq('tenant_id', <tenant>)`.
- `insert / upsert` → se inyecta `tenant_id` en el payload.
- Tablas que no son de negocio (`users`, `tenants`) pasan sin tocar.

Código: [`src/lib/supabase.ts`](../src/lib/supabase.ts) (`withTenant`, `guardBuilder`).

### Cómo se resuelve el tenant

- **Navegador**: el `TenantProvider` ([`src/lib/TenantContext.tsx`](../src/lib/TenantContext.tsx))
  arma el guard en el primer render con el tenant del usuario logueado
  (`setActiveTenant`). Una sesión de navegador = un tenant, así que el singleton
  es seguro.
- **Servidor**: NUNCA se usa ese singleton (sería un leak entre requests). Cada
  ruta API obtiene un cliente ya acotado por request con
  `getRequestScopedClient()` ([`src/lib/tenantServer.ts`](../src/lib/tenantServer.ts)),
  resolviendo el tenant desde el JWT de sesión.

### Retrocompatibilidad (clave)

El guard **solo se arma si la migración 002 ya corrió**. Se detecta en runtime
con `isTenantSupported()` (comprueba si existe `orders.tenant_id`), siguiendo el
mismo patrón ya usado en el repo (`isOwnerSupported`, etc.). Mientras la columna
no exista, el guard es un *passthrough* total y **la app se comporta exactamente
como antes**. Cero regresión.

## Autenticación

- JWT (jose) ahora lleva `tenantId`, `tenantSlug` y `role`.
- `login()` valida contra la tabla `users` (bcrypt). El respaldo hardcodeado
  (paola/ronald/lizeth) **solo** opera en estado pre-migración (sin tabla
  `users`); una vez aplicada la migración, la tabla `users` con bcrypt es la
  única fuente y no hay credenciales en texto plano que puedan entrar. Los tres
  usuarios siguen entrando porque quedan sembrados con su hash. Ver
  [`src/lib/auth.ts`](../src/lib/auth.ts).
- Roles: `admin` ⊃ `member` ⊃ `viewer` (`roleAtLeast`).
- La tabla `users` (con `password_hash`) y `tenants` están con RLS **solo service
  role**: la anon key del navegador no puede leerlas. El login usa el service
  client (omite RLS).

## Marca por tenant

[`src/lib/tenants.config.ts`](../src/lib/tenants.config.ts) define logo, nombre,
tema (colores), categorías, módulos y la especialización de IA por negocio. El
`TenantProvider` aplica el tema como variables CSS (`--brand-primary`, …).

## Cómo aplicar la migración

> El service role key **no** puede correr DDL vía API (limitación conocida del
> proyecto). Por eso la migración se aplica a mano una vez:

1. Abrir Supabase → **SQL Editor**.
2. Pegar y ejecutar [`migrations/002_multi_tenant.sql`](../migrations/002_multi_tenant.sql).
3. Listo: el guard se arma solo en el siguiente login. Los datos previos quedan
   en el tenant `meraki`.

La migración es **idempotente** (se puede correr varias veces) y **no endurece
RLS** de forma que rompa el cliente anon actual.

## Modelo de amenaza (honesto)

Hoy el aislamiento se aplica en la **capa de aplicación** (el guard) + `tenant_id`
en la base. Esto evita por completo que un usuario vea datos de otro negocio a
través de la UI o de las rutas del servidor.

Lo que **todavía no** está cerrado: un usuario que use directamente la anon key
contra PostgREST (saltándose la app) podría leer las **tablas de negocio**
(`products`, `orders`, `inventory`, `settings`, `expenses`) de otros tenants,
porque ahí las políticas RLS siguen en "allow anon" para no romper el cliente
actual (que consulta esas tablas desde el navegador). Nota: ese mismo usuario ya
podía leer **todo** antes de este cambio, así que esto es una mejora estricta, no
una regresión.

En cambio, `users` (password_hash) y `tenants` **sí** quedan cerradas a la anon
key (solo service role), así que la migración no expone credenciales.

El cierre completo de las tablas de negocio es la **ruta de hardening** (abajo):
mover esas lecturas al servidor y activar RLS estricta. Mientras tanto, el guard
de la app impide ver datos de otro tenant por la UI o por las rutas del servidor.

### Ruta de hardening (cuando se quiera aislamiento forzado por DB)

1. Mover las lecturas/escrituras críticas a rutas server-side (ya hecho para
   settings, export, import, wipe, IA y agentes).
2. En esas conexiones server-side llamar `SELECT set_tenant(:id)` y activar las
   políticas RLS estrictas comentadas al final de la migración 002
   (`tenant_id = current_tenant()`).
3. Alternativamente, firmar JWT de Supabase con un claim `tenant_id` y leerlo en
   las políticas con `auth.jwt()`.

## Validación pre-despliegue

`npm run validate` corre el gate completo (typecheck, lint, tests, migraciones,
seguridad, aislamiento). Falla → no se despliega. Ver
[`scripts/validate.mjs`](../scripts/validate.mjs).
