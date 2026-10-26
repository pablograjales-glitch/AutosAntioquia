import { pool } from '../config/db';
import { TipoVehiculo, RespuestaAcceso } from '../models/types';

export class AccesoService {
  public async registrarEntrada(placaBruta: string, tipoVehiculo: TipoVehiculo): Promise<RespuestaAcceso> {
    // 0. Estandarización de la placa (Limpieza de espacios y mayúsculas)
    const placa = placaBruta.trim().toUpperCase();

    // Validar formato completo (longitud + terminación según el tipo)
    this.validarTipoPlaca(placa, tipoVehiculo);

    // 1. Validar si el vehículo existe y si el usuario tiene la mensualidad activa
    const client = await pool.connect();
    try {
    await client.query('BEGIN');
    const queryVehiculo = `
      SELECT v.placa, u.mensualidad_activa 
      FROM vehiculo v
      JOIN usuario u ON v.id_usuario = u.id_usuario
      WHERE v.placa = $1
      FOR UPDATE OF v;
    `;
    const resVehiculo = await client.query(queryVehiculo, [placa]);

    if (resVehiculo.rows.length === 0) {
      throw new Error(`El vehículo con placa ${placa} no se encuentra registrado en el sistema.`);
    }

    if (!resVehiculo.rows[0].mensualidad_activa) {
      throw new Error(`Acceso Denegado: La mensualidad para la placa ${placa} está VENCIDA.`);
    }

    // 🔴 VALIDACIÓN DE NEGOCIO: Evitar el doble ingreso si el vehículo ya está adentro
    const queryIngresoActivo = `
      SELECT id_registro FROM registro_acceso 
      WHERE placa = $1 AND fecha_hora_salida IS NULL;
    `;
    const resIngresoActivo = await client.query(queryIngresoActivo, [placa]);

    if (resIngresoActivo.rows.length > 0) {
      throw new Error(`Acceso Denegado: El vehículo con placa ${placa} ya se encuentra dentro del parqueadero.`);
    }

    // 2. Validar capacidad máxima según el tipo de vehículo
    const limiteMaximo = tipoVehiculo === 'CARRO' ? 80 : 10;
    const queryOcupacion = `
      SELECT COUNT(*) FROM celda 
      WHERE tipo_vehiculo = $1 AND estado = 'OCUPADA';
    `;
    const resOcupacion = await client.query(queryOcupacion, [tipoVehiculo]);
    const ocupadasActuales = parseInt(resOcupacion.rows[0].count, 10);

    if (ocupadasActuales >= limiteMaximo) {
      throw new Error(`Acceso Denegado: Capacidad máxima de ${tipoVehiculo.toLowerCase()}s alcanzada (${limiteMaximo}/${limiteMaximo}).`);
    }

    // 3. Buscar la primera celda disponible
    const queryCeldaLibre = `
      SELECT id_celda, numero_celda FROM celda 
      WHERE tipo_vehiculo = $1 AND estado = 'DISPONIBLE' 
      ORDER BY id_celda ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
    `;
    const resCelda = await client.query(queryCeldaLibre, [tipoVehiculo]);

    if (resCelda.rows.length === 0) {
      throw new Error(`No hay celdas disponibles para ${tipoVehiculo.toLowerCase()}s en este momento.`);
    }

    const celdaAsignada = resCelda.rows[0];

    // 4. Cambiar estado de celda a 'OCUPADA' e insertar el registro de acceso
    await client.query(`UPDATE celda SET estado = 'OCUPADA' WHERE id_celda = $1;`, [celdaAsignada.id_celda]);
    await client.query(
      `INSERT INTO registro_acceso (placa, id_celda) VALUES ($1, $2);`,
      [placa, celdaAsignada.id_celda]
    );
    await client.query('COMMIT');

    return {
      mensaje: '¡Ingreso Autorizado!',
      placa,
      tipoVehiculo,
      celdaAsignada: celdaAsignada.numero_celda,
      fechaHoraEntrada: new Date()
    };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') {
        throw new Error(`Acceso denegado: la placa ${placa} ya tiene un ingreso activo.`);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================
  // MÉTODO DE SALIDA DE VEHÍCULO
  // ==========================================
  public async registrarSalida(placaBruta: string): Promise<RespuestaAcceso> {
    const placa = placaBruta.trim().toUpperCase();

    // 1. Buscar si el vehículo tiene un ingreso activo (sin fecha de salida)
    const queryIngreso = `
      SELECT ra.id_registro, ra.id_celda, c.numero_celda, ra.fecha_hora_entrada, v.tipo_vehiculo
      FROM registro_acceso ra
      JOIN celda c ON ra.id_celda = c.id_celda
      JOIN vehiculo v ON ra.placa = v.placa
      WHERE ra.placa = $1 AND ra.fecha_hora_salida IS NULL;
    `;
    const resIngreso = await pool.query(queryIngreso, [placa]);

    if (resIngreso.rows.length === 0) {
      throw new Error(`El vehículo con placa ${placa} no registra un ingreso activo en el parqueadero.`);
    }

    const { id_registro, id_celda, numero_celda, fecha_hora_entrada, tipo_vehiculo } = resIngreso.rows[0];
    const fechaHoraSalida = new Date();

    // 2. Registrar la hora de salida en la tabla registro_acceso
    const queryActualizarSalida = `
      UPDATE registro_acceso
      SET fecha_hora_salida = $1
      WHERE id_registro = $2;
    `;
    await pool.query(queryActualizarSalida, [fechaHoraSalida, id_registro]);

    // 3. Liberar la celda en la tabla celda (Volver a ponerla DISPONIBLE)
    const queryLiberarCelda = `
      UPDATE celda
      SET estado = 'DISPONIBLE'
      WHERE id_celda = $1;
    `;
    await pool.query(queryLiberarCelda, [id_celda]);

    return {
      mensaje: '¡Salida Registrada Exitosamente!',
      placa,
      tipoVehiculo: tipo_vehiculo,
      celdaAsignada: numero_celda,
      fechaHoraEntrada: fecha_hora_entrada,
      fechaHoraSalida
    };
  }

  // Consultar estado de ocupación y vehículos dentro del parqueadero
  public async obtenerOcupacion() {
    // 1. Contar celdas ocupadas por tipo
    const queryConteo = `
      SELECT 
        tipo_vehiculo,
        COUNT(CASE WHEN estado = 'OCUPADA' THEN 1 END) as ocupadas,
        COUNT(CASE WHEN estado = 'DISPONIBLE' THEN 1 END) as disponibles,
        COUNT(*) as total
      FROM celda
      GROUP BY tipo_vehiculo;
    `;
    const resConteo = await pool.query(queryConteo);

    // 2. Obtener lista de vehículos que están dentro actualmente (fecha_hora_salida IS NULL)
    const queryVehiculosDentro = `
      SELECT 
        ra.placa, 
        v.tipo_vehiculo, 
        c.numero_celda, 
        ra.fecha_hora_entrada
      FROM registro_acceso ra
      JOIN celda c ON ra.id_celda = c.id_celda
      JOIN vehiculo v ON ra.placa = v.placa
      WHERE ra.fecha_hora_salida IS NULL
      ORDER BY ra.fecha_hora_entrada DESC;
    `;
    const resVehiculos = await pool.query(queryVehiculosDentro);

    return {
      resumenCeldas: resConteo.rows,
      vehiculosActivos: resVehiculos.rows
    };
  }

  // Registrar nuevo usuario y su vehículo con mensualidad ACTIVA
  public async registrarVehiculoMensualidad(datos: {
    cedula: number;
    nombre: string;
    placa: string;
    tipoVehiculo: 'CARRO' | 'MOTO';
  }) {
    const placa = datos.placa.trim().toUpperCase();

    // Validar formato completo (longitud + terminación según el tipo)
    this.validarTipoPlaca(placa, datos.tipoVehiculo);

    const client = await pool.connect();
    try {
    await client.query('BEGIN');

    // Serializa matrículas simultáneas de una misma placa, incluso si todavía no existe una fila que bloquear.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [placa]);

    // Una placa solo se puede matricular una vez.
    const vehiculoExistente = await client.query(
      'SELECT 1 FROM vehiculo WHERE placa = $1 FOR UPDATE;',
      [placa]
    );
    if (vehiculoExistente.rows.length > 0) {
      throw new Error(`La placa ${placa} ya está matriculada.`);
    }

    // 1. Asignamos $1 para id_usuario, $2 para cedula y $3 para nombre
    const queryUsuario = `
      INSERT INTO usuario (id_usuario, cedula, nombre, mensualidad_activa)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (id_usuario) DO UPDATE 
      SET nombre = $3, mensualidad_activa = true
      RETURNING id_usuario;
    `;
    await client.query(queryUsuario, [datos.cedula, datos.cedula, datos.nombre]);

    // 2. Insertar o actualizar el vehículo asociando el usuario
    const queryVehiculo = `
      INSERT INTO vehiculo (placa, tipo_vehiculo, id_usuario)
      VALUES ($1, $2, $3)
    `;
    await client.query(queryVehiculo, [placa, datos.tipoVehiculo, datos.cedula]);
    await client.query('COMMIT');

    return {
      mensaje: `¡Vehículo ${placa} y cliente ${datos.nombre} matriculados exitosamente con mensualidad ACTIVA!`,
      placa,
      propietario: datos.nombre
    };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') {
        throw new Error(`La placa ${placa} ya está matriculada.`);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  // 🔴 VALIDACIÓN COMBINADA: Longitud máxima + Formato según tipo de vehículo
  public validarTipoPlaca(placa: string, tipoVehiculo: string): void {
    const placaLimpia = placa.trim().toUpperCase();

    // Regla 1: Longitud máxima de 6 caracteres
    if (placaLimpia.length > 6) {
      throw new Error('La placa no puede tener más de 6 caracteres.');
    }

    // Regla 2: Formato según el tipo de vehículo
    const ultimoCaracter = placaLimpia.slice(-1);
    const esNumero = !isNaN(Number(ultimoCaracter));

    if (tipoVehiculo === 'CARRO' && !esNumero) {
      throw new Error('La placa de un carro debe terminar en un número (Ej: AAA123).');
    }

    if (tipoVehiculo === 'MOTO' && esNumero) {
      throw new Error('La placa de una moto debe terminar en una letra (Ej: BBB05F).');
    }
  }
}
