import { pool } from '../config/db';
import { ErrorHttp } from './authService';
import { nuevoVencimiento } from './pagoService';

const LIMITE_CELDAS: Record<'CARRO' | 'MOTO', number> = { CARRO: 80, MOTO: 10 };

export class GestionService {
  async listarUsuarios() {
    const { rows } = await pool.query(`
      SELECT u.id_usuario, u.cedula, u.nombre, u.mensualidad_activa,
             u.fecha_vencimiento_mensualidad,
             COALESCE(json_agg(json_build_object('placa', v.placa, 'tipoVehiculo', v.tipo_vehiculo))
               FILTER (WHERE v.placa IS NOT NULL), '[]'::json) AS vehiculos
      FROM usuario u LEFT JOIN vehiculo v ON v.id_usuario = u.id_usuario
      GROUP BY u.id_usuario ORDER BY u.nombre, u.cedula;
    `);
    return rows;
  }

  async crearUsuario(datos: { cedula: string; nombre: string }) {
    const cedula = datos.cedula.trim();
    const nombre = datos.nombre.trim();
    if (!/^\d{5,15}$/.test(cedula)) throw new Error('La cédula debe contener entre 5 y 15 dígitos.');
    if (!nombre || nombre.length > 120) throw new Error('El nombre es obligatorio y admite hasta 120 caracteres.');
    try {
      const { rows } = await pool.query(`
        INSERT INTO usuario (cedula, nombre, mensualidad_activa, fecha_vencimiento_mensualidad)
        VALUES ($1, $2, false, CURRENT_DATE)
        RETURNING id_usuario, cedula, nombre, mensualidad_activa, fecha_vencimiento_mensualidad;
      `, [cedula, nombre]);
      return rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new Error(`La cédula ${cedula} ya está registrada.`);
      throw error;
    }
  }

  async actualizarNombre(cedula: string, nombreBruto: string) {
    const nombre = nombreBruto.trim();
    if (!nombre || nombre.length > 120) throw new Error('El nombre es obligatorio y admite hasta 120 caracteres.');
    const { rows } = await pool.query(
      'UPDATE usuario SET nombre = $2 WHERE cedula = $1 RETURNING id_usuario, cedula, nombre, mensualidad_activa, fecha_vencimiento_mensualidad;',
      [cedula, nombre]
    );
    if (!rows.length) throw new Error('No se encontró el usuario.');
    return rows[0];
  }

  async actualizarMensualidad(cedula: string, activa: boolean) {
    const { rows } = await pool.query(`
      UPDATE usuario
      SET mensualidad_activa = $2,
          fecha_vencimiento_mensualidad = CASE WHEN $2 THEN ${nuevoVencimiento} ELSE fecha_vencimiento_mensualidad END
      WHERE cedula = $1
      RETURNING id_usuario, cedula, nombre, mensualidad_activa, fecha_vencimiento_mensualidad;
    `, [cedula, activa]);
    if (!rows.length) throw new Error('No se encontró el usuario.');
    return rows[0];
  }

  async listarCeldas(filtros: { q?: string; tipo?: string; estado?: string } = {}) {
    const filtro = `%${(filtros.q || '').trim().toLowerCase()}%`;
    const { rows } = await pool.query(`
      SELECT c.id_celda, c.numero_celda, c.tipo_vehiculo,
             CASE WHEN ra.placa IS NOT NULL THEN 'OCUPADA' ELSE c.estado END AS estado,
             ra.placa AS placa_actual
      FROM celda c
      LEFT JOIN registro_acceso ra ON ra.id_celda = c.id_celda AND ra.fecha_hora_salida IS NULL
      WHERE ($1 = '%%' OR lower(c.numero_celda) LIKE $1 OR lower(COALESCE(ra.placa, '')) LIKE $1)
        AND ($2::text IS NULL OR c.tipo_vehiculo = $2)
        AND ($3::text IS NULL OR (CASE WHEN ra.placa IS NOT NULL THEN 'OCUPADA' ELSE c.estado END) = $3)
      ORDER BY c.tipo_vehiculo, c.numero_celda;
    `, [filtro, filtros.tipo || null, filtros.estado || null]);
    return rows;
  }

  private validarCelda(datos: { numeroCelda: string; tipoVehiculo: string }) {
    const numeroCelda = datos.numeroCelda.trim().toUpperCase();
    if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(numeroCelda) || numeroCelda.length > 30) {
      throw new ErrorHttp('El código debe contener letras, números y guiones (máximo 30 caracteres).', 422);
    }
    if (!['CARRO', 'MOTO'].includes(datos.tipoVehiculo)) throw new ErrorHttp('Tipo de celda inválido.', 422);
    return { numeroCelda, tipoVehiculo: datos.tipoVehiculo };
  }

  async obtenerCelda(id: number) {
    const { rows } = await pool.query(`
      SELECT c.id_celda, c.numero_celda, c.tipo_vehiculo, c.estado, ra.placa AS placa_actual
      FROM celda c LEFT JOIN registro_acceso ra
        ON ra.id_celda = c.id_celda AND ra.fecha_hora_salida IS NULL
      WHERE c.id_celda = $1;
    `, [id]);
    if (!rows.length) throw new ErrorHttp('No se encontró la celda.', 404);
    return rows[0];
  }

  async crearCelda(datos: { numeroCelda: string; tipoVehiculo: string }) {
    const { numeroCelda, tipoVehiculo } = this.validarCelda(datos);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa altas del mismo tipo para evitar superar el cupo con solicitudes simultáneas.
      await client.query('SELECT pg_advisory_xact_lock(914210, hashtext($1));', [tipoVehiculo]);
      const conteo = await client.query('SELECT COUNT(*)::int AS total FROM celda WHERE tipo_vehiculo = $1;', [tipoVehiculo]);
      if (conteo.rows[0].total >= LIMITE_CELDAS[tipoVehiculo as 'CARRO' | 'MOTO']) {
        throw new ErrorHttp(`No se pueden crear más celdas para ${tipoVehiculo.toLowerCase()}: el máximo es ${LIMITE_CELDAS[tipoVehiculo as 'CARRO' | 'MOTO']}.`, 409);
      }
      const { rows } = await client.query(`
        INSERT INTO celda (numero_celda, tipo_vehiculo) VALUES ($1, $2)
        RETURNING id_celda, numero_celda, tipo_vehiculo, estado;
      `, [numeroCelda, tipoVehiculo]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new ErrorHttp('Ya existe una celda con ese código.', 409);
      throw error;
    } finally { client.release(); }
  }

  async editarCelda(id: number, datos: { numeroCelda: string; tipoVehiculo: string }) {
    const { numeroCelda, tipoVehiculo } = this.validarCelda(datos);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Adquiere en orden fijo ambos bloqueos solo si cambia el tipo de vehículo.
      const tipos = [...new Set(['CARRO', 'MOTO'])];
      for (const tipo of tipos) await client.query('SELECT pg_advisory_xact_lock(914210, hashtext($1));', [tipo]);
      const actual = await client.query(`
        SELECT c.estado, c.tipo_vehiculo,
               EXISTS (SELECT 1 FROM registro_acceso ra WHERE ra.id_celda = c.id_celda AND ra.fecha_hora_salida IS NULL) AS tiene_acceso_activo
        FROM celda c WHERE c.id_celda = $1 FOR UPDATE;
      `, [id]);
      if (!actual.rows.length) throw new ErrorHttp('No se encontró la celda.', 404);
      if (actual.rows[0].estado === 'OCUPADA' || actual.rows[0].tiene_acceso_activo) throw new ErrorHttp('No se puede editar una celda ocupada.', 409);
      if (actual.rows[0].tipo_vehiculo !== tipoVehiculo) {
        const conteo = await client.query('SELECT COUNT(*)::int AS total FROM celda WHERE tipo_vehiculo = $1;', [tipoVehiculo]);
        if (conteo.rows[0].total >= LIMITE_CELDAS[tipoVehiculo as 'CARRO' | 'MOTO']) {
          throw new ErrorHttp(`No se puede cambiar a ${tipoVehiculo.toLowerCase()}: el máximo es ${LIMITE_CELDAS[tipoVehiculo as 'CARRO' | 'MOTO']} celdas.`, 409);
        }
      }
      const { rows } = await client.query(`
        UPDATE celda SET numero_celda = $2, tipo_vehiculo = $3
        WHERE id_celda = $1 RETURNING id_celda, numero_celda, tipo_vehiculo, estado;
      `, [id, numeroCelda, tipoVehiculo]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new ErrorHttp('Ya existe una celda con ese código.', 409);
      throw error;
    } finally { client.release(); }
  }

  async eliminarCelda(id: number): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(`
        SELECT c.estado,
               EXISTS (SELECT 1 FROM registro_acceso ra WHERE ra.id_celda = c.id_celda AND ra.fecha_hora_salida IS NULL) AS tiene_acceso_activo
        FROM celda c WHERE c.id_celda = $1 FOR UPDATE;
      `, [id]);
      if (!current.rows.length) throw new ErrorHttp('No se encontró la celda.', 404);
      if (current.rows[0].estado === 'OCUPADA' || current.rows[0].tiene_acceso_activo) throw new ErrorHttp('No se puede eliminar una celda ocupada.', 409);
      const history = await client.query('SELECT 1 FROM registro_acceso WHERE id_celda = $1 LIMIT 1;', [id]);
      if (history.rows.length) throw new ErrorHttp('No se puede eliminar una celda relacionada con el historial de accesos.', 409);
      await client.query('DELETE FROM celda WHERE id_celda = $1;', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async listarCeldasDisponibles(tipo?: string) {
    if (tipo && !['CARRO', 'MOTO'].includes(tipo)) throw new ErrorHttp('Tipo de vehículo inválido.', 422);
    const { rows } = await pool.query(`
      SELECT id_celda, numero_celda, tipo_vehiculo
      FROM celda c WHERE c.estado = 'DISPONIBLE' AND ($1::text IS NULL OR c.tipo_vehiculo = $1)
        AND NOT EXISTS (SELECT 1 FROM registro_acceso ra WHERE ra.id_celda = c.id_celda AND ra.fecha_hora_salida IS NULL)
      ORDER BY tipo_vehiculo, numero_celda;
    `, [tipo || null]);
    return rows;
  }

  async actualizarEstadoCelda(id: number, estado: string) {
    if (!['DISPONIBLE', 'MANTENIMIENTO'].includes(estado)) {
      throw new Error('El estado solicitado no es válido.');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT c.estado,
               EXISTS (SELECT 1 FROM registro_acceso ra WHERE ra.id_celda = c.id_celda AND ra.fecha_hora_salida IS NULL) AS tiene_acceso_activo
        FROM celda c WHERE c.id_celda = $1 FOR UPDATE;
      `, [id]);
      if (!rows.length) throw new Error('No se encontró la celda.');
      if (rows[0].estado === 'OCUPADA' || rows[0].tiene_acceso_activo) throw new Error('No se puede cambiar una celda ocupada; registre primero la salida del vehículo.');
      await client.query('UPDATE celda SET estado = $2 WHERE id_celda = $1;', [id, estado]);
      await client.query('COMMIT');
      return { id_celda: id, estado };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
