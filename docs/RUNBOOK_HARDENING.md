# Runbook de endurecimiento (P0 de seguridad)

> **ESTADO (2026-06-17): los 3 P0 están CERRADOS.** P0-1 ✅ (AUTH_SECRET fuerte
> en Vercel) · P0-2 ✅ (RLS 003 aplicada y verificada: anon cerrado, autenticado
> ve su tenant) · P0-3 ✅ (migración 005). Pendiente opcional: añadir
> `AUTH_STRICT_SECRET=1` en Vercel para que el deploy falle si el secreto vuelve
> a quedar débil. Lo que sigue se conserva como referencia/rollback.

## P0-1 · AUTH_SECRET fuerte en Vercel  ✅ HECHO (5 min)

El secreto firma las sesiones (HS256). Si es débil o falta, se pueden falsificar
sesiones de admin. El código ya valida ≥32 chars y avisa en logs, pero **no se
auto-cae** para no tumbar la app; hay que poner un buen valor.

1. Generar un secreto:
   ```bash
   openssl rand -hex 32
   ```
2. Vercel → proyecto **meraki-app** → Settings → Environment Variables →
   añadir/editar `AUTH_SECRET` (scope **Production**) con ese valor.
3. (Opcional, recomendado tras el paso 2) añadir `AUTH_STRICT_SECRET=1` para que,
   si algún día el secreto vuelve a quedar mal, el deploy **falle rápido** en
   lugar de arrancar inseguro.
4. Redeploy. Verificar que el login sigue funcionando.

> Nota: cambiar `AUTH_SECRET` **invalida las sesiones abiertas** — todos deberán
> volver a iniciar sesión una vez. Hacerlo en un momento de baja actividad.

## P0-2 · RLS estricta por base de datos (migración 003)  ✅ HECHO Y VERIFICADO

Hoy el aislamiento entre negocios lo aplica el guard de JS (sólido, pero capa
única). 003 fuerza el aislamiento en la BD. **Orden obligatorio** (si se aplica
003 sin el paso 1, el cliente del navegador deja de leer datos y la app "se
queda en blanco"):

1. Conseguir el **JWT secret** del proyecto: Supabase → Settings → API → *JWT
   Settings* → `JWT Secret`.
2. Vercel → variables de entorno → `SUPABASE_JWT_SECRET` = ese valor (Production).
   Redeploy. La app empezará a firmar un token de Supabase con `tenant_id`.
3. **Verificar** (logueado): que el dashboard, pedidos e inventario cargan
   normal. Si algo no carga, NO continuar (revisar el token).
4. Recién entonces aplicar la RLS:
   ```bash
   cd meraki-app && npm run db:exec migrations/003_strict_rls.sql
   ```
5. Verificar aislamiento: con el token de un tenant, un `SELECT` a otro tenant
   debe devolver vacío.

Rollback: el header de `003_strict_rls.sql` trae el bloque para reactivar las
políticas permisivas si algo sale mal.

## P0-3 · Race del trigger de límite de plan  ✅ APLICADO (migración 005)

`enforce_product_limit` ahora toma un lock por tenant (`FOR UPDATE`) antes de
contar, así dos altas simultáneas no pueden superar el tope. Aplicada con
`npm run db:exec migrations/005_fix_product_limit_race.sql`.

---

## Tabla de permisos (rol × superficie)

| Acción | viewer | member | admin | superadmin |
|---|:--:|:--:|:--:|:--:|
| Ver datos del propio negocio | ✅ | ✅ | ✅ | ✅ |
| Crear pedidos/inventario | ✅* | ✅ | ✅ | ✅ |
| Gestionar usuarios del negocio (/admin) | — | — | ✅ | ✅ |
| Ver su facturación (/billing) | — | — | ✅ | ✅ |
| Cambiar el plan de un negocio | — | — | — | ✅ |
| Registrar pagos / extender licencia | — | — | — | ✅ |
| Crear negocios / ver todos (/superadmin) | — | — | — | ✅ |

\* El acceso real por rol en las pantallas operativas no está aún gateado fino
(ver backlog T-roles); hoy todo usuario autenticado del tenant opera. El control
crítico (cross-tenant, planes, pagos) sí está enforced server-side.

## Datos de aislamiento

Tablas acotadas por `tenant_id` (guard automático): `products`, `orders`,
`inventory`, `settings`, `expenses`. Tablas de plataforma cerradas a la anon key
(solo service-role): `users`, `tenants`, `charges`.
