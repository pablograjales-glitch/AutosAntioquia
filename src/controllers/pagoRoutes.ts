import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, urlencoded } from 'express';
import { pool } from '../config/db';
import { autenticar, exigirRol } from '../middleware/auth';
import { aplicarResultado, estadosPago, EstadoPago } from '../services/pagoService';

export const pagoRoutes = Router();
const admin = [autenticar, exigirRol('ADMINISTRADOR')];
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const modo = process.env.PAGOS_MODO;
const monto = Number(process.env.PAGOS_MONTO_COP ?? '50000');

pagoRoutes.get('/config', ...admin, (_req, res) => {
  res.json({ modo: modo === 'demo' || modo === 'epayco' ? modo : null, monto });
});

pagoRoutes.get('/cliente/:cedula', ...admin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT referencia, monto, moneda, origen, estado, creado_en, aplicado_en
      FROM pago_mensualidad JOIN usuario USING (id_usuario)
      WHERE cedula = $1 ORDER BY creado_en DESC LIMIT 30`,
    [req.params.cedula],
  );
  res.json(rows);
});

pagoRoutes.post('/cliente/:cedula', ...admin, async (req, res) => {
  if ((modo !== 'demo' && modo !== 'epayco') || !Number.isInteger(monto) || monto < 1 || monto > 2147483647) {
    return res.status(503).json({ error: 'Configura el modo y la tarifa de pruebas.' });
  }
  const { rows: [cliente] } = await pool.query('SELECT id_usuario FROM usuario WHERE cedula = $1', [req.params.cedula]);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const referencia = randomUUID();
  let sessionId: string | undefined;
  if (modo === 'epayco') {
    try {
      sessionId = await crearCheckout(referencia);
    } catch {
      return res.status(502).json({ error: 'No se pudo iniciar ePayco en modo de prueba. Revisa la configuración.' });
    }
  }
  await pool.query(
    'INSERT INTO pago_mensualidad (referencia, id_usuario, monto, origen) VALUES ($1, $2, $3, $4)',
    [referencia, cliente.id_usuario, monto, modo],
  );
  return res.status(201).json({ referencia, monto, modo, sessionId });
});

pagoRoutes.post('/:referencia/demo', ...admin, async (req, res) => {
  if (modo !== 'demo') return res.sendStatus(404);
  const { referencia } = req.params;
  const estado = req.body?.estado;
  if (typeof referencia !== 'string' || !uuid.test(referencia) || !estadosPago.includes(estado)) return res.sendStatus(400);
  const aplicado = await aplicarResultado(referencia, 'demo', estado);
  return aplicado ? res.json({ estado: aplicado }) : res.sendStatus(404);
});

pagoRoutes.post('/epayco/confirmacion', urlencoded({ extended: false, limit: '32kb' }), async (req, res) => {
  if (modo !== 'epayco' || !process.env.EPAYCO_CUSTOMER_ID || !process.env.EPAYCO_P_KEY) return res.sendStatus(404);
  const aviso = req.body ?? {};
  const campos = ['x_ref_payco', 'x_transaction_id', 'x_amount', 'x_currency_code', 'x_signature'];
  if (campos.some(campo => typeof aviso[campo] !== 'string' || !aviso[campo])) return res.sendStatus(400);
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(aviso.x_ref_payco) || !/^[\da-f]{64}$/i.test(aviso.x_signature)) {
    return res.sendStatus(400);
  }
  const firma = createHash('sha256').update([
    process.env.EPAYCO_CUSTOMER_ID, process.env.EPAYCO_P_KEY,
    aviso.x_ref_payco, aviso.x_transaction_id, aviso.x_amount, aviso.x_currency_code,
  ].join('^')).digest();
  if (!timingSafeEqual(firma, Buffer.from(aviso.x_signature, 'hex'))) return res.sendStatus(400);

  // La firma de ePayco no cubre el estado ni la factura. Se consultan por referencia.
  const respuesta = await fetch(
    'https://secure.epayco.co/validation/v1/reference/' + encodeURIComponent(aviso.x_ref_payco),
    { signal: AbortSignal.timeout(10000) },
  );
  if (!respuesta.ok) return res.sendStatus(502);
  const { data } = await respuesta.json() as { data?: Record<string, unknown> };
  if (!data || String(data.x_ref_payco) !== aviso.x_ref_payco ||
      String(data.x_transaction_id) !== aviso.x_transaction_id ||
      String(data.x_test_request) !== 'true' || String(data.x_currency_code).toUpperCase() !== 'COP' ||
      typeof data.x_id_invoice !== 'string' || !uuid.test(data.x_id_invoice) ||
      !/^\d+(?:\.0+)?$/.test(String(data.x_amount)) || Number(data.x_amount) !== Number(aviso.x_amount)) {
    return res.sendStatus(400);
  }
  const estados: Record<string, EstadoPago> = {
    Aceptada: 'APROBADO', Rechazada: 'RECHAZADO', Fallida: 'RECHAZADO', Pendiente: 'PENDIENTE',
  };
  const estado = estados[String(data.x_response)];
  if (!estadosPago.includes(estado)) return res.sendStatus(400);
  const aplicado = await aplicarResultado(data.x_id_invoice, 'epayco', estado, Number(data.x_amount), aviso.x_ref_payco);
  return res.sendStatus(aplicado ? 200 : 400);
});

async function crearCheckout(referencia: string) {
  const { EPAYCO_PUBLIC_KEY, EPAYCO_PRIVATE_KEY, EPAYCO_CUSTOMER_ID, EPAYCO_P_KEY, PAGOS_URL_PUBLICA } = process.env;
  if (!EPAYCO_PUBLIC_KEY || !EPAYCO_PRIVATE_KEY || !EPAYCO_CUSTOMER_ID || !EPAYCO_P_KEY || !PAGOS_URL_PUBLICA) {
    throw new Error('Faltan credenciales de ePayco.');
  }
  const base = new URL(PAGOS_URL_PUBLICA);
  if (base.protocol !== 'https:') throw new Error('La URL pública requiere HTTPS.');
  const auth = Buffer.from(EPAYCO_PUBLIC_KEY + ':' + EPAYCO_PRIVATE_KEY).toString('base64');
  const login = await fetch('https://apify.epayco.co/login', {
    method: 'POST', headers: { Authorization: 'Basic ' + auth }, signal: AbortSignal.timeout(10000),
  });
  if (!login.ok) throw new Error('ePayco rechazó el acceso.');
  const { token } = await login.json() as { token?: unknown };
  if (typeof token !== 'string') throw new Error('ePayco no devolvió un token.');
  const checkout = await fetch('https://apify.epayco.co/payment/session/create', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      checkout_version: '2', name: 'AutosAntioquia', description: 'Mensualidad de prueba',
      currency: 'COP', amount: monto, invoice: referencia, country: 'CO', lang: 'ES',
      response: new URL('/resultado-pago', base).href, method: 'POST', uniqueTransactionPerBill: true,
      confirmation: new URL('/api/pagos/epayco/confirmacion', base).href,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!checkout.ok) throw new Error('ePayco rechazó la sesión.');
  const { data } = await checkout.json() as { data?: { sessionId?: unknown } };
  if (typeof data?.sessionId !== 'string' || !data.sessionId) throw new Error('Sesión de pago inválida.');
  return data.sessionId;
}
