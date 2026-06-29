-- 018 — Proveedor al INGRESAR mercancía, FASES de pedido (alistamiento) y TRANSPORTADORA.
--
-- Aditiva e IDEMPOTENTE (patrón de 016/017). No invalida datos existentes.
-- Prerrequisitos: 002 (tenants + tenant_id), 003 (RLS jwt_tenant_id()),
--                 009 (chk_orders_status), 016 (suppliers + uq_suppliers_tenant_id).
--
-- Qué hace:
--   1) inventory.supplier_id (nullable = "sin asignar") con FK COMPUESTA por tenant,
--      para asignar el proveedor cuando se INGRESA el stock.
--   2) Amplía chk_orders_status para sumar las fases 'EnAlistamiento' y 'Alistado'
--      sin invalidar pedidos existentes (conserva los 6 estados previos).
--   3) Columnas de transportadora en orders: carrier, tracking_number,
--      tracking_status, tracking_updated_at.
--   4) tenants.shipping_config jsonb: transportadora elegida + credenciales
--      (las credenciales se guardan CIFRADAS por la app, ver src/lib/shipping/crypto.ts).

-- 1) inventory.supplier_id ----------------------------------------------------
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_id INTEGER;
DO $$ BEGIN
  ALTER TABLE inventory ADD CONSTRAINT fk_inventory_supplier_tenant
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory(supplier_id);

-- 2) Ampliar el conjunto de estados (fases) -----------------------------------
-- Se reemplaza el CHECK por uno que incluye las dos fases nuevas. Los 6 estados
-- previos siguen siendo válidos, así que ningún pedido existente se invalida.
DO $$ BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_status;
  ALTER TABLE orders ADD CONSTRAINT chk_orders_status CHECK (
    delivery_status IS NULL OR delivery_status IN
      ('Confirmado', 'EnAlistamiento', 'Alistado', 'Enviado', 'Entregado',
       'Pagado', 'Devolucion', 'Cancelado')
  );
END $$;

-- 3) Transportadora / tracking en orders --------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier VARCHAR(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(80);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_status VARCHAR(60);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_updated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tenant_id, tracking_number);

-- 3b) Precio de venta del producto (para el catálogo público) -----------------
-- `cost` es el COSTO; el catálogo necesita un PRECIO de venta sugerido. Nullable
-- (= "Consultar precio"); no negativo.
ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(12,2);
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT chk_products_price_nonneg CHECK (price IS NULL OR price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Config de transportadora por tenant --------------------------------------
-- jsonb: { carrier: 'interrapidisimo'|'sandbox'|null, enabled: bool,
--          credentials: '<blob cifrado por la app>' }. Las credenciales NUNCA se
-- guardan en claro; la app las cifra (AES-256-GCM, SHIPPING_ENC_KEY) antes de
-- escribir y las descifra solo en el servidor al crear guías.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shipping_config jsonb;
