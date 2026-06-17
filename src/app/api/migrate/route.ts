import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin';

export async function POST() {
  // Endpoint de esquema/DDL: solo admins. (Lo ideal es correr el DDL a mano en
  // el SQL Editor de Supabase; este endpoint queda como ayuda.)
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getServiceClient();

  // Check if owner column already exists
  const { error: testError } = await supabase.from('products').select('owner').limit(1);

  if (!testError) {
    return NextResponse.json({ message: 'Migration already applied', status: 'ok' });
  }

  // Owner column doesn't exist - we need to add it via raw SQL
  // Since we can't run DDL via PostgREST, we'll use a workaround:
  // Create a temporary function via RPC, execute it, then drop it
  try {
    // Try creating the function
    const { error: rpcError } = await supabase.rpc('run_migration_add_owner', {});

    if (rpcError) {
      // Function doesn't exist, return instructions
      return NextResponse.json({
        message: 'Cannot run DDL via API. Please execute the SQL manually in Supabase SQL Editor.',
        sql: `
-- Run this in Supabase SQL Editor:
ALTER TABLE products ADD COLUMN IF NOT EXISTS owner VARCHAR(50) DEFAULT 'Paola';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS owner VARCHAR(50) DEFAULT 'Paola';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS owner VARCHAR(50) DEFAULT 'Paola';
CREATE INDEX IF NOT EXISTS idx_products_owner ON products(owner);
CREATE INDEX IF NOT EXISTS idx_orders_owner ON orders(owner);
CREATE INDEX IF NOT EXISTS idx_inventory_owner ON inventory(owner);
UPDATE products SET owner = 'Paola' WHERE owner IS NULL;
UPDATE orders SET owner = 'Paola' WHERE owner IS NULL;
UPDATE inventory SET owner = 'Paola' WHERE owner IS NULL;

-- v1.010: tipo de pago (anticipado / contra entrega / mixto / otro)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_timing VARCHAR(20) DEFAULT 'ContraEntrega';
UPDATE orders SET payment_timing = 'ContraEntrega' WHERE payment_timing IS NULL;

-- v1.012: nombres genéricos para tipo de envío y canal del mensajero.
-- Se renombra la columna y se normalizan los valores legacy del enum.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='orders' AND column_name='payment_cash_bogo') THEN
    ALTER TABLE orders RENAME COLUMN payment_cash_bogo TO payment_courier_pending;
  END IF;
END $$;
UPDATE orders SET delivery_type = 'Mensajeria' WHERE delivery_type = 'Bogo';
UPDATE orders SET delivery_type = 'Recogida'   WHERE delivery_type = 'Bodega';
UPDATE orders SET delivery_type = 'Otro'       WHERE delivery_type = 'Otros';
        `.trim(),
        status: 'needs_manual_migration',
      }, { status: 400 });
    }

    return NextResponse.json({ message: 'Migration applied successfully', status: 'ok' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg, status: 'failed' }, { status: 500 });
  }
}
