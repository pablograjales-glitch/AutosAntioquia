import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path'; // 👈 Asegúrate de importar path
import { AccesoController } from './controllers/accesoControllers';
import { AuthController } from './controllers/authController';
import { autenticar, exigirRol } from './middleware/auth';
import { pool } from './config/db';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '32kb' }));

// Servir la carpeta public usando la ruta absoluta desde la raíz
app.use(express.static(path.resolve(__dirname, '../public')));

// Instancia del controlador
const accesoController = new AccesoController();
const authController = new AuthController();
const soloAdmin = [autenticar, exigirRol('ADMINISTRADOR')];
const soloOperador = [autenticar, exigirRol('OPERADOR')];
const personalPorteria = [autenticar, exigirRol('ADMINISTRADOR', 'OPERADOR')];

// Autenticación y sesión
app.post('/api/auth/login', (req, res) => authController.login(req, res));
app.get('/api/auth/me', autenticar, (req, res) => authController.me(req, res));
app.post('/api/auth/logout', autenticar, (req, res) => authController.logout(req, res));

// El administrador administra cuentas, clientes y catálogo de celdas.
app.get('/api/usuarios', ...soloAdmin, (req, res) => authController.listarCuentas(req, res));
app.post('/api/usuarios', ...soloAdmin, (req, res) => authController.crearCuenta(req, res));
app.get('/api/clientes', ...soloAdmin, (req, res) => accesoController.listarCuentasClientes(req, res));
app.post('/api/clientes', ...soloAdmin, (req, res) => accesoController.crearCuentaCliente(req, res));
app.put('/api/clientes/:cedula', ...soloAdmin, (req, res) => accesoController.actualizarCuentaCliente(req, res));
app.patch('/api/clientes/:cedula/mensualidad', ...soloAdmin, (req, res) => accesoController.actualizarMensualidad(req, res));
app.post('/api/vehiculo', ...personalPorteria, (req, res) => accesoController.registrarVehiculoMensualidad(req, res));

// La consulta de disponibilidad no bloquea ni reserva una celda.
app.get('/api/celdas/disponibles', ...soloOperador, (req, res) => accesoController.listarCeldasDisponibles(req, res));
app.get('/api/celdas', ...soloAdmin, (req, res) => accesoController.listarCeldas(req, res));
app.get('/api/celdas/:id', ...soloAdmin, (req, res) => accesoController.obtenerCelda(req, res));
app.post('/api/celdas', ...soloAdmin, (req, res) => accesoController.crearCelda(req, res));
app.put('/api/celdas/:id', ...soloAdmin, (req, res) => accesoController.editarCelda(req, res));
app.delete('/api/celdas/:id', ...soloAdmin, (req, res) => accesoController.eliminarCelda(req, res));
app.patch('/api/celdas/:id', ...soloAdmin, (req, res) => accesoController.actualizarEstadoCelda(req, res));

// Portería y consulta de ocupación también están disponibles para el administrador que cubre al operador.
app.post('/api/acceso/entrada', ...personalPorteria, (req, res) => accesoController.registrarEntrada(req, res));
app.post('/api/acceso/salida', ...personalPorteria, (req, res) => accesoController.registrarSalida(req, res));
app.get('/api/acceso/ocupacion', ...personalPorteria, (req, res) => accesoController.obtenerOcupacion(req, res));
// Inicio del servidor
app.listen(PORT, () => {
  pool.query('SELECT current_database() AS database_name')
    .then(({ rows }) => console.log(`Base de datos conectada: ${rows[0].database_name}`))
    .catch(error => console.error('No se pudo confirmar la base de datos:', error.message));
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});
