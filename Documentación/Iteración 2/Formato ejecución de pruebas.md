# Formato resumido de ejecución — Iteración 2

El archivo oficial enviado por el profesor (`Plan_Pruebas_Usuarios_Celdas_Autos_Colombia.xlsx`) es el registro principal y contiene 30 casos. Conserva en él los resultados originales, responsables y observaciones; este cuadro organiza evidencia complementaria para el alcance integrado de I1 e I2. No inventar resultados: actualizar cada fila únicamente después de ejecutar el escenario y guardar captura/log.

| Grupo | Escenarios que deben evidenciarse | Resultado actual |
|---|---|---|
| Autenticación | Inicio válido/inválido, cierre, sesión expirada/revocada | Pendiente de ejecución con la versión actual |
| Roles | Administrador puede administrar cuentas/clientes/celdas; operador puede acceder a portería; rutas cruzadas responden 403; sesión ausente responde 401 | Pendiente de ejecución |
| Cuentas | Crear administrador/operador, buscar/listar, usuario y cédula duplicados, rol requerido, hash nunca expuesto | Pendiente de ejecución |
| Clientes y mensualidad | Alta, consulta, búsqueda, actualización, renovación, rechazo por vencimiento con fecha informada | Ejecutar o conservar evidencia previa del formato del profesor |
| Celdas | Consultar 90 iniciales (80 carro/10 moto), búsqueda, alta/duplicado, detalle, edición y eliminación | Pendiente de ejecución |
| Integridad de celdas | No editar ocupada; no eliminar ocupada/con historial; mantenimiento excluido de asignación; disponibilidad no reserva | Pendiente de ejecución |
| Iteración 1 | Validación de placa, entrada con asignación aleatoria compatible, salida atómica, ocupación | Conservar evidencias históricas; reejecutar solo si la hoja oficial lo requiere |

## Registro complementario

| Escenario | Fecha | Responsable | Resultado | Evidencia | Observaciones |
|---|---|---|---|---|---|
| Autenticación y permisos |  |  | Pendiente |  |  |
| Alta de cuentas y protección de credenciales |  |  | Pendiente |  |  |
| Gestión de clientes/mensualidad |  |  | Pendiente |  |  |
| CRUD y filtros de celdas |  |  | Pendiente |  |  |
| Integridad, historial y concurrencia |  |  | Pendiente |  |  |
| Flujo de entrada/salida integrado |  |  | Pendiente |  |  |

> No se reemplaza ni se modifican los estados ya diligenciados en la hoja oficial del profesor. Adjuntar capturas de ejecución y fecha al completar cada caso.
