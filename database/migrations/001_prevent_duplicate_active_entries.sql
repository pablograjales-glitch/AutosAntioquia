BEGIN;

-- Keep the oldest active entry for each plate. Close later duplicate entries
-- at their own entry time so they no longer appear as active records.
WITH ranked_active_entries AS (
  SELECT
    id_registro,
    ROW_NUMBER() OVER (
      PARTITION BY placa
      ORDER BY fecha_hora_entrada, id_registro
    ) AS position
  FROM registro_acceso
  WHERE fecha_hora_salida IS NULL
), duplicate_entries AS (
  SELECT id_registro
  FROM ranked_active_entries
  WHERE position > 1
), closed_entries AS (
  UPDATE registro_acceso AS ra
  SET fecha_hora_salida = ra.fecha_hora_entrada
  FROM duplicate_entries AS duplicate
  WHERE ra.id_registro = duplicate.id_registro
  RETURNING ra.id_celda
)
UPDATE celda AS c
SET estado = 'DISPONIBLE'
FROM closed_entries AS closed
WHERE c.id_celda = closed.id_celda
  AND NOT EXISTS (
    SELECT 1
    FROM registro_acceso AS active
    WHERE active.id_celda = c.id_celda
      AND active.fecha_hora_salida IS NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_registro_acceso_placa_activa
  ON registro_acceso (placa)
  WHERE fecha_hora_salida IS NULL;

COMMIT;
