-- Esquema físico de Autos Antioquia (PostgreSQL).
CREATE TABLE usuario (
  id_usuario BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cedula VARCHAR(15) NOT NULL UNIQUE CHECK (cedula ~ '^[0-9]{5,15}$'),
  nombre VARCHAR(120) NOT NULL CHECK (length(trim(nombre)) > 0),
  mensualidad_activa BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_vencimiento_mensualidad DATE NOT NULL
);

-- Cuentas de acceso al sistema, separadas de los usuarios/clientes mensualizados.
CREATE TABLE cuenta_acceso (
  id_cuenta BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre_usuario VARCHAR(32) NOT NULL UNIQUE CHECK (nombre_usuario = lower(nombre_usuario)),
  nombre_completo VARCHAR(120) NOT NULL CHECK (length(trim(nombre_completo)) > 0),
  password_hash CHAR(128) NOT NULL,
  password_salt CHAR(32) NOT NULL,
  rol VARCHAR(15) NOT NULL CHECK (rol IN ('ADMINISTRADOR', 'OPERADOR')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE operador (
  id_operador BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cuenta BIGINT NOT NULL UNIQUE REFERENCES cuenta_acceso(id_cuenta) ON DELETE RESTRICT,
  cedula VARCHAR(15) NOT NULL UNIQUE CHECK (cedula ~ '^[0-9]{5,15}$'),
  nombre VARCHAR(120) NOT NULL CHECK (length(trim(nombre)) > 0),
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE sesion_acceso (
  token_hash CHAR(64) PRIMARY KEY,
  id_cuenta BIGINT NOT NULL REFERENCES cuenta_acceso(id_cuenta) ON DELETE CASCADE,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en TIMESTAMPTZ NOT NULL,
  revocada_en TIMESTAMPTZ,
  CHECK (expira_en > creada_en)
);
CREATE INDEX ix_sesion_acceso_cuenta_activa
  ON sesion_acceso (id_cuenta, expira_en) WHERE revocada_en IS NULL;

CREATE TABLE vehiculo (
  placa VARCHAR(6) PRIMARY KEY,
  tipo_vehiculo VARCHAR(5) NOT NULL CHECK (tipo_vehiculo IN ('CARRO', 'MOTO')),
  id_usuario BIGINT NOT NULL REFERENCES usuario(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  matriculado_por_cuenta BIGINT REFERENCES cuenta_acceso(id_cuenta) ON DELETE RESTRICT,
  CONSTRAINT ck_formato_placa_por_tipo CHECK (
    (tipo_vehiculo = 'CARRO' AND placa ~ '^[A-Z]{3}[0-9]{3}$') OR
    (tipo_vehiculo = 'MOTO' AND placa ~ '^[A-Z]{3}[0-9]{2}[A-Z]$')
  )
);

CREATE TABLE celda (
  id_celda INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_celda VARCHAR(30) NOT NULL UNIQUE,
  tipo_vehiculo VARCHAR(5) NOT NULL CHECK (tipo_vehiculo IN ('CARRO', 'MOTO')),
  estado VARCHAR(15) NOT NULL DEFAULT 'DISPONIBLE' CHECK (estado IN ('DISPONIBLE', 'OCUPADA', 'MANTENIMIENTO'))
);

CREATE TABLE registro_acceso (
  id_registro BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  placa VARCHAR(6) NOT NULL REFERENCES vehiculo(placa) ON UPDATE CASCADE ON DELETE RESTRICT,
  id_celda INTEGER NOT NULL REFERENCES celda(id_celda) ON UPDATE CASCADE ON DELETE RESTRICT,
  fecha_hora_entrada TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_hora_salida TIMESTAMPTZ,
  id_cuenta_entrada BIGINT REFERENCES cuenta_acceso(id_cuenta) ON DELETE RESTRICT,
  id_cuenta_salida BIGINT REFERENCES cuenta_acceso(id_cuenta) ON DELETE RESTRICT,
  CONSTRAINT ck_salida_posterior_entrada CHECK (fecha_hora_salida IS NULL OR fecha_hora_salida >= fecha_hora_entrada)
);

CREATE UNIQUE INDEX uq_registro_acceso_placa_activa
  ON registro_acceso (placa) WHERE fecha_hora_salida IS NULL;
CREATE UNIQUE INDEX uq_registro_acceso_celda_activa
  ON registro_acceso (id_celda) WHERE fecha_hora_salida IS NULL;
CREATE INDEX ix_registro_acceso_placa_fecha
  ON registro_acceso (placa, fecha_hora_entrada DESC);

-- 80 celdas para carros y 10 para motos, todas inicialmente disponibles.
INSERT INTO celda (numero_celda, tipo_vehiculo)
SELECT 'C-' || lpad(n::text, 2, '0'), 'CARRO' FROM generate_series(1, 80) AS n;
INSERT INTO celda (numero_celda, tipo_vehiculo)
SELECT 'M-' || lpad(n::text, 2, '0'), 'MOTO' FROM generate_series(1, 10) AS n;
