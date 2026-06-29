-- ============================================================================
-- seed-bodega-demo.sql — Tenant DEMO "Bodega Compralo Colombia" + proveedores
-- ============================================================================
-- Crea SOLO el tenant nuevo y sus datos demo (no toca a Meraki ni PrimeraMayo).
-- Idempotente: se puede correr varias veces sin duplicar (guards NOT EXISTS).
--
-- Prerrequisitos (correr ANTES): migraciones 002, 004, 012, 013 y 016.
-- Ejecutar con:  npm run db:exec scripts/seed-bodega-demo.sql
--
-- Reproduce el ejemplo del cliente en el "Cierre por proveedor":
--   vendido 5.000.000, consumo 4.000.000, utilidad bruta 1.000.000
--   Distribuidora Andina 1.000.000 · Importex 2.000.000 · Mayorista Caribe 1.000.000
--
-- Credenciales temporales (CAMBIAR tras verificar):
--   admin    → admin@bodega-compralo.co     / Bodega2026*   (administra el equipo)
--   operador → operador@bodega-compralo.co  / Bodega2026*   (member: opera y ve los reportes)
-- ============================================================================

-- 1) Tenant nuevo (genérico/neutro) con el módulo de proveedores habilitado.
INSERT INTO tenants (name, slug, logo, industry, plan, billing_status, active, config)
SELECT 'Bodega Compralo Colombia', 'bodega-compralo-colombia', '🏬', 'Comercio mayorista',
       'free', 'trial', true,
       '{"navModules":["pedidos","asistente","inventario","productos","despachos","proveedores"],"categories":["General","Otro"]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'bodega-compralo-colombia');

-- 2) Usuarios: admin (gestión) y operador member (opera y ve los reportes).
--    Hash bcrypt de la contraseña "Bodega2026*".
INSERT INTO users (tenant_id, email, username, password_hash, role)
SELECT t.id, 'admin@bodega-compralo.co', 'admin@bodega-compralo.co',
       '$2b$10$ZYVw9/zadBvsC2EBeN/zmOafuToimmfWqQ10VmqslAnAIrzvXz.nm', 'admin'
FROM tenants t
WHERE t.slug = 'bodega-compralo-colombia'
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id AND u.email = 'admin@bodega-compralo.co');

INSERT INTO users (tenant_id, email, username, password_hash, role)
SELECT t.id, 'operador@bodega-compralo.co', 'operador@bodega-compralo.co',
       '$2b$10$ZYVw9/zadBvsC2EBeN/zmOafuToimmfWqQ10VmqslAnAIrzvXz.nm', 'member'
FROM tenants t
WHERE t.slug = 'bodega-compralo-colombia'
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id AND u.email = 'operador@bodega-compralo.co');

-- 3) Tres proveedores con distinto plazo y día de corte.
INSERT INTO suppliers (tenant_id, name, contact, phone, plazo_dias, dia_corte, active, notes)
SELECT t.id, v.name, v.contact, v.phone, v.plazo, v.corte, true, 'DEMO'
FROM tenants t
CROSS JOIN (VALUES
  ('Distribuidora Andina', 'Carlos', '3001112233', 30, 1),
  ('Importex',             'Marcela','3014445566', 15, 15),
  ('Mayorista Caribe',     'Luis',   '3027778899', 45, 5)
) AS v(name, contact, phone, plazo, corte)
WHERE t.slug = 'bodega-compralo-colombia'
  AND NOT EXISTS (
    SELECT 1 FROM suppliers s WHERE s.tenant_id = t.id AND lower(s.name) = lower(v.name)
  );

-- 4) Productos con proveedor y costo congelable.
INSERT INTO products (tenant_id, code, name, cost, category, active, supplier_id)
SELECT t.id, v.code, v.pname, v.cost, 'General', true, s.id
FROM tenants t
CROSS JOIN (VALUES
  ('A001', 'Producto A', 500000,  'Distribuidora Andina'),
  ('B002', 'Producto B', 1000000, 'Importex'),
  ('C003', 'Producto C', 1000000, 'Mayorista Caribe')
) AS v(code, pname, cost, sname)
JOIN suppliers s ON s.tenant_id = t.id AND lower(s.name) = lower(v.sname)
WHERE t.slug = 'bodega-compralo-colombia'
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.tenant_id = t.id AND p.code = v.code);

-- 5) Pedidos vendidos (estados activos) que reproducen el ejemplo numérico.
--    Costo congelado en product_cost; proveedor congelado en supplier_id.
--    Fechas recientes (CURRENT_DATE - offset) para que la rotación muestre movimiento.
INSERT INTO orders (tenant_id, order_code, client_name, phone, address, product_ref, detail,
                    value_to_collect, product_cost, quantity, supplier_id,
                    delivery_status, delivery_type, vendor, order_date)
SELECT t.id, v.code, v.client, '3000000000', 'Calle Demo #1-2', v.pref, v.detail,
       v.value, v.cost, v.qty, s.id, v.status, 'Mensajeria', 'Operador',
       (CURRENT_DATE - v.dayoff)
FROM tenants t
CROSS JOIN (VALUES
  ('BCC-001', 'Cliente Uno',  'A001', '2 x Producto A', 1250000, 500000,  2, 'Distribuidora Andina', 'Entregado',  2),
  ('BCC-002', 'Cliente Dos',  'B002', '2 x Producto B', 2500000, 1000000, 2, 'Importex',             'Enviado',    10),
  ('BCC-003', 'Cliente Tres', 'C003', '1 x Producto C', 1250000, 1000000, 1, 'Mayorista Caribe',     'Confirmado', 20)
) AS v(code, client, pref, detail, value, cost, qty, sname, status, dayoff)
JOIN suppliers s ON s.tenant_id = t.id AND lower(s.name) = lower(v.sname)
WHERE t.slug = 'bodega-compralo-colombia'
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.tenant_id = t.id AND o.order_code = v.code);
