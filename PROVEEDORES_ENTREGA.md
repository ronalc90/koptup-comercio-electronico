# Entrega — Módulo de Proveedores (rama `feat/proveedores`)

Negocio objetivo: **Bodega Compralo Colombia** vende productos de muchos proveedores
y factura un solo recibo al cliente, pero necesita, sobre lo **ya vendido/despachado**:
consumo por proveedor, cuentas por pagar (cruzadas con corte + plazo, con alerta de
vencimiento) y rotación por proveedor. **El recibo del cliente no cambia**; el
desglose por proveedor es interno.

---

## 1. Qué existía vs. qué se creó

### Modelo existente (nombres reales, no se modificó su comportamiento)
- `orders`: **una fila = un pedido = un producto** (no hay tabla de line-items).
  Columnas usadas: `product_ref` (texto → `products.code`), `quantity` (INTEGER,
  migración 013), `value_to_collect`, **`product_cost`** (costo unitario ya
  CONGELADO al vender), `delivery_status`, `order_date`, `tenant_id`.
- Estados de venta activa: `ACTIVE_REVENUE_STATUSES = ['Confirmado','Enviado','Entregado','Pagado']`
  (`src/lib/assistant/constants.ts`). Excluye `Devolucion`/`Cancelado`.
- `products`: `code`, `name`, `cost`, `category`, `active`, `tenant_id`
  (único `(tenant_id, code)`). **No tenía** columna de proveedor.
- Multi-tenant: `tenant_id` + RLS `tenant_isolation USING/WITH CHECK (tenant_id = jwt_tenant_id())`
  (migración `003_strict_rls.sql`). Guard de app `withTenant` (inyecta/filtra por tenant).
- No existía NADA de proveedores (verificado por grep).

### Creado (todo aditivo)
| Área | Archivo(s) | Qué hace |
|---|---|---|
| Migración | `migrations/016_suppliers.sql` | Tabla `suppliers` + `supplier_id` en `products` y `orders` |
| Lógica pura | `src/lib/suppliers/calculations.ts` (+ `.test.ts`, 22 tests) | consumo, cuentas por pagar, rotación |
| API | `src/app/api/suppliers/route.ts` | CRUD (GET/POST/PATCH/DELETE soft) |
| API | `src/app/api/suppliers/reports/route.ts` | `?type=consumo\|payables\|rotacion` |
| UI | `src/app/(protected)/suppliers/page.tsx` | Pantalla mobile-first, 4 pestañas |
| Registro | `modules.ts`, `permissions.ts`, `tenant.ts`, `SidebarNav`, `MobileNav` | Módulo `proveedores` (opt-in) |
| Tipos | `src/lib/types.ts` | `Supplier`; `supplier_id` en `Product`/`Order` |
| Pedidos | `orders/new/page.tsx`, `api/ai/parse-order/route.ts`, `db.ts` | Congela `supplier_id` al vender (flag `isSupplierSupported`) |
| Seed demo | `scripts/seed-bodega-demo.sql` | Tenant nuevo + datos demo |
| E2E | `tests/e2e/suppliers.spec.ts` | Cierre y cuentas por pagar (IA/API mockeadas) |

### Tablas/columnas nuevas (nombres reales)
- **`suppliers`**: `id`, `tenant_id` (FK→tenants, RLS), `name`, `contact`, `phone`,
  `plazo_dias` (def 30), `dia_corte` (1..31, def 1), `active`, `notes`, `created_at`.
  Constraints: `chk_suppliers_plazo_nonneg`, `chk_suppliers_dia_corte`,
  `uq_suppliers_tenant_name` (`tenant_id, lower(name)`), `uq_suppliers_tenant_id`.
- **`products.supplier_id`** (nullable) — FK compuesta `(tenant_id, supplier_id)` → `suppliers(tenant_id, id)`.
- **`orders.supplier_id`** (nullable) — FK compuesta `(tenant_id, supplier_id)`; **proveedor congelado al vender**.
- Los registros existentes quedan con `supplier_id = NULL` ("sin asignar"). No se reasigna nada.

---

## 2. Migración: qué correr y cómo

Requisito: `SUPABASE_ACCESS_TOKEN` (token `sbp_` del Management API) y
`NEXT_PUBLIC_SUPABASE_URL` en `meraki-app/.env.local`.

```bash
cd meraki-app
# 1) Migración del módulo (aditiva e idempotente)
npm run db:exec migrations/016_suppliers.sql
# 2) Seed del tenant demo (idempotente; NO toca Meraki/PrimeraMayo)
npm run db:exec scripts/seed-bodega-demo.sql
```

> El módulo es **opt-in**: solo aparece en la navegación de los tenants cuyo
> `navModules` incluye `'proveedores'`. El seed ya deja al tenant demo configurado
> así; Meraki y PrimeraMayo no ven el módulo.

---

## 3. Credenciales temporales del tenant demo

Tenant: **Bodega Compralo Colombia** (`slug: bodega-compralo-colombia`).
Contraseña (ambos): **`Bodega2026*`** — **cámbiala tras verificar**.

| Rol | Usuario | Para qué |
|---|---|---|
| admin | `admin@bodega-compralo.co` | Administra el equipo (no opera el negocio) |
| member | `operador@bodega-compralo.co` | **Opera y VE los reportes** de proveedores |

> Nota: los roles administrativos (admin/superadmin) **no** acceden a los módulos
> de negocio. Para ver los reportes de proveedores, entra como **operador (member)**.

---

## 4. Verificar los 3 reportes (de punta a punta)

Entra como `operador@bodega-compralo.co` y abre **Proveedores** en la navegación.

1. **Cierre por proveedor** (pestaña *Cierre*): debe mostrar
   - Vendido **$5.000.000**, Consumo **$4.000.000**, Utilidad bruta **$1.000.000**.
   - Distribuidora Andina **$1.000.000**, Importex **$2.000.000**, Mayorista Caribe **$1.000.000**.
   - (Es exactamente el ejemplo del cliente; también cubierto por el unit test
     `src/lib/suppliers/calculations.test.ts` → "ejemplo EXACTO del cliente".)
2. **Cuentas por pagar** (pestaña *Cuentas por pagar*): una fila por proveedor con
   monto adeudado, fecha de vencimiento (corte + plazo) y semáforo
   **Al día / Por vencer / Vencido** según la fecha de hoy.
3. **Rotación** (pestaña *Rotación*): unidades movidas en 7 y 30 días, con los
   proveedores **estancados** primero.
4. **CRUD** (pestaña *Proveedores*): crear / editar / desactivar proveedores.

Crear un pedido nuevo (Pedidos → manual o IA) eligiendo un producto con proveedor
congela su `supplier_id` y se refleja en el Cierre.

---

## 5. Calidad / verificación

- `npm run typecheck` ✅  · `npm run lint` ✅ (0 errores) · `npm test` ✅ **245 tests**
  (incluye los 22 de proveedores y el ejemplo numérico exacto).
- E2E (`tests/e2e/suppliers.spec.ts`) compila; corre en CI/Vercel (Node 20). El
  entorno local es Node 18, por eso el `webServer` de Playwright no se ejecuta aquí.
- Subagentes **REVISOR** y **SEGURIDAD/AISLAMIENTO**: **PASA** (sin defectos
  altos/medios). Aislamiento por RLS (patrón 003) + scoping `withTenant` + FK
  compuesta por tenant. Test de runtime cross-tenant descrito en la auditoría
  (requiere BD con dos JWT de tenant); estáticamente verificado.
- Seguimiento documentado en `docs/ROADMAP.md` (integración en agentes, pagos a
  proveedores, proveedor por variante).

---

## 6. Comando de push (lo ejecutas TÚ)

La rama `feat/proveedores` quedó con commits atómicos por fase. **No** se hizo push
ni merge a `main`. Para subirla:

```bash
cd /Users/gt/Documents/TiaPaola/meraki-app
git push -u origin feat/proveedores
```

Luego abre el PR hacia `main` desde GitHub (repo `ronalc90/koptup-comercio-electronico`).
