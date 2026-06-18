-- 011_product_image_url.sql
-- Hace el repo autocontenido: la columna image_url ya existe en producción (se
-- agregó a mano hace tiempo) pero ninguna migración la documentaba, así que un
-- entorno nuevo/staging rompería el alta/edición de productos (el cliente manda
-- image_url en el payload). Idempotente.
ALTER TABLE products  ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image_url TEXT;
