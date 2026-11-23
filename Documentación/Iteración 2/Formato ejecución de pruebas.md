# Pruebas de integración de la iteración 2

**Fecha de ejecución** 22 de noviembre de 2026, hora de Colombia

**Ejecución** Codex en el entorno local del proyecto

**Entorno** Express por HTTP y PostgreSQL 18.6 con un esquema temporal y datos ficticios

**Resultado** 7 de 7 casos aprobados

Desde la raíz del repositorio, con las dependencias instaladas y PostgreSQL configurado en `.env`, ejecutar:

```powershell
node scripts/verificar_iteracion2.mjs
```

El usuario configurado en PostgreSQL necesita permiso para crear esquemas. El script compila TypeScript, carga el esquema físico, arranca el servidor, envía solicitudes HTTP y consulta las tablas para comprobar qué se guardó. Al terminar, elimina el esquema temporal.

| Caso | Procedimiento y evidencia observada | Estado |
| --- | --- | --- |
| I2-B01 · Autenticación | Enviar datos vacíos, clave incorrecta y credenciales válidas. Se obtuvieron 400, 401 y 200. El hash del token quedó en PostgreSQL. Al cerrar sesión se obtuvo 204, se guardó la revocación y el mismo token devolvió 401. La sesión con vencimiento pasado también devolvió 401. | Aprobado |
| I2-B02 · Cuentas | Crear administrador y operador, filtrar por usuario e intentar registrar rol inválido, usuario duplicado y cédula duplicada. Se verificaron hash con sal en PostgreSQL, ausencia de esos campos en la respuesta y ausencia de cuentas parciales. | Aprobado |
| I2-B03 · Roles | Consultar cuentas, clientes y celdas. Sin sesión devolvieron 401 y con operador 403. El administrador pudo consultar los tres recursos y el operador pudo consultar ocupación. Se rechazó la creación de celdas desde el perfil operador. | Aprobado |
| I2-B04 · Clientes y mensualidad | Matricular vehículo, editar nombre, intentar desactivar con clave incorrecta, desactivar con clave válida, intentar entrada con mensualidad vencida y renovar. Se comprobaron el nombre actualizado, el rechazo de entrada sin alta de acceso y el vencimiento renovado en 30 días. | Aprobado |
| I2-B05 · Catálogo | Consultar 80 celdas de carro y 10 de moto, rechazar código inválido y exceso de capacidad, crear y rechazar el duplicado, editar y filtrar por código/tipo, consultar detalle y eliminar una celda sin historial. Se verificaron edición y borrado en PostgreSQL. | Aprobado |
| I2-B06 · Ocupación y concurrencia | Poner una celda en mantenimiento y comprobar su exclusión. Consultar disponibilidad sin reservar, intentar una placa inválida y enviar dos entradas simultáneas de la misma placa. Se guardó una sola entrada con su actor. La celda asignada quedó ocupada y los intentos de editar, eliminar o cambiar su estado conservaron celda y acceso. | Aprobado |
| I2-B07 · Salida e historial | Forzar un error de PostgreSQL al liberar la celda con una restricción temporal. La transacción conservó el acceso abierto y la celda ocupada. Al retirar la restricción, la salida guardó el actor y liberó la celda. El intento de eliminarla devolvió 409 y conservó su historial. | Aprobado |

El rechazo al intentar cambiar el estado de una celda ocupada devolvió HTTP 500 en la implementación revisada. Se verificó la protección de los datos y se registró el código observado.

```text
Express por HTTP y PostgreSQL 18.6
I2-B01 OK | login 400/401/200, sesión 204, revocación persistida y expiración 401
I2-B02 OK | altas, búsqueda, credenciales derivadas y duplicados sin escrituras parciales
I2-B03 OK | permisos 401/403 y acceso válido para ambos roles
I2-B04 OK | matrícula, edición, contraseña de confirmación, vencimiento y renovación persistida
I2-B05 OK | inventario, capacidad, formato, duplicidad, búsqueda, edición y borrado físico
I2-B06 OK | mantenimiento, consulta sin reserva, placa inválida, concurrencia y protección de ocupación
I2-B07 OK | reversión ante fallo de liberación, salida, actor e historial protegidos
```

Los 11 recorridos originales y su evidencia de interfaz se conservan en el plan práctico. Esta ejecución cubre las reglas del servidor y la persistencia en PostgreSQL.
