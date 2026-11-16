BEGIN;

ALTER TABLE vehiculo
  ADD COLUMN IF NOT EXISTS matriculado_por_cuenta BIGINT
  REFERENCES cuenta_acceso(id_cuenta) ON DELETE RESTRICT;

ALTER TABLE registro_acceso
  ADD COLUMN IF NOT EXISTS id_cuenta_entrada BIGINT
  REFERENCES cuenta_acceso(id_cuenta) ON DELETE RESTRICT;
ALTER TABLE registro_acceso
  ADD COLUMN IF NOT EXISTS id_cuenta_salida BIGINT
  REFERENCES cuenta_acceso(id_cuenta) ON DELETE RESTRICT;

COMMENT ON COLUMN vehiculo.matriculado_por_cuenta IS 'Cuenta autenticada que matriculó el vehículo.';
COMMENT ON COLUMN registro_acceso.id_cuenta_entrada IS 'Cuenta autenticada que registró la entrada.';
COMMENT ON COLUMN registro_acceso.id_cuenta_salida IS 'Cuenta autenticada que registró la salida.';

COMMIT;
