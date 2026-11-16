import { Request, Response } from 'express';
import { AccesoService } from '../services/accesoService';
import { GestionService } from '../services/gestionService';
import { AuthService, ErrorHttp } from '../services/authService';

// Instanciamos el servicio que contiene la lógica
const accesoService = new AccesoService();
const gestionService = new GestionService();
const authService = new AuthService();

export class AccesoController {
  public async registrarEntrada(req: Request, res: Response): Promise<void> {
    try {
      const { placa, tipoVehiculo } = req.body;

      // Validar que vengan los parámetros obligatorios
      if (!placa || !tipoVehiculo) {
        res.status(400).json({
          error: 'Petición incompleta. Se requiere "placa" y "tipoVehiculo".'
        });
        return;
      }

      // Ejecutar la lógica de negocio en el servicio
      const idCuenta = req.usuarioAutenticado?.idCuenta;
      if (!idCuenta) { res.status(401).json({ error: 'Se requiere una cuenta autenticada para registrar la entrada.' }); return; }
      const resultado = await accesoService.registrarEntrada(placa, tipoVehiculo, idCuenta);

      // Responder con código 200 (Éxito)
      res.status(200).json(resultado);
    } catch (error: any) {
      // Si la mensualidad está vencida o el aforo está lleno, atrapamos el error aquí
      if (error?.code) {
        console.error('[POST /api/acceso/entrada] Error de PostgreSQL', {
          code: error.code,
          message: error.message,
          detail: error.detail,
          hint: error.hint,
          where: error.where,
          table: error.table,
          column: error.column,
          constraint: error.constraint
        });
        res.status(500).json({ error: `No fue posible registrar la entrada por un error interno (código ${error.code}).` });
        return;
      }
      res.status(400).json({
        error: error.message || 'Error interno al registrar el acceso.'
      });
    }
  }
public async registrarSalida(req: Request, res: Response): Promise<void> {
  try {
    // 1. Extraemos solo la placa del cuerpo de la petición
    const { placa } = req.body;

    // 2. Validamos que el cliente haya enviado la placa
    if (!placa) {
      res.status(400).json({
        error: 'Petición incompleta. Se requiere la "placa".'
      });
      return;
    }

    // 3. Llamamos a la lógica de negocio en el servicio
    const idCuenta = req.usuarioAutenticado?.idCuenta;
    if (!idCuenta) { res.status(401).json({ error: 'Se requiere una cuenta autenticada para registrar la salida.' }); return; }
    const resultado = await accesoService.registrarSalida(placa, idCuenta);

    // 4. Respondemos con éxito (200 OK) y los datos de la salida
    res.status(200).json(resultado);
  } catch (error: any) {
    // 5. Si la placa no tiene un ingreso activo, atrapamos el error aquí
    res.status(400).json({
      error: error.message || 'Error interno al registrar la salida.'
    });
  }
}
public async obtenerOcupacion(req: Request, res: Response): Promise<void> {
  try {
    const estado = await accesoService.obtenerOcupacion();
    res.status(200).json(estado);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Error al obtener la ocupación del parqueadero.'
    });
  }
}
public async registrarVehiculoMensualidad(req: Request, res: Response): Promise<void> {
  try {
    const { cedula, nombre, placa, tipoVehiculo } = req.body;

    if (!cedula || !nombre || !placa || !tipoVehiculo) {
      res.status(400).json({ error: 'Todos los campos (cedula, nombre, placa, tipoVehiculo) son obligatorios.' });
      return;
    }

    const resultado = await accesoService.registrarVehiculoMensualidad({
      cedula: String(cedula).trim(),
      nombre,
      placa,
      tipoVehiculo,
      idCuenta: req.usuarioAutenticado!.idCuenta
    });

    res.status(201).json(resultado);
  } catch (error: any) {
    res.status(400).json({
      error: error.message || 'Error al registrar la mensualidad del vehículo.'
    });
  }
}

public async listarCuentasClientes(req: Request, res: Response): Promise<void> {
  try { res.status(200).json(await gestionService.listarUsuarios()); }
  catch (error: any) { res.status(500).json({ error: error.message || 'Error al consultar clientes.' }); }
}

public async crearCuentaCliente(req: Request, res: Response): Promise<void> {
  try {
    const { cedula, nombre } = req.body || {};
    if (!cedula || !nombre) { res.status(422).json({ error: 'Cédula y nombre son obligatorios.' }); return; }
    res.status(201).json(await gestionService.crearUsuario({ cedula: String(cedula), nombre }));
  } catch (error: any) {
    const status = error instanceof ErrorHttp ? error.status : 400;
    res.status(status).json({ error: error.message || 'Error al crear el cliente.' });
  }
}

public async actualizarCuentaCliente(req: Request, res: Response): Promise<void> {
  try {
    const { nombre } = req.body || {};
    if (!nombre) { res.status(422).json({ error: 'El nombre es obligatorio.' }); return; }
    res.status(200).json(await gestionService.actualizarNombre(String(req.params.cedula), nombre));
  } catch (error: any) {
    const status = error instanceof ErrorHttp ? error.status : 400;
    res.status(status).json({ error: error.message || 'Error al actualizar el cliente.' });
  }
}

public async actualizarMensualidad(req: Request, res: Response): Promise<void> {
  try {
    if (typeof req.body?.activa !== 'boolean') { res.status(422).json({ error: 'El campo activa debe ser booleano.' }); return; }
    if (typeof req.body.passwordAdministrador !== 'string' || !req.usuarioAutenticado?.idCuenta) {
      res.status(422).json({ error: 'Se requiere la contraseña del administrador para confirmar el cambio de mensualidad.' }); return;
    }
    const claveValida = await authService.verificarClaveAdministrador(req.usuarioAutenticado.idCuenta, req.body.passwordAdministrador);
    if (!claveValida) { res.status(403).json({ error: 'La contraseña de administrador es incorrecta. No se cambió la mensualidad.' }); return; }
    res.status(200).json(await gestionService.actualizarMensualidad(String(req.params.cedula), req.body.activa));
  } catch (error: any) {
    const status = error instanceof ErrorHttp ? error.status : 400;
    res.status(status).json({ error: error.message || 'Error al actualizar la mensualidad.' });
  }
}

public async listarCeldas(req: Request, res: Response): Promise<void> {
  try {
    const { q, tipo, estado } = req.query;
    res.status(200).json(await gestionService.listarCeldas({ q: String(q || ''), tipo: tipo ? String(tipo) : undefined, estado: estado ? String(estado) : undefined }));
  } catch (error: any) {
    const status = error instanceof ErrorHttp ? error.status : 500;
    res.status(status).json({ error: error.message || 'Error al consultar celdas.' });
  }
}

public async listarCeldasDisponibles(req: Request, res: Response): Promise<void> {
  try { res.status(200).json(await gestionService.listarCeldasDisponibles(req.query.tipo ? String(req.query.tipo) : undefined)); }
  catch (error: any) { res.status(error instanceof ErrorHttp ? error.status : 500).json({ error: error.message || 'Error al consultar disponibilidad.' }); }
}

public async obtenerCelda(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(422).json({ error: 'Identificador de celda inválido.' }); return; }
  try { res.status(200).json(await gestionService.obtenerCelda(id)); }
  catch (error: any) { res.status(error instanceof ErrorHttp ? error.status : 500).json({ error: error.message || 'Error al consultar la celda.' }); }
}

public async crearCelda(req: Request, res: Response): Promise<void> {
  try {
    const { numeroCelda, tipoVehiculo } = req.body || {};
    if (typeof numeroCelda !== 'string' || typeof tipoVehiculo !== 'string') { res.status(422).json({ error: 'Código y tipo de celda son obligatorios.' }); return; }
    res.status(201).json(await gestionService.crearCelda({ numeroCelda, tipoVehiculo }));
  } catch (error: any) { res.status(error instanceof ErrorHttp ? error.status : 500).json({ error: error.message || 'Error al crear la celda.' }); }
}

public async editarCelda(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(422).json({ error: 'Identificador de celda inválido.' }); return; }
  try {
    const { numeroCelda, tipoVehiculo } = req.body || {};
    if (typeof numeroCelda !== 'string' || typeof tipoVehiculo !== 'string') { res.status(422).json({ error: 'Código y tipo de celda son obligatorios.' }); return; }
    res.status(200).json(await gestionService.editarCelda(id, { numeroCelda, tipoVehiculo }));
  } catch (error: any) { res.status(error instanceof ErrorHttp ? error.status : 500).json({ error: error.message || 'Error al editar la celda.' }); }
}

public async eliminarCelda(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(422).json({ error: 'Identificador de celda inválido.' }); return; }
  try { await gestionService.eliminarCelda(id); res.status(204).end(); }
  catch (error: any) { res.status(error instanceof ErrorHttp ? error.status : 500).json({ error: error.message || 'Error al eliminar la celda.' }); }
}

public async actualizarEstadoCelda(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(422).json({ error: 'Identificador de celda inválido.' }); return; }
  try {
    const { estado } = req.body || {};
    res.status(200).json(await gestionService.actualizarEstadoCelda(id, estado));
  } catch (error: any) {
    res.status(error instanceof ErrorHttp ? error.status : 500).json({ error: error.message || 'Error al actualizar el estado de la celda.' });
  }
}

}  

