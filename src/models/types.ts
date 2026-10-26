export type TipoVehiculo = 'CARRO' | 'MOTO';

export interface SolicitudAcceso {
  placa: string;
  tipoVehiculo: TipoVehiculo;
}

export interface RespuestaAcceso {
  mensaje: string;
  placa: string;
  tipoVehiculo: TipoVehiculo;
  celdaAsignada: string;
  fechaHoraEntrada: Date;
  fechaHoraSalida?: Date; 
}