# Iteración 2: usuarios, roles y celdas

## Continuidad del proyecto

Esta iteración amplía el proyecto existente; no reemplaza ni elimina Iteración 1. Se mantienen entradas/salidas, mensualidad y fecha de vencimiento, ocupación, placa con validación estricta, asignación aleatoria de celda y cierre atómico de la salida. Las cuentas de acceso son entidades distintas de los clientes con mensualidad.

## Perfiles y permisos

| Perfil | Operaciones |
|---|---|
| Administrador | Iniciar/cerrar sesión; crear y consultar cuentas; gestionar clientes y mensualidades (renovar/desactivar con contraseña); administrar celdas; también puede cubrir portería con su propia cuenta. |
| Operador | Iniciar/cerrar sesión; matricular clientes/vehículos nuevos; registrar entradas/salidas; consultar ocupación y disponibilidad. No administra cuentas, no renueva/desactiva mensualidades y no gestiona el catálogo de celdas. |

La API verifica el rol en servidor (401 sin sesión, 403 rol insuficiente). No se confía solo en ocultar botones en la interfaz. La primera cuenta administradora se provisiona por `npm run create-admin`.

## Requerimientos funcionales

| ID | Requerimiento |
|---|---|
| RF-A01 | Autenticar cuentas y crear una sesión revocable con expiración. |
| RF-A02 | Administrador crea/lista/busca cuentas con rol Administrador u Operador; credenciales con hash y sal, nunca texto plano. |
| RF-A03 | Exigir cédula única y válida al crear cuenta de operador. |
| RF-A04 | Aplicar autorización en servidor por perfil y permitir cerrar sesión. |
| RF-U01 | Administrador crea y consulta clientes por cédula/nombre, incluyendo vehículos, mensualidad y vencimiento. |
| RF-U02 | Administrador actualiza clientes y renueva/desactiva mensualidad conservando historial y vencimiento; cada cambio exige contraseña del administrador activo. |
| RF-U03 | Operador matricula un cliente/vehículo nuevo con mensualidad inicial. Si el cliente existente está inactivo o vencido, no puede reactivarlo mediante la matrícula de otro vehículo. |
| RF-C01 | Administrador lista, busca y consulta celdas por código, tipo y estado, con placa si está ocupada. |
| RF-C02 | Administrador crea celdas con código único, tipo CARRO/MOTO y estado inicial disponible, sin superar la capacidad autorizada de 80 carros y 10 motos. |
| RF-C03 | Administrador edita o elimina celdas; rechaza edición de ocupadas y eliminación de celdas con ocupación/historial. |
| RF-C04 | Administrador cambia entre disponible y mantenimiento; no altera estado ocupado. |
| RF-C05 | Operador consulta disponibilidad por tipo; la consulta no reserva celdas. |
| RF-I01 | Administrador y operador pueden registrar entrada/salida y consultar ocupación. El sistema conserva las reglas de Iteración 1: vencimiento, placa y selección aleatoria. Cada operación registra la cuenta autenticada que la ejecutó. |
| RF-I02 | La salida cierra el registro y libera celda dentro de una única transacción. |
| RF-I03 | El sistema registra en matrícula, entrada y salida el ID de la cuenta autenticada; no se usan credenciales compartidas para dejar trazabilidad. |

## Requerimientos no funcionales

| ID | Criterio |
|---|---|
| RNF-01 Seguridad | Contraseñas de 8 a 128 caracteres, almacenadas con scrypt y sal aleatoria; token aleatorio, solo su hash se persiste; sesión de ocho horas; errores de acceso no revelan si existe la cuenta. |
| RNF-02 Autorización | Middleware aplica roles en cada ruta protegida. |
| RNF-03 Integridad | Restricciones SQL para unicidad, rol, cédula y relaciones; transacciones para operaciones que cambian más de una entidad. |
| RNF-04 Arquitectura | Interfaz, controladores Express y servicios de negocio separados; PostgreSQL mediante `pg.Pool` desde servicios, sin afirmar una capa Repository inexistente. |
| RNF-05 Usabilidad | Interfaz clara, controles etiquetados, listas filtrables y mensajes comprensibles en escritorio/móvil. |
| RNF-06 Rendimiento | Objetivo de respuesta menor a dos segundos en entorno de referencia con 90 celdas y 500 clientes/cuentas; validar mediante ejecución manual. |
| RNF-07 Auditoría/retención | No borrar clientes ni celdas ligadas al historial; cuentas tienen estado activo y las sesiones pueden revocarse. |

## Historias de usuario

### HU-A01 — Iniciar sesión
Como administrador u operador quiero autenticarme con mi cuenta individual para acceder a mis funciones y dejar trazabilidad. Aceptación: credenciales incorrectas no abren sesión; sesión vence a las ocho horas; cerrar sesión revoca token.

### HU-A02 — Gestionar cuentas
Como administrador quiero crear y consultar cuentas con perfil para controlar quién usa el sistema. Aceptación: usuario único; rol válido; operador con cédula única; no se exponen hash/sal; operador no puede administrar cuentas.

### HU-U01 — Gestionar clientes y mensualidades
Como operador quiero matricular un cliente y su vehículo con mensualidad inicial; como administrador también quiero poder cubrir esa tarea y mantener datos/renovar/desactivar. Aceptación: matrícula crea la vigencia inicial sin reactivar un cliente inactivo/vencido; renovar o desactivar exige contraseña del administrador activo y conserva historial.

### HU-C01 — Consultar disponibilidad
Como operador quiero ver celdas disponibles por tipo para orientar la operación. Aceptación: solo disponibles; no se reserva ni modifica ninguna celda.

### HU-C02 — Administrar celdas
Como administrador quiero crear, consultar, buscar, editar, eliminar y poner celdas en mantenimiento para mantener el inventario correcto. Aceptación: códigos únicos; máximo 80 celdas de carro y 10 de moto; tipos válidos; ocupadas no editables; las celdas con historial no se eliminan; mantenimiento excluye de la asignación aleatoria.

### HU-I01 — Registrar acceso
Como operador, y como administrador cuando cubre portería, quiero registrar entrada y salida para controlar vehículos sin depender de una cuenta compartida. Aceptación: placa validada; mensualidad vencida rechazada indicando fecha; asignación aleatoria compatible; cada evento guarda el ID de la cuenta que lo ejecutó; salida libera celda y cierra registro atómicamente.

## Casos de uso resumidos

Actores: Administrador y Operador. Ambos pueden iniciar/cerrar sesión, matricular clientes/vehículos nuevos y cubrir entradas/salidas. El administrador además crea cuentas, mantiene clientes, renueva/desactiva mensualidades con contraseña y administra celdas. Cada operación conserva el actor autenticado; consultar disponibilidad no incluye registrar salida.

## Pruebas

Para esta entrega se resumen 11 casos de prueba seleccionados para los flujos de Iteraciones 1 y 2. Registra resultados, observaciones y responsables reales; no marques casos como aprobados sin ejecutar y adjuntar evidencia. Los grupos relevantes incluyen autenticación/sesiones, permisos 401/403, creación y duplicidad de cuentas, hash de clave, alta/búsqueda/edición/borrado protegido de celdas, concurrencia y protección de celdas ocupadas. Las pruebas de Iteración 1 ya registradas se conservan; no se inventan resultados.

La tabla `Formato ejecución de pruebas.md` sirve como resumen complementario, no sustituye la hoja oficial. Completar fecha, responsable, resultado, evidencia y observaciones solo tras ejecutar cada caso.

## Entregables y pasos pendientes del equipo

- Diagramas StarUML editables: casos de uso, secuencias de iteraciones 1 y 2, componentes.
- Mockups: `mockups.html`.
- Repositorio: https://github.com/pablograjales-glitch/AutosAntioquia (publicar cambios con commit/push desde la cuenta del equipo).
- Video: grabar demostración de administrador y operador; subir a YouTube y pegar el enlace en el informe.
- Ejecutar el plan del profesor y conservar evidencias reales.

## Conclusión

Iteración 2 agrega control por perfiles, gestión de cuentas y administración integral de celdas mientras mantiene las funciones entregadas en Iteración 1. La autorización del lado del servidor limita cada operación al rol correspondiente; las reglas de integridad protegen mensualidades, historial y ocupación. Para cerrar la entrega académica se debe completar la ejecución documentada de los 11 casos resumidos. El repositorio está actualizado en GitHub y el enlace del video se comparte en el comentario de la actividad.
