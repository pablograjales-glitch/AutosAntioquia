import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { pool } from '../config/db';

export type RolAcceso = 'ADMINISTRADOR' | 'OPERADOR';

export interface UsuarioAutenticado {
  idCuenta: string;
  nombreUsuario: string;
  nombreCompleto: string;
  rol: RolAcceso;
  idOperador?: string;
  cedulaOperador?: string;
  tokenHash: string;
}

export class ErrorHttp extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

const HORAS_SESION = 8;
const HASH_BYTES = 64;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function validarClave(clave: string): void {
  if (clave.length < 8 || clave.length > 128) {
    throw new ErrorHttp('La contraseña debe tener entre 8 y 128 caracteres.', 422);
  }
}

export class AuthService {
  async verificarClaveAdministrador(idCuenta: string, password: string): Promise<boolean> {
    if (password.length > 128) return false;
    const { rows } = await pool.query(`
      SELECT password_hash, password_salt
      FROM cuenta_acceso
      WHERE id_cuenta = $1 AND rol = 'ADMINISTRADOR' AND activo = TRUE;
    `, [idCuenta]);
    if (!rows.length) return false;
    const hashGuardado = Buffer.from(rows[0].password_hash, 'hex');
    const hashIngresado = scryptSync(password, Buffer.from(rows[0].password_salt, 'hex'), HASH_BYTES);
    return hashGuardado.length === hashIngresado.length && timingSafeEqual(hashGuardado, hashIngresado);
  }

  async crearCuenta(datos: {
    nombreUsuario: string; nombreCompleto: string; password: string;
    rol: string; cedula?: string; nombreOperador?: string;
  }) {
    const nombreUsuario = datos.nombreUsuario.trim().toLowerCase();
    const nombreCompleto = datos.nombreCompleto.trim();
    const rol = datos.rol as RolAcceso;
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(nombreUsuario)) {
      throw new ErrorHttp('El usuario debe tener 3 a 32 caracteres: letras, números, punto, guion o guion bajo.', 422);
    }
    if (!nombreCompleto || nombreCompleto.length > 120) {
      throw new ErrorHttp('El nombre completo es obligatorio y admite hasta 120 caracteres.', 422);
    }
    validarClave(datos.password);
    if (!['ADMINISTRADOR', 'OPERADOR'].includes(rol)) {
      throw new ErrorHttp('Rol inválido. Use ADMINISTRADOR u OPERADOR.', 422);
    }
    const cedula = datos.cedula?.trim();
    const nombreOperador = (datos.nombreOperador || nombreCompleto).trim();
    if (rol === 'OPERADOR' && (!cedula || !/^\d{5,15}$/.test(cedula) || !nombreOperador || nombreOperador.length > 120)) {
      throw new ErrorHttp('Para crear un operador, indique una cédula válida y su nombre.', 422);
    }

    const salt = randomBytes(16);
    const passwordHash = scryptSync(datos.password, salt, HASH_BYTES).toString('hex');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        INSERT INTO cuenta_acceso (nombre_usuario, nombre_completo, password_hash, password_salt, rol)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id_cuenta, nombre_usuario, nombre_completo, rol, activo, fecha_creacion;
      `, [nombreUsuario, nombreCompleto, passwordHash, salt.toString('hex'), rol]);
      const cuenta = rows[0];
      let operador = null;
      if (rol === 'OPERADOR') {
        const perfil = await client.query(`
          INSERT INTO operador (id_cuenta, cedula, nombre)
          VALUES ($1, $2, $3)
          RETURNING id_operador, cedula, nombre, activo;
        `, [cuenta.id_cuenta, cedula, nombreOperador]);
        operador = perfil.rows[0];
      }
      await client.query('COMMIT');
      return { ...cuenta, operador };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') {
        throw new ErrorHttp('El nombre de usuario o la cédula del operador ya está registrado.', 409);
      }
      throw error;
    } finally { client.release(); }
  }

  async listarCuentas(busqueda = '') {
    const filtro = `%${busqueda.trim().toLowerCase()}%`;
    const { rows } = await pool.query(`
      SELECT ca.id_cuenta, ca.nombre_usuario, ca.nombre_completo, ca.rol, ca.activo,
             ca.fecha_creacion, op.id_operador, op.cedula AS cedula_operador,
             op.nombre AS nombre_operador
      FROM cuenta_acceso ca LEFT JOIN operador op ON op.id_cuenta = ca.id_cuenta
      WHERE $1 = '%%' OR ca.nombre_usuario LIKE $1 OR lower(ca.nombre_completo) LIKE $1
         OR COALESCE(op.cedula, '') LIKE $1 OR COALESCE(lower(op.nombre), '') LIKE $1
      ORDER BY ca.rol, ca.nombre_usuario;
    `, [filtro]);
    return rows;
  }

  async iniciarSesion(nombreUsuarioBruto: string, password: string) {
    const nombreUsuario = nombreUsuarioBruto.trim().toLowerCase();
    // Keep the same response for unknown users while avoiding expensive hashes for oversized input.
    if (password.length > 128) throw new ErrorHttp('Usuario o contraseña incorrectos.', 401);
    const { rows } = await pool.query(`
      SELECT ca.id_cuenta, ca.nombre_usuario, ca.nombre_completo, ca.password_hash,
             ca.password_salt, ca.rol, ca.activo, op.id_operador, op.cedula AS cedula_operador
      FROM cuenta_acceso ca LEFT JOIN operador op ON op.id_cuenta = ca.id_cuenta
      WHERE ca.nombre_usuario = $1;
    `, [nombreUsuario]);
    const cuenta = rows[0];
    scryptSync(password || 'invalid', 'autos-antioquia-invalid-salt', HASH_BYTES);
    if (!cuenta || !cuenta.activo || (cuenta.rol === 'OPERADOR' && !cuenta.id_operador)) {
      throw new ErrorHttp('Usuario o contraseña incorrectos.', 401);
    }
    const hashGuardado = Buffer.from(cuenta.password_hash, 'hex');
    const hashIngresado = scryptSync(password, Buffer.from(cuenta.password_salt, 'hex'), HASH_BYTES);
    if (hashGuardado.length !== hashIngresado.length || !timingSafeEqual(hashGuardado, hashIngresado)) {
      throw new ErrorHttp('Usuario o contraseña incorrectos.', 401);
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    await pool.query(`
      INSERT INTO sesion_acceso (token_hash, id_cuenta, expira_en)
      VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 hour'));
    `, [tokenHash, cuenta.id_cuenta, HORAS_SESION]);
    return {
      token,
      expiraEnHoras: HORAS_SESION,
      usuario: {
        idCuenta: cuenta.id_cuenta,
        nombreUsuario: cuenta.nombre_usuario,
        nombreCompleto: cuenta.nombre_completo,
        rol: cuenta.rol as RolAcceso
      }
    };
  }

  async validarToken(token: string): Promise<UsuarioAutenticado | null> {
    const tokenHash = hashToken(token);
    const { rows } = await pool.query(`
      SELECT ca.id_cuenta, ca.nombre_usuario, ca.nombre_completo, ca.rol,
             op.id_operador, op.cedula AS cedula_operador, sa.token_hash
      FROM sesion_acceso sa
      JOIN cuenta_acceso ca ON ca.id_cuenta = sa.id_cuenta
      LEFT JOIN operador op ON op.id_cuenta = ca.id_cuenta
      WHERE sa.token_hash = $1 AND sa.revocada_en IS NULL AND sa.expira_en > CURRENT_TIMESTAMP
        AND ca.activo = TRUE AND (ca.rol <> 'OPERADOR' OR (op.id_operador IS NOT NULL AND op.activo = TRUE));
    `, [tokenHash]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      idCuenta: r.id_cuenta,
      nombreUsuario: r.nombre_usuario,
      nombreCompleto: r.nombre_completo,
      rol: r.rol,
      idOperador: r.id_operador || undefined,
      cedulaOperador: r.cedula_operador || undefined,
      tokenHash: r.token_hash
    };
  }

  async cerrarSesion(tokenHash: string): Promise<void> {
    await pool.query('UPDATE sesion_acceso SET revocada_en = CURRENT_TIMESTAMP WHERE token_hash = $1 AND revocada_en IS NULL;', [tokenHash]);
  }
}
