import { NextFunction, Request, Response } from 'express';
import { AuthService, RolAcceso, UsuarioAutenticado } from '../services/authService';

declare global {
  namespace Express {
    interface Request { usuarioAutenticado?: UsuarioAutenticado; }
  }
}

const authService = new AuthService();

export async function autenticar(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.header('authorization') || '';
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{40,})$/i);
  if (!match) { res.status(401).json({ error: 'Autenticación requerida.' }); return; }
  try {
    const usuario = await authService.validarToken(match[1]);
    if (!usuario) { res.status(401).json({ error: 'La sesión no es válida o ha expirado.' }); return; }
    req.usuarioAutenticado = usuario;
    next();
  } catch (error) { next(error); }
}

export function exigirRol(...roles: RolAcceso[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.usuarioAutenticado) { res.status(401).json({ error: 'Autenticación requerida.' }); return; }
    if (!roles.includes(req.usuarioAutenticado.rol)) { res.status(403).json({ error: 'No tiene permisos para realizar esta operación.' }); return; }
    next();
  };
}
