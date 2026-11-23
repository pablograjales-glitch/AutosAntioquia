# Plan de pruebas resumido · Iteración 3

- **Proyecto** Autos Antioquia
- **Módulo** Gestión de pagos de mensualidad
- **Fecha del plan** 20 de noviembre de 2026
- **Preparación** PostgreSQL con esquema temporal, cliente ficticio vencido, administrador y operador de prueba. Tarifa ficticia de $50.000 COP.
- **Entrada** Migración 006 aplicada y servidor iniciado en modo demo. El alcance de la entrega comprende T01 a T05. T06 y T07 corresponden a la verificación opcional del conector ePayco y requieren credenciales de prueba y una URL HTTPS accesible por el proveedor.

| ID | Historia | Procedimiento y datos | Resultado esperado |
| --- | --- | --- | --- |
| T01 | HU-P01, HU-P04 | Entrar como administrador, elegir cliente y crear cobro. Consultar historial. | Aparece un pago pendiente por $50.000 COP y se conserva el vencimiento. |
| T02 | HU-P02, HU-P04 | Simular el rechazo del pago pendiente. | El historial registra RECHAZADO y la fecha se conserva. |
| T03 | HU-P02, HU-P04 | Crear otro cobro y simular su aprobación para el cliente vencido. | El historial registra APROBADO, se activa la mensualidad y vence en 30 días. |
| T04 | HU-P02 | Repetir simultáneamente dos solicitudes de aprobación para la misma referencia. | El vencimiento sigue en 30 días y se conserva una sola aprobación. |
| T05 | HU-P01, HU-P04 | Intentar consultar sin sesión y aplicar un resultado con una cuenta operadora. | Las solicitudes devuelven 401 y 403, respectivamente. |
| T06 | HU-P03 | Abrir el sandbox y completar un pago de prueba. Revisar la confirmación y el historial. | El servidor valida los datos del proveedor y renueva una vez cuando el pago se aprueba. |
| T07 | HU-P03 | Enviar una confirmación de prueba con firma inválida. | Se devuelve 400 y se conservan el pago y el vencimiento. |

## Evidencia de la ejecución del 22 de noviembre de 2026

**Resultado** 5 de 5 casos locales aprobados con Playwright en Microsoft Edge 158, Express por HTTP y PostgreSQL 18.6. La aplicación se ejecutó en modo demo con un esquema temporal y datos ficticios.

[Ver el recorrido grabado por Playwright](Evidencia%20Playwright/2026-11-22/Recorrido-Playwright.webm). El video muestra el inicio de sesión, el historial de pagos, el alta, el rechazo y la aprobación. Al final aparecen los resultados de concurrencia y permisos obtenidos por API.

El video final de Autos Antioquia reúne las pruebas de portería, sesiones y administración de celdas, y pagos en una misma ejecución.

| Caso | Resultado observado | Evidencia |
| --- | --- | --- |
| T01 | El historial mostró el pago pendiente de $50.000 COP. PostgreSQL conservó el vencimiento del día anterior. | [Panel inicial](Evidencia%20Playwright/2026-11-22/01-inicio.png) · [Pago pendiente](Evidencia%20Playwright/2026-11-22/02-pendiente.png) |
| T02 | El historial mostró el pago rechazado. Se conservó el vencimiento. | [Pago rechazado](Evidencia%20Playwright/2026-11-22/03-rechazado.png) |
| T03 | El historial mostró el pago aprobado. PostgreSQL registró la mensualidad activa y el vencimiento a 30 días. | [Pago aprobado](Evidencia%20Playwright/2026-11-22/04-aprobado.png) |
| T04 | Ambos reenvíos simultáneos devolvieron HTTP 200. Se conservó una sola aprobación con la misma fecha de aplicación y vencimiento. | [Registro de ejecución](Evidencia%20Playwright/2026-11-22/resultados.txt) |
| T05 | La consulta sin sesión devolvió HTTP 401 y la confirmación como operador devolvió HTTP 403. El historial y el vencimiento se conservaron. | [Registro de ejecución](Evidencia%20Playwright/2026-11-22/resultados.txt) |

T06 y T07 quedan pendientes como verificaciones de la extensión ePayco.

La ejecución local se reproduce con `node --import tsx scripts/verificar_pagos.ts`, con PostgreSQL configurado en `.env`. El script guarda el registro y las capturas en `test-results/pagos-iteracion-3` por defecto. La variable `PAGOS_TEST_EVIDENCE` permite elegir otro destino.

En Windows, si `tsx` falla al consultar el perfil del sistema, se puede compilar y ejecutar la misma prueba desde PowerShell.

```powershell
$build = 'dist/pagos-playwright'
node node_modules/typescript/bin/tsc --ignoreConfig scripts/verificar_pagos.ts src/app.ts --target ES2022 --module commonjs --esModuleInterop --skipLibCheck --strict --rootDir . --outDir $build
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación de la prueba.' }
Copy-Item -LiteralPath public -Destination $build -Recurse -Force
node --env-file=.env (Join-Path $build 'scripts/verificar_pagos.js')
```

Para grabar una nueva ejecución, instala FFmpeg con `npx playwright install ffmpeg` y establece `$env:PAGOS_TEST_VIDEO = '1'` antes de ejecutar la prueba. En el directorio de evidencia se guardará `Recorrido-Playwright.webm`.

Para repetir la grabación de las tres iteraciones, establece `$env:AUTOS_TEST_VIDEO_FINAL = '1'`. El script guarda `Recorrido-Iteraciones-1-a-3.webm` y los resultados en `test-results/video-iteraciones-1-a-3` por defecto.
