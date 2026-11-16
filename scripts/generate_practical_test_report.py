from base64 import b64encode
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = next(next(ROOT.glob('Doc*')).glob('Iter*'))
OUT = DOCS / 'Plan_Pruebas_Practico_Iteracion_2.html'
RESULTS = ROOT / 'test-results'

cases = [
    ('P-01', 'El administrador consulta la ocupación', 'Iniciar sesión como administrador y revisar los contadores de carros y motos.', 'Se ven los ocupados y disponibles; no aparece un aviso de falta de permisos.', 'Se muestran 1 carro ocupado y 0 motos ocupadas en los datos de prueba.', 'P-01-ocupacion-admin.png'),
    ('P-02', 'El administrador cubre portería', 'Iniciar sesión como administrador, ingresar la placa ABC123 y registrar la entrada.', 'El sistema autoriza el ingreso y muestra la celda que asignó.', 'La pantalla confirma el ingreso y muestra la celda C-01.', 'P-02-admin-entrada.png'),
    ('P-03', 'El operador matricula un cliente y su vehículo', 'Iniciar sesión como operador y registrar los datos de un cliente nuevo y su vehículo.', 'La matrícula queda confirmada y se informa la vigencia inicial.', 'La aplicación presenta la confirmación de matrícula.', 'P-03-matricula-operador.png'),
    ('P-04', 'El operador registra una entrada', 'Ingresar la placa ABC123 y registrar la entrada como operador.', 'La aplicación asigna una celda disponible compatible y confirma el ingreso.', 'La confirmación muestra la celda C-01.', 'P-04-entrada-celda.png'),
    ('P-05', 'El operador registra una salida', 'Ingresar la placa ABC123 y registrar la salida como operador.', 'La salida queda confirmada y se identifica la celda liberada.', 'La confirmación de salida indica que se liberó C-01.', 'P-05-salida-liberacion.png'),
    ('P-06', 'El administrador crea una cuenta de operador', 'Completar usuario, nombre, contraseña, perfil Operador y cédula; luego crear la cuenta.', 'La cuenta nueva aparece en el listado con el perfil Operador.', 'El listado muestra operador.puerta con perfil Operador.', 'P-06-cuenta-operador.png'),
    ('P-07', 'El operador ve solo sus funciones', 'Iniciar sesión como operador y revisar las opciones disponibles.', 'Puede matricular y registrar entradas/salidas; no aparecen controles para administrar cuentas o celdas.', 'La vista del operador presenta sus formularios de operación y oculta la administración.', 'P-07-vista-operador.png'),
    ('P-08', 'El administrador agrega una celda', 'Escribir el código C-88, seleccionar Carro y crear la celda.', 'La nueva celda aparece en el inventario con estado Disponible.', 'El inventario incluye C-88 como celda disponible.', 'P-08-inventario-celdas.png'),
    ('P-09', 'El administrador renueva una mensualidad', 'Elegir Renovar, escribir la contraseña de administrador y confirmar.', 'La aplicación pide la contraseña y confirma el cambio.', 'Se envía la confirmación y el diálogo se cierra.', 'P-09-renovar-mensualidad.png'),
    ('P-10', 'El administrador desactiva una mensualidad', 'Elegir Desactivar, escribir la contraseña de administrador y confirmar.', 'La aplicación pide la contraseña y confirma el cambio.', 'Se envía la confirmación y el diálogo se cierra.', 'P-10-desactivar-mensualidad.png'),
    ('P-11', 'El administrador revisa el estado de las celdas', 'Abrir la gestión de celdas y revisar las celdas disponibles y ocupadas.', 'Cada celda muestra su estado y, si está ocupada, la placa asociada.', 'El listado diferencia Disponible y Ocupada, y muestra ABC123 en la celda ocupada.', 'P-11-estado-celdas.png'),
]

sections = []
for case_id, title, steps, expected, observed, filename in cases:
    image = next(RESULTS.rglob(filename))
    uri = 'data:image/png;base64,' + b64encode(image.read_bytes()).decode('ascii')
    sections.append(f'''<section class="case">
      <header><span class="case-id">{escape(case_id)}</span><h2>{escape(title)}</h2><span class="status">Aprobado en la interfaz</span></header>
      <dl><dt>Pasos</dt><dd>{escape(steps)}</dd><dt>Resultado esperado</dt><dd>{escape(expected)}</dd><dt>Resultado observado</dt><dd>{escape(observed)}</dd></dl>
      <figure><img src="{uri}" alt="Captura del caso {escape(case_id)}"><figcaption>Evidencia {escape(case_id)} · captura del paso ejecutado en la aplicación.</figcaption></figure>
    </section>''')

html = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Plan de pruebas práctico · Autos Colombia</title>
<style>
@page {{ size: A4; margin: 15mm 16mm; }}
* {{ box-sizing: border-box; }} body {{ font: 10.5pt Arial, sans-serif; color:#17243a; margin:0; line-height:1.4; }}
h1 {{ font-size:24pt; margin:0 0 8px; }} h2 {{ font-size:15pt; margin:0; }} .cover {{ min-height:260mm; display:flex; flex-direction:column; justify-content:center; page-break-after:always; }}
.eyebrow {{ color:#2563eb; font-weight:bold; letter-spacing:.08em; text-transform:uppercase; }}
.note {{ margin-top:18px; padding:12px 14px; background:#fff7dc; border-left:4px solid #e9a400; }}
.case {{ page-break-after:always; min-height:255mm; }} .case:last-child {{ page-break-after:auto; }}
.case header {{ display:grid; grid-template-columns:60px 1fr auto; align-items:center; gap:10px; border-bottom:2px solid #dce4ef; padding-bottom:10px; margin-bottom:12px; }}
.case-id {{ background:#e8efff; color:#1749a8; font-weight:bold; border-radius:7px; padding:7px; text-align:center; }} .status {{ color:#087443; background:#dff7e9; border-radius:20px; padding:5px 9px; font-size:9pt; }}
dl {{ display:grid; grid-template-columns:130px 1fr; gap:7px 12px; margin:12px 0 16px; }} dt {{ font-weight:bold; color:#52627b; }} dd {{ margin:0; }}
figure {{ margin:12px 0 0; border:1px solid #dce4ef; border-radius:9px; padding:8px; text-align:center; }} figure img {{ max-width:100%; max-height:150mm; object-fit:contain; }} figcaption {{ border-top:1px solid #e6ebf2; padding-top:6px; color:#61718a; font-size:9pt; }}
.footer {{ margin-top:auto; color:#8190a6; font-size:9pt; }}
</style></head><body>
<section class="cover"><p class="eyebrow">Parqueadero Autos Colombia · Iteración 2</p><h1>Plan de pruebas práctico</h1><p>Gestión de usuarios, celdas y operación diaria</p>
<p><strong>11 casos sencillos</strong> · 11 capturas, una por caso · Ejecutados con Playwright</p>
<div class="note"><strong>Alcance de la evidencia:</strong> las capturas muestran la interfaz real durante los recorridos. Para no modificar los registros del parqueadero, las respuestas de la API se simularon. Por eso sirven para revisar las pantallas y los pasos; no certifican que las operaciones se hayan guardado en PostgreSQL.</div>
<p>Los casos cubren la consulta de ocupación por el administrador, sus funciones de respaldo en portería, las tareas del operador, la matrícula, entradas y salidas, las cuentas, las celdas y la confirmación de cambios de mensualidad.</p><div class="footer">Preparado el 15 de noviembre de 2026</div></section>
{''.join(sections)}
</body></html>'''
OUT.write_text(html, encoding='utf-8')
print(f'Informe creado: {OUT} ({len(cases)} casos)')
