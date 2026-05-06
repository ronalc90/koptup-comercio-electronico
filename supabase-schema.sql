-- ============================================
-- Tu Tienda Meraki - Supabase Database Schema
-- ============================================
-- Ejecutar este SQL en el SQL Editor de Supabase
-- https://app.supabase.com → tu proyecto → SQL Editor

-- 1. Tabla de Productos/Costos
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL,
  name TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  category VARCHAR(50) DEFAULT 'Pantuflas',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de Pedidos
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_code VARCHAR(10),
  client_name TEXT NOT NULL,
  phone TEXT,
  city TEXT DEFAULT 'Bogotá',
  address TEXT,
  complement TEXT,
  product_ref VARCHAR(10),
  detail TEXT,
  comment TEXT,
  value_to_collect INTEGER DEFAULT 0,
  -- v1.012: renombrada desde payment_cash_bogo. Efectivo cobrado por el
  -- mensajero/courier que aún no se ha liquidado al negocio.
  payment_courier_pending INTEGER DEFAULT 0,
  payment_cash INTEGER DEFAULT 0,
  payment_transfer INTEGER DEFAULT 0,
  product_cost INTEGER DEFAULT 0,
  delivery_type VARCHAR(10) DEFAULT '',
  vendor VARCHAR(20) DEFAULT '',
  delivery_status VARCHAR(20) DEFAULT 'Confirmado',
  status_complement TEXT,
  is_exchange BOOLEAN DEFAULT false,
  order_date DATE DEFAULT CURRENT_DATE,
  dispatch_date DATE,
  guide_number TEXT,
  prepaid_amount INTEGER DEFAULT 0,
  operating_cost INTEGER DEFAULT 0,
  payment_timing VARCHAR(20) DEFAULT 'ContraEntrega', -- v1.010
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabla de Inventario
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  basket_location VARCHAR(10),
  product_id VARCHAR(10),
  category VARCHAR(50) DEFAULT 'Pantuflas',
  type VARCHAR(20) DEFAULT 'Adulto',
  reference INTEGER DEFAULT 0,
  model VARCHAR(100),
  color VARCHAR(50),
  size VARCHAR(10),
  quantity INTEGER DEFAULT 1,
  status VARCHAR(20) DEFAULT 'Bueno',
  observations TEXT,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabla de Configuracion
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(50) UNIQUE NOT NULL,
  value TEXT
);

-- 5. Tabla de Gastos
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  category VARCHAR(50) DEFAULT 'otro',
  expense_date DATE DEFAULT CURRENT_DATE,
  owner VARCHAR(50) DEFAULT 'Paola',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(vendor);
CREATE INDEX IF NOT EXISTS idx_inventory_model ON inventory(model);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_owner ON expenses(owner);

-- Habilitar Row Level Security (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Politicas: permitir todo para usuarios autenticados (app de un solo usuario)
-- Para la anon key, permitir acceso total (la app maneja auth via JWT propio)
CREATE POLICY "Allow all for anon" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON expenses FOR ALL USING (true) WITH CHECK (true);
