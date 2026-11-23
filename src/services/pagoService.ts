import { pool } from '../config/db';

export const nuevoVencimiento = "GREATEST(fecha_vencimiento_mensualidad, CURRENT_DATE) + INTERVAL '30 days'";

export const estadosPago = ['PENDIENTE', 'APROBADO', 'RECHAZADO'] as const;
export type EstadoPago = typeof estadosPago[number];

export async function aplicarResultado(referencia: string, origen: string, estado: EstadoPago, monto?: number, refEpayco?: string) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [pago] } = await db.query(
      'SELECT * FROM pago_mensualidad WHERE referencia = $1 AND origen = $2 FOR UPDATE',
      [referencia, origen],
    );
    if (!pago || (monto !== undefined && pago.monto !== monto) ||
        (pago.ref_epayco && pago.ref_epayco !== refEpayco)) {
      await db.query('ROLLBACK');
      return null;
    }
    if (pago.estado === 'PENDIENTE') {
      await db.query(
        `UPDATE pago_mensualidad SET estado = $2, ref_epayco = $3,
          aplicado_en = CASE WHEN $2 = 'APROBADO' THEN NOW() END WHERE referencia = $1`,
        [referencia, estado, refEpayco ?? null],
      );
      if (estado === 'APROBADO') {
        await db.query(
          `UPDATE usuario SET mensualidad_activa = TRUE, fecha_vencimiento_mensualidad = ${nuevoVencimiento}
            WHERE id_usuario = $1`, [pago.id_usuario],
        );
      }
    }
    await db.query('COMMIT');
    return pago.estado === 'PENDIENTE' ? estado : pago.estado;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
