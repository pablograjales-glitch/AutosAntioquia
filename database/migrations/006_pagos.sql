CREATE TABLE IF NOT EXISTS pago_mensualidad (
  referencia UUID PRIMARY KEY,
  id_usuario BIGINT NOT NULL REFERENCES usuario(id_usuario),
  monto INTEGER NOT NULL CHECK (monto > 0),
  moneda CHAR(3) NOT NULL DEFAULT 'COP',
  origen TEXT NOT NULL CHECK (origen IN ('demo', 'epayco')),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
  ref_epayco TEXT UNIQUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aplicado_en TIMESTAMPTZ
);
