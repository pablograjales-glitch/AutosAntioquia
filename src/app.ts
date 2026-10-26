import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path'; // 👈 Asegúrate de importar path
import { AccesoController } from './controllers/accesoControllers';
import { pool } from './config/db';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Servir la carpeta public usando la ruta absoluta desde la raíz
app.use(express.static(path.resolve(__dirname, '../public')));

// Instancia del controlador
const accesoController = new AccesoController();

// Rutas de la API
app.post('/api/acceso/entrada', (req, res) => accesoController.registrarEntrada(req, res));
app.post('/api/acceso/salida', (req, res) => accesoController.registrarSalida(req, res));
app.get('/api/acceso/ocupacion', (req, res) => accesoController.obtenerOcupacion(req, res));
app.post('/api/vehiculo', (req, res) => accesoController.registrarVehiculoMensualidad(req, res));
// Inicio del servidor
app.listen(PORT, () => {
  pool.query('SELECT current_database() AS database_name')
    .then(({ rows }) => console.log(`Base de datos conectada: ${rows[0].database_name}`))
    .catch(error => console.error('No se pudo confirmar la base de datos:', error.message));
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});
