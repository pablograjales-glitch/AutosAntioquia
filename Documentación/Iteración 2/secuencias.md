# Diagramas de secuencia - Iteraciones 1 y 2

Estas secuencias siguen los permisos y operaciones implementados. Los archivos `.mdj` se pueden abrir y modificar en StarUML.

## I1 - Registrar entrada

```mermaid
sequenceDiagram
  actor P as Administrador u Operador
  participant UI as Interfaz web
  participant M as Middleware de autenticacion y rol
  participant C as AccesoController
  participant S as AccesoService
  participant DB as PostgreSQL
  P->>UI: Digita placa y tipo de vehiculo
  UI->>M: POST /api/acceso/entrada con sesion
  M->>M: Verifica sesion y rol ADMINISTRADOR u OPERADOR
  M->>C: Autoriza solicitud
  C->>S: registrarEntrada(placa, tipo, idCuenta)
  S->>S: Normaliza y valida placa
  S->>DB: BEGIN; consulta cliente, mensualidad y vencimiento
  S->>DB: Comprueba que no exista entrada activa
  S->>DB: Selecciona al azar una celda compatible disponible
  S->>DB: Ocupa celda e inserta entrada con idCuenta
  S->>DB: COMMIT
  S-->>UI: Confirmacion y celda asignada
  alt Validacion o persistencia falla
    S->>DB: ROLLBACK
    S-->>UI: Rechazo con motivo
  end
```

## I1 - Registrar salida atomica

```mermaid
sequenceDiagram
  actor P as Administrador u Operador
  participant UI as Interfaz web
  participant M as Middleware de autenticacion y rol
  participant C as AccesoController
  participant S as AccesoService
  participant DB as PostgreSQL
  P->>UI: Digita placa
  UI->>M: POST /api/acceso/salida con sesion
  M->>M: Verifica sesion y rol ADMINISTRADOR u OPERADOR
  M->>C: Autoriza solicitud
  C->>S: registrarSalida(placa, idCuenta)
  S->>DB: BEGIN; bloquea registro activo y celda
  S->>DB: Cierra registro y guarda actor de salida
  S->>DB: Libera la misma celda
  alt Ambos cambios se completan
    S->>DB: COMMIT
    S-->>UI: Salida confirmada
  else Falla el cierre o la liberacion
    S->>DB: ROLLBACK de ambos cambios
    S-->>UI: Error; registro y celda conservan su estado previo
  end
```

## I2 - Matricular y gestionar mensualidades

```mermaid
sequenceDiagram
  actor P as Administrador u Operador
  participant UI as Interfaz web
  participant M as Middleware de autenticacion y rol
  participant C as AccesoController
  participant S as GestionService
  participant DB as PostgreSQL
  P->>UI: Ingresa cedula, nombre, placa y tipo
  UI->>M: POST /api/vehiculo con sesion
  M->>M: Autoriza ADMINISTRADOR u OPERADOR
  M->>C: Enruta matricula
  C->>S: Registrar cliente/vehiculo/mensualidad con idCuenta
  S->>DB: Busca cliente; crea ficha si no existe
  S->>DB: Registra vehiculo y mensualidad inicial con vencimiento
  S->>DB: Guarda idCuenta que realizo la matricula
  S-->>UI: Matricula confirmada
  actor A as Administrador
  A->>UI: Consulta/edita cliente o renueva/desactiva mensualidad
  UI->>M: PUT datos o PATCH mensualidad
  M->>M: Autoriza ADMINISTRADOR
  UI->>A: Solicita contrasena para renovar/desactivar
  A->>UI: Confirma contrasena
  UI->>C: Envia cambio confirmado
  C->>S: Valida clave y persiste cambio/vencimiento
  S-->>UI: Resultado de la gestion
```

## I2 - Gestionar cuentas y roles

```mermaid
sequenceDiagram
  actor A as Administrador
  participant UI as Interfaz web
  participant M as Middleware de autenticacion y rol
  participant C as AuthController
  participant S as AuthService
  participant DB as PostgreSQL
  A->>UI: Crea cuenta y elige Administrador u Operador
  UI->>M: POST /api/usuarios con sesion
  M->>M: Verifica rol ADMINISTRADOR
  M->>C: Autoriza solicitud
  C->>S: crearCuenta(datos)
  S->>S: Valida datos y deriva hash con sal
  S->>DB: Inserta cuenta y perfil (en transaccion)
  S-->>UI: Cuenta creada; no expone hash ni sal
```

## I2 - Administrar celdas

```mermaid
sequenceDiagram
  actor A as Administrador
  participant UI as Interfaz web
  participant M as Middleware de autenticacion y rol
  participant C as AccesoController
  participant S as GestionService
  participant DB as PostgreSQL
  A->>UI: Consulta, crea, edita o cambia mantenimiento
  UI->>M: Solicitud /api/celdas con sesion
  M->>M: Verifica rol ADMINISTRADOR
  M->>C: Autoriza solicitud
  C->>S: Ejecuta operacion
  S->>DB: Verifica codigo/tipo, limite 80 carros y 10 motos, ocupacion e historial
  alt Operacion permitida
    S->>DB: Persiste cambio
    S-->>UI: Lista y contadores actualizados
  else Se excede el limite o la celda esta ocupada/protegida
    S-->>UI: Rechazo con motivo; no modifica datos
  end
```
