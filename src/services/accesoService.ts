import { pool } from '../config/db';
import { TipoVehiculo, RespuestaAcceso } from '../models/types';

function normalizarFechaSql(valor: unknown): string | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  }
  if (typeof valor !== 'string') return null;
  return valor.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

export class AccesoService {
  public async registrarEntrada(placaBruta: string, tipoVehiculo: TipoVehiculo, idCuenta: string): Promise<RespuestaAcceso> {
    // 0. Estandarización de la placa (Limpieza de espacios y mayúsculas)
    const placa = placaBruta.trim().toUpperCase();

    // Validar formato completo (longitud + terminación según el tipo)
    this.validarTipoPlaca(placa, tipoVehiculo);

    // 1. Validar si el vehículo existe y si el usuario tiene la mensualidad activa
    const client = await pool.connect();
    try {
    await client.query('BEGIN');
    const queryVehiculo = `
      SELECT v.placa, u.mensualidad_activa, u.fecha_vencimiento_mensualidad
      FROM vehiculo v
      JOIN usuario u ON v.id_usuario = u.id_usuario
      WHERE v.placa = $1
      FOR UPDATE OF v;
    `;
    const resVehiculo = await client.query(queryVehiculo, [placa]);

    if (resVehiculo.rows.length === 0) {
      throw new Error(`El vehículo con placa ${placa} no se encuentra registrado en el sistema.`);
    }

    const mensualidadActiva = resVehiculo.rows[0].mensualidad_activa;
    const vencimiento = resVehiculo.rows[0].fecha_vencimiento_mensualidad;
    const fechaHoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const fechaVencimiento = normalizarFechaSql(vencimiento);
    const fecha = fechaVencimiento
      ? `${fechaVencimiento.slice(8, 10)}/${fechaVencimiento.slice(5, 7)}/${fechaVencimiento.slice(0, 4)}`
      : 'no registrada';
    if (!mensualidadActiva) {
      throw new Error(`Acceso Denegado: La mensualidad para la placa ${placa} está inactiva. Fecha de vencimiento registrada: ${fecha}.`);
    }
    if (!fechaVencimiento) {
      throw new Error(`Acceso Denegado: La mensualidad para la placa ${placa} no tiene una fecha de vencimiento válida.`);
    }
    if (fechaVencimiento < fechaHoy) {
      throw new Error(`Acceso Denegado: La mensualidad para la placa ${placa} está vencida. Fecha de vencimiento: ${fecha}.`);
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

    // 3. Seleccionar aleatoriamente una celda disponible
    const queryCeldaLibre = `
      SELECT id_celda, numero_celda FROM celda 
      WHERE tipo_vehiculo = $1 AND estado = 'DISPONIBLE'
        AND NOT EXISTS (
          SELECT 1 FROM registro_acceso ra
          WHERE ra.id_celda = celda.id_celda AND ra.fecha_hora_salida IS NULL
        )
      ORDER BY random() LIMIT 1 FOR UPDATE SKIP LOCKED;
    `;
    const resCelda = await client.query(queryCeldaLibre, [tipoVehiculo]);

    if (resCelda.rows.length === 0) {
      throw new Error(`No hay celdas disponibles para ${tipoVehiculo.toLowerCase()}s en este momento.`);
    }

    const celdaAsignada = resCelda.rows[0];

    // 4. Cambiar estado de celda a 'OCUPADA' e insertar el registro de acceso
    await client.query(`UPDATE celda SET estado = 'OCUPADA' WHERE id_celda = $1;`, [celdaAsignada.id_celda]);
    await client.query(
      `INSERT INTO registro_acceso (placa, id_celda, id_cuenta_entrada) VALUES ($1, $2, $3);`,
      [placa, celdaAsignada.id_celda, idCuenta]
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
  public async registrarSalida(placaBruta: string, idCuenta: string): Promise<RespuestaAcceso> {
    const placa = placaBruta.trim().toUpperCase();
    const client = await pool.connect();
    try {
    await client.query('BEGIN');

    // 1. Buscar si el vehículo tiene un ingreso activo (sin fecha de salida)
    const queryIngreso = `
      SELECT ra.id_registro, ra.id_celda, c.numero_celda, ra.fecha_hora_entrada, v.tipo_vehiculo
      FROM registro_acceso ra
      JOIN celda c ON ra.id_celda = c.id_celda
      JOIN vehiculo v ON ra.placa = v.placa
      WHERE ra.placa = $1 AND ra.fecha_hora_salida IS NULL;
    `;
    const resIngreso = await client.query(`${queryIngreso.replace(';', '')} FOR UPDATE OF ra, c;`, [placa]);

    if (resIngreso.rows.length === 0) {
      throw new Error(`El vehículo con placa ${placa} no registra un ingreso activo en el parqueadero.`);
    }

    const { id_registro, id_celda, numero_celda, fecha_hora_entrada, tipo_vehiculo } = resIngreso.rows[0];
    const fechaHoraSalida = new Date();

    // 2. Registrar la hora de salida en la tabla registro_acceso
    const queryActualizarSalida = `
      UPDATE registro_acceso
      SET fecha_hora_salida = $1, id_cuenta_salida = $3
      WHERE id_registro = $2;
    `;
    await client.query(queryActualizarSalida, [fechaHoraSalida, id_registro, idCuenta]);

    // 3. Liberar la celda en la tabla celda (Volver a ponerla DISPONIBLE)
    const queryLiberarCelda = `
      UPDATE celda
      SET estado = 'DISPONIBLE'
      WHERE id_celda = $1;
    `;
    await client.query(queryLiberarCelda, [id_celda]);
    await client.query('COMMIT');

    return {
      mensaje: '¡Salida Registrada Exitosamente!',
      placa,
      tipoVehiculo: tipo_vehiculo,
      celdaAsignada: numero_celda,
      fechaHoraEntrada: fecha_hora_entrada,
      fechaHoraSalida
    };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Consultar estado de ocupación y vehículos dentro del parqueadero
  public async obtenerOcupacion() {
    // 1. Contar celdas ocupadas por tipo
    const queryConteo = `
      SELECT
        c.tipo_vehiculo,
        COUNT(*) FILTER (WHERE c.estado = 'OCUPADA' OR ra.id_registro IS NOT NULL) AS ocupadas,
        COUNT(*) FILTER (WHERE c.estado = 'DISPONIBLE' AND ra.id_registro IS NULL) AS disponibles,
        COUNT(*) AS total
      FROM celda c
      LEFT JOIN registro_acceso ra ON ra.id_celda = c.id_celda AND ra.fecha_hora_salida IS NULL
      GROUP BY c.tipo_vehiculo;
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
    cedula: string;
    nombre: string;
    placa: string;
    tipoVehiculo: 'CARRO' | 'MOTO';
    idCuenta: string;
  }) {
    const placa = datos.placa.trim().toUpperCase();

    // Validar formato completo (longitud + terminación según el tipo)
    this.validarTipoPlaca(placa, datos.tipoVehiculo);

    const client = await pool.connect();
    try {
    await client.query('BEGIN');

    // Serializa matrículas simultáneas de una misma placa, incluso si todavía no existe una fila que bloquear.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`cedula:${datos.cedula}`]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`placa:${placa}`]);

    // Una placa solo se puede matricular una vez.
    const vehiculoExistente = await client.query(
      'SELECT 1 FROM vehiculo WHERE placa = $1 FOR UPDATE;',
      [placa]
    );
    if (vehiculoExistente.rows.length > 0) {
      throw new Error(`La placa ${placa} ya está matriculada.`);
    }

    // 1. Buscar o crear el cliente. id_usuario lo genera la secuencia de la tabla.
    const usuarioExistente = await client.query(`
      SELECT id_usuario, nombre, mensualidad_activa,
             fecha_vencimiento_mensualidad >= CURRENT_DATE AS mensualidad_vigente
      FROM usuario WHERE cedula = $1 FOR UPDATE;
    `, [datos.cedula]);
    let propietario = datos.nombre.trim();
    let idUsuario: number;
    if (usuarioExistente.rows.length) {
      const usuario = usuarioExistente.rows[0];
      if (!usuario.mensualidad_activa || !usuario.mensualidad_vigente) {
        throw new Error('El cliente ya existe con mensualidad inactiva o vencida. Solo el administrador puede renovarla antes de matricular otro vehículo.');
      }
      propietario = usuario.nombre;
      idUsuario = usuario.id_usuario;
    } else {
      const nuevoUsuario = await client.query(`
        INSERT INTO usuario (cedula, nombre, mensualidad_activa, fecha_vencimiento_mensualidad)
        VALUES ($1, $2, true, CURRENT_DATE + INTERVAL '30 days')
        RETURNING id_usuario;
      `, [datos.cedula, propietario]);
      idUsuario = nuevoUsuario.rows[0].id_usuario;
    }

    // 2. Insertar o actualizar el vehículo asociando el usuario
    const queryVehiculo = `
      INSERT INTO vehiculo (placa, tipo_vehiculo, id_usuario, matriculado_por_cuenta)
      VALUES ($1, $2, $3, $4)
    `;
    await client.query(queryVehiculo, [placa, datos.tipoVehiculo, idUsuario, datos.idCuenta]);
    await client.query('COMMIT');

    return {
      mensaje: `¡Vehículo ${placa} y cliente ${datos.nombre} matriculados exitosamente con mensualidad ACTIVA!`,
      placa,
      propietario
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

    const formatos: Record<string, RegExp> = {
      CARRO: /^[A-Z]{3}[0-9]{3}$/,
      MOTO: /^[A-Z]{3}[0-9]{2}[A-Z]$/
    };
    if (!formatos[tipoVehiculo] || !formatos[tipoVehiculo].test(placaLimpia)) {
      throw new Error(tipoVehiculo === 'MOTO'
        ? 'La placa de una moto debe tener el formato AAA00A (Ej: BBB05F).'
        : 'La placa de un carro debe tener el formato AAA000 (Ej: AAA123).');
       }
  }
}
