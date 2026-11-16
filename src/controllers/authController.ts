import { Request, Response } from 'express';
import { AuthService, ErrorHttp } from '../services/authService';

const authService = new AuthService();

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { nombreUsuario, password } = req.body || {};
      if (typeof nombreUsuario !== 'string' || typeof password !== 'string' || !nombreUsuario || !password) {
        res.status(400).json({ error: 'Nombre de usuario y contraseña son obligatorios.' }); return;
      }
      res.status(200).json(await authService.iniciarSesion(nombreUsuario, password));
    } catch (error) {
      const status = error instanceof ErrorHttp ? error.status : 500;
      res.status(status).json({ error: error instanceof Error ? error.message : 'Error al iniciar sesión.' });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    const user = req.usuarioAutenticado;
    if (!user) { res.status(401).json({ error: 'Autenticación requerida.' }); return; }
    res.status(200).json({
      idCuenta: user.idCuenta, nombreUsuario: user.nombreUsuario,
      nombreCompleto: user.nombreCompleto, rol: user.rol
    });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const user = req.usuarioAutenticado;
    if (!user) { res.status(401).json({ error: 'Autenticación requerida.' }); return; }
    await authService.cerrarSesion(user.tokenHash);
    res.status(204).end();
  }

  async listarCuentas(req: Request, res: Response): Promise<void> {
    try { res.status(200).json(await authService.listarCuentas(String(req.query.q || ''))); }
    catch { res.status(500).json({ error: 'Error al consultar cuentas.' }); }
  }

  async crearCuenta(req: Request, res: Response): Promise<void> {
    try {
      const { nombreUsuario, nombreCompleto, password, rol, cedula, nombreOperador } = req.body || {};
      if ([nombreUsuario, nombreCompleto, password, rol].some(x => typeof x !== 'string' || !x.trim())) {
        res.status(422).json({ error: 'Usuario, nombre, contraseña y rol son obligatorios.' }); return;
      }
      const result = await authService.crearCuenta({ nombreUsuario, nombreCompleto, password, rol, cedula, nombreOperador });
      res.status(201).json(result);
    } catch (error) {
      const status = error instanceof ErrorHttp ? error.status : 500;
      res.status(status).json({ error: error instanceof Error ? error.message : 'Error al crear la cuenta.' });
    }
  }
}
