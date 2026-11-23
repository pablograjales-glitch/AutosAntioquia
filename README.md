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

La capa de persistencia utiliza `pg.Pool` y SQL desde los servicios; el proyecto no implementa una capa Repository.

## Iteración 3 · Pagos académicos

1. Aplica `database/migrations/006_pagos.sql` después de las migraciones anteriores.
2. Configura `PAGOS_MODO=demo` y, si deseas cambiar la tarifa ficticia, `PAGOS_MONTO_COP=50000`. Reinicia el servidor.
3. Inicia sesión como administrador. En Clientes, abre **Pagos**, crea un pago de prueba y consulta el historial. El registro nace pendiente. Puedes simular aprobación o rechazo. Solo la aprobación renueva 30 días.

Para usar el sandbox de ePayco, configura `PAGOS_MODO=epayco`, las cuatro variables `EPAYCO_*` del ejemplo y una URL pública HTTPS en `PAGOS_URL_PUBLICA`. Habilita el modo de pruebas en la cuenta del comercio. El checkout abre con `test: true` y la confirmación se recibe en `/api/pagos/epayco/confirmacion`. Al volver a Clientes, abre Pagos para consultar el estado registrado. Las credenciales se cargan desde el servidor y deben quedar en el entorno local.

La entrega académica reúne el [informe PDF](Documentaci%C3%B3n/Iteraci%C3%B3n%203/Informe%20Iteraci%C3%B3n%203.pdf) y el [plan de pruebas con evidencias](Documentaci%C3%B3n/Iteraci%C3%B3n%203/Plan%20de%20pruebas.md). Las pruebas de la entrega se ejecutaron en modo demo. La verificación con ePayco queda como extensión.
