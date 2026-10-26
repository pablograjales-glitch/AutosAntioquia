import { Request, Response } from 'express';
import { AccesoService } from '../services/accesoService';

// Instanciamos el servicio que contiene la lógica
const accesoService = new AccesoService();

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
      const resultado = await accesoService.registrarEntrada(placa, tipoVehiculo);

      // Responder con código 200 (Éxito)
      res.status(200).json(resultado);
    } catch (error: any) {
      // Si la mensualidad está vencida o el aforo está lleno, atrapamos el error aquí
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
    const resultado = await accesoService.registrarSalida(placa);

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
      cedula: Number(cedula),
      nombre,
      placa,
      tipoVehiculo
    });

    res.status(201).json(resultado);
  } catch (error: any) {
    res.status(400).json({
      error: error.message || 'Error al registrar la mensualidad del vehículo.'
    });
  }
}
}  

