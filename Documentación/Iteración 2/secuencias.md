# Diagramas de secuencia de las iteraciones 1 y 2

El archivo [DiagramasSecuenciaI1-I2.mdj](DiagramasSecuenciaI1-I2.mdj) contiene las vistas editables para StarUML.

## I2 · Iniciar sesión

```mermaid
sequenceDiagram
  actor P as Administrador u operador
  participant UI as Interfaz web
  participant C as AuthController
  participant S as AuthService
  participant DB as PostgreSQL
  P->>UI: Ingresa usuario y contraseña
  UI->>C: POST /api/auth/login
  alt Faltan campos obligatorios
    C-->>UI: 400 · Completar usuario y contraseña
  else Solicitud completa
    C->>S: iniciarSesion
    S->>DB: Consulta cuenta activa y credenciales derivadas
    DB-->>S: Cuenta y datos para verificar la clave
    alt Credenciales válidas y sesión guardada
      S->>DB: Guarda hash del token y vencimiento
      DB-->>S: Confirma inserción
      S-->>C: Token y datos de la cuenta
      C-->>UI: 200 · Inicia sesión y muestra el panel
    else Credenciales inválidas
      S-->>C: Error de autenticación
      C-->>UI: 401 · Muestra el error de acceso
    else Falla la consulta o la escritura
      S-->>C: Error de persistencia
      C-->>UI: 500 · Error al iniciar sesión
    end
  end
```

## I2 · Cerrar sesión

```mermaid
sequenceDiagram
  actor P as Administrador u operador
  participant UI as Interfaz web
  participant M as Middleware de autenticación
  participant C as AuthController
  participant S as AuthService
  participant DB as PostgreSQL
  P->>UI: Selecciona Cerrar sesión
  UI->>M: POST /api/auth/logout con Bearer
  M->>S: validarToken, si está presente
  S->>DB: Consulta el hash y la vigencia
  DB-->>S: Resultado de la consulta
  S-->>M: Cuenta autenticada o sesión inválida
  alt Sesión ausente, vencida o revocada
    M-->>UI: 401 · Sesión inválida
  else Sesión vigente
    M->>C: Entrega la identidad autenticada
    C->>S: cerrarSesion con el hash
    S->>DB: Actualiza revocada_en
    alt Revocación guardada
      DB-->>S: Confirma actualización
      S-->>C: Revocación completada
      C-->>UI: 204 · Sin contenido
    else Falla la actualización
      DB-->>S: Error de escritura
      S-->>C: Propaga el error
      C-->>UI: 500 · Express responde al error
    end
  end
  UI-->>P: Limpia la sesión local y muestra el formulario de acceso
```

## I1 · Registrar entrada

```mermaid
sequenceDiagram
  actor P as Administrador u operador
  participant UI as Interfaz web
  participant M as Middleware de autenticación y rol
  participant C as AccesoController
  participant S as AccesoService
  participant DB as PostgreSQL
  P->>UI: Digita placa y tipo de vehículo
  UI->>M: POST /api/acceso/entrada
  alt Solicitud sin sesión autorizada
    M-->>UI: 401 o 403
  else Solicitud autorizada
    M->>C: Entrega los datos y la cuenta
    C->>S: registrarEntrada
    S->>DB: Inicia transacción y comprueba vehículo, mensualidad y acceso activo
    alt Hay una celda compatible y se guarda el acceso
      S->>DB: Ocupa la celda, guarda el acceso y confirma
      S-->>C: Acceso y celda asignada
      C-->>UI: 200 · Muestra autorización y celda
    else Falla una regla o la escritura
      S->>DB: Revierte la transacción
      S-->>C: Error de entrada
      C-->>UI: 400 o 500 · Muestra el motivo
    end
  end
```

## I1 · Registrar salida atómica

```mermaid
sequenceDiagram
  actor P as Administrador u operador
  participant UI as Interfaz web
  participant M as Middleware de autenticación y rol
  participant C as AccesoController
  participant S as AccesoService
  participant DB as PostgreSQL
  P->>UI: Digita la placa
  UI->>M: POST /api/acceso/salida
  alt Solicitud sin sesión autorizada
    M-->>UI: 401 o 403
  else Solicitud autorizada
    M->>C: Entrega la solicitud autenticada
    C->>S: registrarSalida
    S->>DB: Inicia transacción y busca acceso activo
    alt Cierre y liberación completados
      S->>DB: Guarda hora y actor, libera la celda y confirma
      S-->>C: Salida y celda liberada
      C-->>UI: 200 · Confirma la salida
    else Acceso inexistente o falla de escritura
      S->>DB: Revierte la transacción
      S-->>C: Error de salida
      C-->>UI: 400 · Muestra el motivo
    end
  end
```

## I2 · Matricular vehículo y cliente

```mermaid
sequenceDiagram
  actor P as Administrador u operador
  participant UI as Interfaz web
  participant M as Middleware de autenticación y rol
  participant C as AccesoController
  participant S as AccesoService
  participant DB as PostgreSQL
  P->>UI: Ingresa cédula, nombre, placa y tipo
  UI->>M: POST /api/vehiculo
  alt Solicitud sin sesión autorizada
    M-->>UI: 401 o 403
  else Solicitud autorizada
    M->>C: Entrega la solicitud autenticada
    alt Datos obligatorios ausentes
      C-->>UI: 400 · Solicita completar los datos
    else Datos completos
      C->>S: Registra matrícula y cuenta responsable
      S->>DB: Inicia transacción y busca cliente
      alt Matrícula registrada
        S->>DB: Crea cliente si aplica, registra vehículo y confirma
        S-->>C: Resultado de la matrícula
        C-->>UI: 201 · Confirma la matrícula
      else Registro rechazado
        S->>DB: Revierte la transacción si se inició
        S-->>C: Error de matrícula
        C-->>UI: 400 · Muestra el motivo
      end
    end
  end
```

## I2 · Renovar o desactivar mensualidad

```mermaid
sequenceDiagram
  actor A as Administrador
  participant UI as Interfaz web
  participant M as Middleware de autenticación y rol
  participant C as AccesoController
  participant AS as AuthService
  participant GS as GestionService
  participant DB as PostgreSQL
  A->>UI: Selecciona la acción y confirma contraseña
  UI->>M: PATCH /api/clientes/:cedula/mensualidad
  alt Solicitud sin sesión autorizada
    M-->>UI: 401 o 403
  else Solicitud autorizada
    M->>C: Entrega la solicitud autenticada
    alt Solicitud incompleta
      C-->>UI: 422 · Pide estado y contraseña
    else Solicitud completa
      C->>AS: verificarClaveAdministrador
      AS->>DB: Lee hash y sal de la cuenta
      AS-->>C: Contraseña válida o inválida
      alt Contraseña válida
        C->>GS: actualizarMensualidad
        GS->>DB: Actualiza estado y fecha cuando corresponde
        alt Cambio guardado
          GS-->>C: Mensualidad actualizada
          C-->>UI: 200 · Actualiza la ficha
        else Falla el cambio
          GS-->>C: Error de actualización
          C-->>UI: 400 · Muestra el motivo
        end
      else Contraseña incorrecta
        C-->>UI: 403 · Muestra error de confirmación
      end
    end
  end
```

## I2 · Crear cuenta de acceso

```mermaid
sequenceDiagram
  actor A as Administrador
  participant UI as Interfaz web
  participant M as Middleware de autenticación y rol
  participant C as AuthController
  participant S as AuthService
  participant DB as PostgreSQL
  A->>UI: Diligencia datos y elige el rol
  UI->>M: POST /api/usuarios
  alt Solicitud sin sesión autorizada
    M-->>UI: 401 o 403
  else Solicitud autorizada
    M->>C: Entrega la solicitud autenticada
    C->>S: crearCuenta si los campos obligatorios están completos
    alt Datos válidos y cuenta guardada
      S->>DB: Inserta cuenta y perfil de operador si aplica
      S-->>C: Datos públicos de la cuenta
      C-->>UI: 201 · Confirma la creación
    else Validación, duplicidad o persistencia
      S-->>C: Error del servicio, si se invocó
      C-->>UI: 422, 409 o 500 · Muestra el motivo
    end
  end
```

## I2 · Administrar celdas

```mermaid
sequenceDiagram
  actor A as Administrador
  participant UI as Interfaz web
  participant M as Middleware de autenticación y rol
  participant C as AccesoController
  participant S as GestionService
  participant DB as PostgreSQL
  A->>UI: Consulta o modifica el catálogo
  UI->>M: GET, POST, PUT, PATCH o DELETE /api/celdas
  alt Solicitud sin sesión autorizada
    M-->>UI: 401 o 403
  else Solicitud autorizada
    M->>C: Entrega la solicitud autenticada
    C->>S: Ejecuta la operación si la solicitud es válida
    S->>DB: Consulta catálogo o verifica capacidad, ocupación e historial
    alt Consulta o cambio correcto
      DB-->>S: Devuelve datos o confirma el cambio
      S-->>C: Resultado de la operación
      C-->>UI: 200, 201 o 204 · Muestra o refresca catálogo
    else Datos inválidos, duplicado, capacidad, ocupación o historial
      S-->>C: Error de la operación, si se invocó
      C-->>UI: 422, 404, 409 o 500 según operación · Muestra el motivo
    end
  end
```
