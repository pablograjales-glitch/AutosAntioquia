BEGIN;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS fecha_vencimiento_mensualidad DATE;
UPDATE usuario SET fecha_vencimiento_mensualidad = CURRENT_DATE WHERE fecha_vencimiento_mensualidad IS NULL;
ALTER TABLE usuario ALTER COLUMN fecha_vencimiento_mensualidad SET NOT NULL;
COMMIT;
