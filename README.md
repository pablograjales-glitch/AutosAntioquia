# Autos Antioquia

Sistema web para apoyar la operación diaria de un parqueadero por mensualidad. Conserva las funciones desarrolladas en la Iteración 1 (registro de entradas y salidas, mensualidades, vencimiento, ocupación y asignación aleatoria) y amplía el sistema para Iteración 2 con gestión de cuentas, perfiles de administrador y operador, clientes y celdas.

## Tecnologías

- Node.js, TypeScript, Express y PostgreSQL
- Interfaz web en HTML, CSS y JavaScript

## Inicio local

1. Instala dependencias con `npm install`.
2. Copia `.env.example` como `.env` y configura la conexión PostgreSQL.
3. Para una base nueva, ejecuta `database/schema.sql`, que crea el esquema y carga las celdas iniciales.
4. Para la base existente de Iteración 1, ejecuta en orden las migraciones `001_prevent_duplicate_active_entries.sql`, `002_monthly_due_date.sql`, `003_cell_maintenance.sql`, `004_access_accounts_roles.sql` y `005_access_operator_audit.sql`.
5. Crea el primer administrador de manera interactiva: `npm run create-admin`. La contraseña se solicita enmascarada y no se almacena en texto plano.
6. Inicia la aplicación con `npm run start` y abre `http://localhost:3000`.
7. Inicia sesión como administrador y crea la cuenta de operador (usuario, contraseña y perfil). El administrador y el operador pueden matricular clientes/vehículos nuevos y operar entradas/salidas con sus propias credenciales. Así el administrador puede cubrir portería cuando el operador no está, sin compartir cuentas.

Las sesiones vencen después de ocho horas. Las cuentas internas (`cuenta_acceso`) están separadas de los clientes con mensualidad (`usuario`). Operador y administrador pueden cubrir matrícula y portería usando su propia cuenta. Las matrículas, entradas y salidas guardan el ID de quien las ejecutó. El administrador además gestiona cuentas, clientes y celdas, y es el único que renueva o desactiva mensualidades; cada cambio exige su contraseña.

## Pruebas de interfaz con Playwright

Con el servidor en `http://localhost:3000`, ejecuta `npm run test:e2e`. Los recorridos automatizados simulan las respuestas de la API: verifican visibilidad por rol, matrícula, entrada/salida, confirmación con contraseña y mensajes de diagnóstico sin modificar datos de PostgreSQL. En Windows usan Microsoft Edge instalado. El reporte muestra errores con una solución sugerida y conserva capturas/trazas de fallos en `test-results/`.

Para ejecutar solo los 11 casos sencillos incluidos en el informe, usa `npm run test:e2e:practico`. El informe con una captura por caso está en `Documentación/Iteración 2/Plan_Pruebas_Practico_Iteracion_2.pdf`; las respuestas de API son simuladas, así que estos recorridos verifican la interfaz y no sustituyen las pruebas de persistencia en PostgreSQL.

## Estructura

- `src/app.ts`: rutas y servidor Express.
- `src/controllers/`: controladores HTTP.
- `src/services/`: reglas de acceso, autenticación y gestión.
- `src/middleware/auth.ts`: autenticación y permisos por rol.
- `public/`: interfaz web.
- `database/schema.sql` y `database/migrations/`: modelo físico y actualizaciones.
- `Documentación/`: entregables y diagramas.

La capa de persistencia utiliza `pg.Pool` y SQL desde los servicios; el proyecto no implementa una capa Repository. El registro contable de pagos no está incluido en las iteraciones descritas.
