-- ============================================================
-- Migración: Agregar campos de pedido y preferencia de aviso
-- Fecha: 2025
-- ============================================================

-- Agregar campo para almacenar los items del pedido (JSON)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS order_items TEXT;

-- Agregar campo para el total del pedido
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS order_total INTEGER;

-- Agregar campo para la preferencia de aviso del próximo pedido
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS notify_preference TEXT;

-- Comentarios descriptivos para las columnas
COMMENT ON COLUMN leads.order_items IS 'JSON string con los items del pedido actual';
COMMENT ON COLUMN leads.order_total IS 'Total del pedido en pesos colombianos';
COMMENT ON COLUMN leads.notify_preference IS 'Preferencia de tiempo para recordatorio del próximo pedido';
