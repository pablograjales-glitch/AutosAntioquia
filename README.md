# Autos Antioquia

Sistema web para apoyar la operación diaria de un parqueadero por mensualidad. La aplicación permite registrar vehículos, controlar entradas y salidas, consultar la ocupación de las celdas y revisar los vehículos activos en el parqueadero.

## Tecnologías

- Node.js y TypeScript
- Express
- PostgreSQL
- HTML, CSS y JavaScript

## Requisitos

- Node.js y npm
- PostgreSQL con el esquema definido en los modelos de la carpeta `Documentación`

## Configuración local

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Crea `.env` a partir de `.env.example` y completa los datos de conexión a PostgreSQL.

3. Ejecuta la aplicación desde la raíz del proyecto:

   ```bash
   npx tsx src/app.ts
   ```

4. Abre `http://localhost:3000` en el navegador.

La migración `database/migrations/001_prevent_duplicate_active_entries.sql` limpia entradas activas duplicadas y agrega una restricción para impedir más de un ingreso activo por placa. Ejecútala sobre la base configurada después de crear el esquema.

## Estructura

- `src/`: API, controladores, servicios y conexión a PostgreSQL.
- `public/`: interfaz web.
- `database/migrations/`: migraciones SQL.
- `Documentación/`: informe, requerimientos, historias de usuario, modelos, diagramas de StarUML y mockups.

## Documentación de la Iteración 1

La carpeta `Documentación/` contiene el informe técnico, los requisitos e historias de usuario, el modelo relacional, el MER, diagramas editables de StarUML y mockups de la interfaz.
