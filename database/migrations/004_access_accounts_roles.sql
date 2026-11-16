BEGIN;

CREATE TABLE IF NOT EXISTS cuenta_acceso (
  id_cuenta BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre_usuario VARCHAR(32) NOT NULL UNIQUE,
  nombre_completo VARCHAR(120) NOT NULL CHECK (length(trim(nombre_completo)) > 0),
  password_hash CHAR(128) NOT NULL,
  password_salt CHAR(32) NOT NULL,
  rol VARCHAR(15) NOT NULL CHECK (rol IN ('ADMINISTRADOR', 'OPERADOR')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_nombre_usuario_normalizado CHECK (nombre_usuario = lower(nombre_usuario))
);

CREATE TABLE IF NOT EXISTS operador (
  id_operador BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cuenta BIGINT NOT NULL UNIQUE REFERENCES cuenta_acceso(id_cuenta) ON DELETE RESTRICT,
  cedula VARCHAR(15) NOT NULL UNIQUE CHECK (cedula ~ '^[0-9]{5,15}$'),
  nombre VARCHAR(120) NOT NULL CHECK (length(trim(nombre)) > 0),
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sesion_acceso (
  token_hash CHAR(64) PRIMARY KEY,
  id_cuenta BIGINT NOT NULL REFERENCES cuenta_acceso(id_cuenta) ON DELETE CASCADE,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en TIMESTAMPTZ NOT NULL,
  revocada_en TIMESTAMPTZ,
  CONSTRAINT ck_expiracion_sesion CHECK (expira_en > creada_en)
);
CREATE INDEX IF NOT EXISTS ix_sesion_acceso_cuenta_activa
  ON sesion_acceso (id_cuenta, expira_en) WHERE revocada_en IS NULL;

ALTER TABLE celda ALTER COLUMN numero_celda TYPE VARCHAR(30);

COMMIT;
