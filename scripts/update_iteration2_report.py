from pathlib import Path

root = Path(__file__).resolve().parents[1]
doc = next(next(root.glob('Doc*')).glob('Iter*'))
report = doc / 'Informe Iteración 2.html'
html = report.read_text(encoding='utf-8')

# Repair mojibake left in the previous PDF source.
for broken, fixed in {
    'renovaci?n': 'renovación', 'desactivaci?n': 'desactivación', 'contrase?a': 'contraseña',
    'porter?a': 'portería', 'auditor?a': 'auditoría', 'selecci?n': 'selección',
    'at?mica': 'atómica', 'veh?culos': 'vehículos', 'veh?culo': 'vehículo',
    'est?': 'está', 'matr?cula': 'matrícula', 'adem?s': 'además',
    'sesi?n': 'sesión', 'autenticaci?n': 'autenticación', 'gesti?n': 'gestión',
    'Iteraci?n': 'Iteración', 'c?dula': 'cédula', 'validaci?n': 'validación',
    'ejecuci?n': 'ejecución', 'autorizaci?n': 'autorización', 'creaci?n': 'creación',
    'protecci?n': 'protección', 'im?genes': 'imágenes', 'a?ade': 'añade',
    'hist?ricos': 'históricos', 'Conclusi?n': 'Conclusión', 'C?mo': 'Cómo',
    'solo ?l': 'solo él', 'vehiculo': 'vehículo', 'sesi?n': 'sesión',
}.items():
    html = html.replace(broken, fixed)

start = html.index('<section class="page"><h2>3.')
end = html.index('<section class="page"><h2>4.', start)
page3 = '''<section class="page">
<h2>3. Historias de usuario y casos de uso</h2>
<table><tr><th>Historia</th><th>Actor y valor</th><th>Aceptación</th></tr>
<tr><td>HU-A01</td><td>Administrador u operador inicia sesión con una cuenta propia.</td><td>La sesión identifica al actor y se puede cerrar o revocar.</td></tr>
<tr><td>HU-A02</td><td>El administrador crea cuentas con perfil Administrador u Operador.</td><td>El usuario es único; las contraseñas se guardan como hash y no se exponen.</td></tr>
<tr><td>HU-U01</td><td>El operador matricula clientes y vehículos nuevos; el administrador puede cubrir esta tarea y mantener clientes.</td><td>Solo el administrador renueva o desactiva mensualidades, confirmando su contraseña.</td></tr>
<tr><td>HU-C01</td><td>El operador consulta celdas disponibles para orientar el ingreso.</td><td>La consulta no reserva una celda ni registra una salida.</td></tr>
<tr><td>HU-C02</td><td>El administrador gestiona el inventario y mantenimiento de celdas.</td><td>Las celdas ocupadas no se editan ni eliminan; mantenimiento las excluye de asignación.</td></tr>
<tr><td>HU-I01</td><td>Administrador y operador registran entradas y salidas con sus propias cuentas.</td><td>Se asigna una celda compatible y aleatoria; cada acción conserva el actor. La salida libera la celda en una transacción.</td></tr></table>
<h3>Casos de uso</h3>
<p>Ambos perfiles inician sesión, matriculan clientes nuevos y operan la portería con su propia cuenta. El administrador puede cubrir al operador y, además, administra cuentas, clientes, mensualidades y celdas. Solo el operador consulta la lista auxiliar de celdas disponibles; ambos pueden ver los contadores de ocupación. Consultar una celda es independiente y no registra una salida.</p>
<svg class="diagram" viewBox="0 0 940 455" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagrama de casos de uso con permisos de administrador y operador">
<rect width="940" height="455" fill="#fff"/><rect x="205" y="15" width="720" height="425" rx="12" fill="#f8fafc" stroke="#64748b"/><text x="565" y="42" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#10264b">Sistema Autos Antioquia</text>
<g fill="none" stroke-width="1.8" opacity=".72"><g stroke="#2563eb"><path d="M148 105L225 82M148 105L555 82M148 116L225 177M148 120L555 177M148 130L225 272M148 136L555 272M148 144L225 367"/></g><g stroke="#0f766e"><path d="M148 345L225 185M148 345L555 185M148 345L225 280M148 345L555 275M148 345L225 367M148 345L555 367"/></g></g>
<g fill="#fff" stroke="#2563eb" stroke-width="2"><ellipse cx="370" cy="82" rx="145" ry="29"/><ellipse cx="700" cy="82" rx="145" ry="29"/><ellipse cx="370" cy="177" rx="145" ry="29"/><ellipse cx="700" cy="177" rx="145" ry="29"/><ellipse cx="370" cy="272" rx="145" ry="29"/><ellipse cx="700" cy="272" rx="145" ry="29"/><ellipse cx="370" cy="367" rx="145" ry="29"/><ellipse cx="700" cy="367" rx="145" ry="29"/></g>
<g font-family="Arial" font-size="12.5" text-anchor="middle" fill="#172033"><text x="370" y="86">Gestionar cuentas y clientes</text><text x="700" y="86">Administrar celdas</text><text x="370" y="181">Registrar entrada y asignar celda</text><text x="700" y="181">Registrar salida y liberar celda</text><text x="370" y="276">Matricular cliente y vehículo</text><text x="700" y="276">Consultar ocupación</text><text x="370" y="371">Consultar disponibilidad</text><text x="700" y="371">Iniciar y cerrar sesión</text></g>
<g stroke="#172033" stroke-width="2" fill="none"><circle cx="95" cy="75" r="12"/><path d="M95 87v46m-22-27h44m-22 27-18 26m18-26 18 26"/><circle cx="95" cy="300" r="12"/><path d="M95 312v46m-22-27h44m-22 27-18 26m18-26 18 26"/></g>
<g font-family="Arial" font-size="13" text-anchor="middle" fill="#172033"><text x="95" y="194">Administrador</text><text x="95" y="420">Operador</text></g>
<g font-family="Arial" font-size="11" fill="#475569"><line x1="240" y1="424" x2="270" y2="424" stroke="#2563eb" stroke-width="2"/><text x="276" y="428">Administrador</text><line x1="390" y1="424" x2="420" y2="424" stroke="#0f766e" stroke-width="2"/><text x="426" y="428">Operador</text></g>
</svg>
<div class="box">Los dos perfiles tienen asociación con entrada, salida, matrícula, ocupación y sesión. Solo Administrador se asocia con la gestión administrativa; solo Operador consulta la disponibilidad auxiliar. No hay relación «include» que obligue a registrar una salida.</div>
<div class="footer">Autos Antioquia · Iteración 2</div></section>
'''
html = html[:start] + page3 + html[end:]

start = html.index('<section class="page"><h2>4.')
end = html.index('</body>', start)
pages45 = '''<section class="page">
<h2>4. Diagrama de componentes</h2>
<p>La arquitectura sigue el flujo que aparece en el código: la interfaz web envía solicitudes a las rutas Express; el middleware valida sesión y rol; los controladores llaman los servicios de negocio; los servicios ejecutan consultas mediante <code>pg.Pool</code> hacia PostgreSQL.</p>
<svg class="diagram" viewBox="0 0 1050 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Componentes del sistema Autos Antioquia">
<defs><marker id="arrowComponent" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L9 4L0 8z" fill="#475569"/></marker></defs><rect width="1050" height="300" fill="#fff"/>
<g fill="#eff6ff" stroke="#2563eb" stroke-width="2"><rect x="20" y="86" width="155" height="105" rx="9"/><rect x="195" y="86" width="155" height="105" rx="9"/><rect x="370" y="86" width="155" height="105" rx="9"/><rect x="545" y="86" width="155" height="105" rx="9"/><rect x="720" y="86" width="155" height="105" rx="9"/><rect x="895" y="86" width="145" height="105" rx="9"/></g>
<g stroke="#475569" stroke-width="2" marker-end="url(#arrowComponent)"><path d="M175 138h18"/><path d="M350 138h18"/><path d="M525 138h18"/><path d="M700 138h18"/><path d="M875 138h18"/></g>
<g fill="#172033" font-family="Arial" text-anchor="middle"><text x="97" y="120" font-size="15" font-weight="bold">Interfaz web</text><text x="97" y="145" font-size="12">HTML · CSS · JavaScript</text><text x="272" y="120" font-size="15" font-weight="bold">Rutas Express</text><text x="272" y="145" font-size="12">API REST</text><text x="447" y="118" font-size="14" font-weight="bold">Middleware</text><text x="447" y="142" font-size="12">Autenticación</text><text x="447" y="160" font-size="12">y rol</text><text x="622" y="120" font-size="15" font-weight="bold">Controladores</text><text x="622" y="145" font-size="12">Auth · Acceso</text><text x="797" y="118" font-size="14" font-weight="bold">Servicios</text><text x="797" y="142" font-size="12">Auth · Acceso</text><text x="797" y="160" font-size="12">Gestión</text><text x="967" y="120" font-size="14" font-weight="bold">pg.Pool</text><text x="967" y="145" font-size="12">PostgreSQL</text></g>
<text x="525" y="240" text-anchor="middle" font-family="Arial" font-size="14" fill="#334155">El administrador y el operador pueden usar portería; los permisos administrativos se restringen en el middleware y las rutas.</text>
<text x="525" y="265" text-anchor="middle" font-family="Arial" font-size="13" font-weight="bold" fill="#b42318">La persistencia se realiza desde los servicios. No existe una capa Repository.</text></svg>
<div class="box">El administrador puede cubrir portería con su propia cuenta y consultar ocupación. El middleware permite las rutas de portería a Administrador y Operador; cuentas y catálogo de celdas quedan restringidos al Administrador.</div>
<div class="footer">Autos Antioquia · Iteración 2</div></section>
<section class="page">
<h2>5. Pruebas, entregables y conclusiones</h2>
<h3>Plan de pruebas práctico</h3>
<p>Se preparó un plan complementario con 11 casos sencillos y una captura diferente por caso: consulta de ocupación como administrador, portería de ambos perfiles, matrícula, gestión de cuentas y celdas, y renovación/desactivación de mensualidades. Los 11 recorridos Playwright pasan con respuestas de API simuladas; las capturas validan la interfaz, no la persistencia ni las reglas reales de PostgreSQL.</p>
<p>El formato oficial del profesor contiene 30 casos. Sus estados históricos se conservan. Para cerrar ese formato, ejecutar en el entorno local los casos que validan servidor, permisos, restricciones SQL, concurrencia e historial, y registrar fecha, responsable, resultado y evidencia reales.</p>
<table><tr><th>Entregable</th><th>Estado</th></tr>
<tr><td>Requisitos funcionales/no funcionales e historias</td><td>Incluidos en la documentación de Iteración 2.</td></tr>
<tr><td>Casos de uso, componentes y secuencias editables</td><td>Revisar los archivos StarUML con los permisos de esta versión antes de entregar.</td></tr>
<tr><td>Mockups</td><td>Actualizar para mostrar portería compartida, tablero, cuentas y límites correctos de celdas.</td></tr>
<tr><td>Repositorio GitHub</td><td>El enlace está en la documentación; falta publicar los cambios locales.</td></tr>
<tr><td>Video YouTube</td><td>Pendiente de grabar y enlazar.</td></tr></table>
<h3>Cómo iniciar la versión local</h3><ol><li>Configurar <code>.env</code> y PostgreSQL.</li><li>Base existente: ejecutar migraciones 001 a 005. Base nueva: <code>database/schema.sql</code>.</li><li>Ejecutar <code>npm install</code> y <code>npm run create-admin</code>.</li><li>Ejecutar <code>npm run start</code> y abrir <code>http://localhost:3000</code>.</li></ol>
<h3>Conclusión</h3><p>Iteración 2 incorpora perfiles de acceso, administración de usuarios y celdas y conserva las operaciones de Iteración 1. Administrador y operador pueden cubrir portería con cuentas propias; cada evento conserva su actor. Para cerrar la entrega faltan pruebas reales del formato oficial, revisión final de los diagramas StarUML, publicación de los cambios en GitHub y el video demostrativo.</p>
<p>Repositorio: https://github.com/pablograjales-glitch/AutosAntioquia<br>Video: pendiente de publicación.</p>
<div class="footer">Autos Antioquia · Iteración 2</div></section>
'''
html = html[:start] + pages45 + html[end:]
report.write_text(html, encoding='utf-8')
print(f'Informe revisado: {report}')
