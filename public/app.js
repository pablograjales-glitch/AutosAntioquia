document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = window.location.origin;
  let sessionToken = sessionStorage.getItem('autos-token');
  let usuarioActual = null;

  function mostrarLogin(mensaje = '') {
    sessionToken = null; usuarioActual = null; sessionStorage.removeItem('autos-token');
    document.getElementById('login-screen').classList.remove('oculto');
    document.getElementById('app-header').classList.add('oculto');
    document.getElementById('app-main').classList.add('oculto');
    document.getElementById('login-error').textContent = mensaje;
  }

  function mostrarAplicacion(usuario) {
    usuarioActual = usuario;
    document.getElementById('login-screen').classList.add('oculto');
    document.getElementById('app-header').classList.remove('oculto');
    document.getElementById('app-main').classList.remove('oculto');
    document.getElementById('auth-user-info').textContent = `${usuario.nombreCompleto} · ${usuario.rol}`;
    document.querySelectorAll('[data-role]').forEach(el => {
      const rolesPermitidos = el.dataset.role.split(',').map(rol => rol.trim());
      el.classList.toggle('oculto', !rolesPermitidos.includes(usuario.rol));
    });
  }

  async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${API_BASE}${url}`, { ...options, headers });
    if (response.status === 401 && sessionToken) mostrarLogin('La sesion termino. Inicia sesion nuevamente.');
    return response;
  }

  document.getElementById('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const error = document.getElementById('login-error'); error.textContent = '';
    const nombreUsuario = document.getElementById('login-usuario').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreUsuario, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible iniciar sesion.');
      sessionToken = data.token; sessionStorage.setItem('autos-token', sessionToken);
      document.getElementById('login-password').value = '';
      await iniciarAplicacion(data.usuario);
    } catch (err) { error.textContent = err.message; }
  });

  document.getElementById('btn-cerrar-sesion').addEventListener('click', async () => {
    try { if (sessionToken) await apiFetch('/api/auth/logout', { method: 'POST' }); }
    finally { mostrarLogin(); document.getElementById('login-usuario').focus(); }
  });

  const formRegistro = document.getElementById('form-registro');
  const formEntrada = document.getElementById('form-entrada');
  const formSalida = document.getElementById('form-salida');
  const tablaBody = document.getElementById('tabla-body');

  const modalAutorizado = document.getElementById('modal-autorizado');
  const modalDenegado = document.getElementById('modal-denegado');
  const modalMensualidad = document.getElementById('modal-mensualidad-exitosa');
  const modalSalida = document.getElementById('modal-salida-exitosa');

  // Gestión de usuarios y celdas (Iteración 2)
  const clientesBody = document.getElementById('clientes-body');
  const cuentasBody = document.getElementById('cuentas-body');
  const celdasBody = document.getElementById('celdas-body');
  const filtroClientes = document.getElementById('filtro-clientes');
  const filtroCuentas = document.getElementById('filtro-cuentas');
  const filtroCeldas = document.getElementById('filtro-celdas');
  const disponiblesBody = document.getElementById('disponibles-body');
  const dialogoRenovacion = document.getElementById('dialogo-confirmar-renovacion');
  const formRenovacion = document.getElementById('form-confirmar-renovacion');
  const passwordRenovacion = document.getElementById('password-confirmar-renovacion');
  let cedulaRenovacionPendiente = null;
  let activarMensualidadPendiente = true;
  let clientesCache = [], cuentasCache = [], celdasCache = [];

  function agregarCeldaTexto(fila, valor) {
    const celda = document.createElement('td'); celda.textContent = valor == null ? '' : String(valor); fila.appendChild(celda); return celda;
  }

  async function iniciarAplicacion(usuarioRespuesta) {
    if (!sessionToken) { mostrarLogin(); return; }
    let usuario = usuarioRespuesta;
    if (!usuario) {
      try {
        const response = await apiFetch('/api/auth/me');
        if (!response.ok) { mostrarLogin(); return; }
        usuario = await response.json();
      } catch { mostrarLogin('No se pudo validar la sesion.'); return; }
    }
    mostrarAplicacion(usuario);
    await actualizarDashboard();
    if (usuario.rol === 'ADMINISTRADOR') await actualizarAdministracion();
    if (usuario.rol === 'OPERADOR') await consultarDisponibles();
  }

  async function actualizarAdministracion() {
    try {
      const responses = await Promise.all([apiFetch('/api/clientes'), apiFetch('/api/usuarios'), apiFetch('/api/celdas')]);
      const failed = responses.find(r => !r.ok);
      if (failed) { const d = await failed.json(); throw new Error(d.error || 'No se pudo cargar administracion.'); }
      [clientesCache, cuentasCache, celdasCache] = await Promise.all(responses.map(r => r.json()));
      dibujarClientes(); dibujarCuentas(); dibujarCeldas();
    } catch (error) {
      console.error(error);
      clientesBody.innerHTML = '<tr><td colspan="6">No se pudo cargar la lista de clientes.</td></tr>';
      cuentasBody.innerHTML = '<tr><td colspan="5">No se pudo cargar la lista de cuentas.</td></tr>';
      celdasBody.innerHTML = '<tr><td colspan="5">No se pudo cargar la lista de celdas.</td></tr>';
    }
  }

  function dibujarClientes() {
    const filtro = filtroClientes.value.trim().toLowerCase();
    const visibles = clientesCache.filter(u => `${u.cedula} ${u.nombre}`.toLowerCase().includes(filtro));
    clientesBody.replaceChildren();
    if (!visibles.length) { const row=document.createElement('tr');const td=agregarCeldaTexto(row,'No hay clientes que coincidan.');td.colSpan=6;clientesBody.appendChild(row);return; }
    visibles.forEach(cliente => {
      const row=document.createElement('tr'); agregarCeldaTexto(row,cliente.cedula); agregarCeldaTexto(row,cliente.nombre);
      agregarCeldaTexto(row,(cliente.vehiculos||[]).map(v=>`${v.placa} (${v.tipoVehiculo})`).join(', ')||'Sin vehiculo');
      const fechaVencimiento=cliente.fecha_vencimiento_mensualidad?String(cliente.fecha_vencimiento_mensualidad).slice(0,10):null;
      const fechaHoy=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());
      const vencida=cliente.mensualidad_activa&&(!fechaVencimiento||fechaVencimiento<fechaHoy);
      const state=document.createElement('td'),pill=document.createElement('span');pill.className=`state-pill ${vencida?'expired':cliente.mensualidad_activa?'active':'inactive'}`;pill.textContent=vencida?'Vencida':cliente.mensualidad_activa?'Activa':'Inactiva';state.appendChild(pill);row.appendChild(state);
      const due=fechaVencimiento?new Date(`${fechaVencimiento}T12:00:00`).toLocaleDateString('es-CO'):'-';agregarCeldaTexto(row,due);
      const actions=document.createElement('td'),edit=document.createElement('button');edit.className='admin-action';edit.textContent='Editar nombre';
      edit.addEventListener('click',async()=>{const nombre=prompt('Nombre actualizado:',cliente.nombre);if(nombre!==null)await ejecutarAccionAdmin(`/api/clientes/${encodeURIComponent(cliente.cedula)}`,'PUT',{nombre});});actions.appendChild(edit);
      const agregarAccionMensualidad=(activar,texto)=>{const button=document.createElement('button');button.className=`admin-action ${activar?'success':'danger'}`;button.textContent=texto;button.addEventListener('click',()=>abrirConfirmacionRenovacion(cliente.cedula,activar));actions.appendChild(button);};
      if(!cliente.mensualidad_activa||vencida)agregarAccionMensualidad(true,'Renovar 30 días');
      if(cliente.mensualidad_activa)agregarAccionMensualidad(false,'Desactivar');
      row.appendChild(actions);clientesBody.appendChild(row);
    });
  }

  function dibujarCuentas() {
    const filtro=filtroCuentas.value.trim().toLowerCase();const visibles=cuentasCache.filter(c=>`${c.nombre_usuario} ${c.nombre_completo} ${c.rol} ${c.cedula_operador||''} ${c.nombre_operador||''}`.toLowerCase().includes(filtro));
    cuentasBody.replaceChildren();
    if(!visibles.length){const row=document.createElement('tr');const td=agregarCeldaTexto(row,'No hay cuentas que coincidan.');td.colSpan=5;cuentasBody.appendChild(row);return;}
    visibles.forEach(c=>{const row=document.createElement('tr');agregarCeldaTexto(row,c.nombre_usuario);agregarCeldaTexto(row,c.nombre_completo);agregarCeldaTexto(row,c.rol==='ADMINISTRADOR'?'Administrador':'Operador');agregarCeldaTexto(row,c.rol==='OPERADOR'?`${c.nombre_operador} · ${c.cedula_operador}`:'-');const td=document.createElement('td'),pill=document.createElement('span');pill.className=`state-pill ${c.activo?'active':'inactive'}`;pill.textContent=c.activo?'Activa':'Inactiva';td.appendChild(pill);row.appendChild(td);cuentasBody.appendChild(row);});
  }

  function dibujarCeldas() {
    const filtro=filtroCeldas.value.trim().toLowerCase();const visibles=celdasCache.filter(c=>`${c.numero_celda} ${c.placa_actual||''} ${c.tipo_vehiculo}`.toLowerCase().includes(filtro));
    celdasBody.replaceChildren();const disponibles=celdasCache.filter(c=>c.estado==='DISPONIBLE').length;
    const totalCarros=celdasCache.filter(c=>c.tipo_vehiculo==='CARRO').length;
    const totalMotos=celdasCache.filter(c=>c.tipo_vehiculo==='MOTO').length;
    document.getElementById('resumen-celdas-admin').textContent=`Carros ${totalCarros}/80 · Motos ${totalMotos}/10 · ${disponibles} disponibles`;
    if(!visibles.length){const row=document.createElement('tr');const td=agregarCeldaTexto(row,'No hay celdas que coincidan.');td.colSpan=5;celdasBody.appendChild(row);return;}
    visibles.forEach(c=>{
      const row=document.createElement('tr');agregarCeldaTexto(row,c.numero_celda);agregarCeldaTexto(row,c.tipo_vehiculo==='CARRO'?'Carro':'Moto');
      const state=document.createElement('td'),pill=document.createElement('span');pill.className=`state-pill ${c.estado==='DISPONIBLE'?'available':c.estado==='MANTENIMIENTO'?'maintenance':''}`;pill.textContent=c.estado;state.appendChild(pill);row.appendChild(state);agregarCeldaTexto(row,c.placa_actual||'-');
      const actions=document.createElement('td');
      const edit=document.createElement('button');edit.className='admin-action';edit.textContent='Editar';edit.disabled=c.estado==='OCUPADA';edit.addEventListener('click',async()=>{if(edit.disabled)return;const numeroCelda=prompt('Codigo de celda:',c.numero_celda);if(numeroCelda===null)return;const tipoVehiculo=prompt('Tipo: CARRO o MOTO',c.tipo_vehiculo);if(tipoVehiculo===null)return;await ejecutarAccionAdmin(`/api/celdas/${c.id_celda}`,'PUT',{numeroCelda,tipoVehiculo:tipoVehiculo.trim().toUpperCase()});});actions.appendChild(edit);
      const del=document.createElement('button');del.className='admin-action danger';del.textContent='Eliminar';del.disabled=c.estado==='OCUPADA';del.addEventListener('click',async()=>{if(!del.disabled&&confirm(`Eliminar la celda ${c.numero_celda}?`))await ejecutarAccionAdmin(`/api/celdas/${c.id_celda}`,'DELETE');});actions.appendChild(del);
      const stateBtn=document.createElement('button');stateBtn.className='admin-action';stateBtn.textContent=c.estado==='MANTENIMIENTO'?'Habilitar':c.estado==='DISPONIBLE'?'Mantenimiento':'Ocupada';stateBtn.disabled=c.estado==='OCUPADA';stateBtn.addEventListener('click',()=>{if(!stateBtn.disabled)ejecutarAccionAdmin(`/api/celdas/${c.id_celda}`,'PATCH',{estado:c.estado==='MANTENIMIENTO'?'DISPONIBLE':'MANTENIMIENTO'});});actions.appendChild(stateBtn);row.appendChild(actions);celdasBody.appendChild(row);
    });
  }

  async function ejecutarAccionAdmin(url,method,body) {
    try {const options={method};if(body)options.body=JSON.stringify(body);const response=await apiFetch(url,options);if(response.status===204){await actualizarAdministracion();return;}const data=await response.json();if(!response.ok)throw new Error(data.error||'No fue posible guardar.');await actualizarAdministracion();}
    catch(error){alert(error.message);}
  }

  function abrirConfirmacionRenovacion(cedula, activar) {
    cedulaRenovacionPendiente = cedula;
    activarMensualidadPendiente = activar;
    formRenovacion.reset();
    document.getElementById('error-confirmar-renovacion').textContent = '';
    document.getElementById('titulo-confirmar-renovacion').textContent = activar ? 'Confirmar renovación' : 'Confirmar desactivación';
    document.getElementById('mensaje-confirmar-renovacion').textContent = activar
      ? 'Para renovar la mensualidad por 30 días, confirma tu identidad con la contraseña de administrador.'
      : 'Para desactivar esta mensualidad, confirma tu identidad con la contraseña de administrador.';
    document.getElementById('enviar-renovacion').textContent = activar ? 'Confirmar renovación' : 'Confirmar desactivación';
    dialogoRenovacion.showModal();
    passwordRenovacion.focus();
  }

  document.getElementById('cancelar-renovacion').addEventListener('click', () => {
    cedulaRenovacionPendiente = null;
    dialogoRenovacion.close();
    formRenovacion.reset();
  });
  dialogoRenovacion.addEventListener('close', () => { cedulaRenovacionPendiente = null; passwordRenovacion.value = ''; });
  formRenovacion.addEventListener('submit', async event => {
    event.preventDefault();
    if (!cedulaRenovacionPendiente) return;
    const boton = document.getElementById('enviar-renovacion');
    const error = document.getElementById('error-confirmar-renovacion');
    boton.disabled = true;
    error.textContent = '';
    try {
      const response = await apiFetch(`/api/clientes/${encodeURIComponent(cedulaRenovacionPendiente)}/mensualidad`, {
        method: 'PATCH',
        body: JSON.stringify({ activa: activarMensualidadPendiente, passwordAdministrador: passwordRenovacion.value })
      });
      if (response.status === 401) {
        dialogoRenovacion.close();
        formRenovacion.reset();
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible confirmar la renovación.');
      dialogoRenovacion.close();
      formRenovacion.reset();
      await actualizarAdministracion();
    } catch (err) {
      error.textContent = err.message;
      passwordRenovacion.value = '';
      passwordRenovacion.focus();
    } finally { boton.disabled = false; }
  });

  filtroClientes.addEventListener('input',dibujarClientes);filtroCuentas.addEventListener('input',dibujarCuentas);filtroCeldas.addEventListener('input',dibujarCeldas);

  const cuentaRol=document.getElementById('cuenta-rol'), operatorFields=document.getElementById('cuenta-operador-fields'), operatorId=document.getElementById('operador-cedula');
  function actualizarCamposRol(){const isOperator=cuentaRol.value==='OPERADOR';operatorFields.classList.toggle('oculto',!isOperator);operatorId.required=isOperator;}
  cuentaRol.addEventListener('change',actualizarCamposRol);actualizarCamposRol();
  document.getElementById('form-cuenta-admin').addEventListener('submit',async e=>{e.preventDefault();const body={nombreUsuario:document.getElementById('cuenta-usuario').value,nombreCompleto:document.getElementById('cuenta-nombre').value,password:document.getElementById('cuenta-password').value,rol:cuentaRol.value};if(cuentaRol.value==='OPERADOR'){body.cedula=operatorId.value;body.nombreOperador=body.nombreCompleto;}await ejecutarAccionAdmin('/api/usuarios','POST',body);document.getElementById('cuenta-password').value='';e.target.reset();actualizarCamposRol();});
  document.getElementById('form-celda-admin').addEventListener('submit',async e=>{e.preventDefault();await ejecutarAccionAdmin('/api/celdas','POST',{numeroCelda:document.getElementById('celda-codigo').value,tipoVehiculo:document.getElementById('celda-tipo').value});e.target.reset();});

  async function consultarDisponibles(){try{const response=await apiFetch('/api/celdas/disponibles');const data=await response.json();if(!response.ok)throw new Error(data.error||'Error de consulta.');disponiblesBody.replaceChildren();if(!data.length){const row=document.createElement('tr');const td=agregarCeldaTexto(row,'No hay celdas disponibles.');td.colSpan=2;disponiblesBody.appendChild(row);return;}data.forEach(c=>{const row=document.createElement('tr');agregarCeldaTexto(row,c.numero_celda);agregarCeldaTexto(row,c.tipo_vehiculo==='CARRO'?'Carro':'Moto');disponiblesBody.appendChild(row);});}catch(error){console.error(error);}}
  document.getElementById('btn-consultar-disponibles').addEventListener('click',consultarDisponibles);

  // --- 1. CONTROLADORES SEGMENTADOS (Clic manual) ---
  document.querySelectorAll('.segmented-control').forEach(container => {
    container.addEventListener('click', (e) => {
      const selectedBtn = e.target.closest('.segment-btn');
      if (!selectedBtn) return;

      container.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      selectedBtn.classList.add('active');

      const targetInputId = selectedBtn.getAttribute('data-target');
      const value = selectedBtn.getAttribute('data-value');
      const targetInput = document.getElementById(targetInputId);
      if (targetInput) {
        targetInput.value = value;
      }
    });
  });

  // --- 2. DETECCIÓN AUTOMÁTICA DE PLACA (Forzada en tiempo real) ---
  function autoSeleccionarTipo(placaValue, hiddenInputId) {
    if (!placaValue) return;
    
    const limpia = placaValue.trim().toUpperCase();
    if (limpia.length === 0) return;

    // Extraer último dígito para validar la regla colombiana
    const ultimoCaracter = limpia.slice(-1);
    let tipoDetectado = null;

    if (/[0-9]/.test(ultimoCaracter)) {
      tipoDetectado = 'CARRO';
    } else if (/[A-Z]/.test(ultimoCaracter)) {
      tipoDetectado = 'MOTO';
    }

    if (tipoDetectado) {
      // 1. Actualizar el input oculto que se enviará al Backend
      const hiddenInput = document.getElementById(hiddenInputId);
      if (hiddenInput) {
        hiddenInput.value = tipoDetectado;
      }

      // 2. Forzar el cambio visual en los botones
      const btnCarro = document.querySelector(`.segment-btn[data-target="${hiddenInputId}"][data-value="CARRO"]`);
      const btnMoto = document.querySelector(`.segment-btn[data-target="${hiddenInputId}"][data-value="MOTO"]`);

      if (tipoDetectado === 'CARRO') {
        if (btnCarro) btnCarro.classList.add('active');
        if (btnMoto) btnMoto.classList.remove('active');
      } else if (tipoDetectado === 'MOTO') {
        if (btnMoto) btnMoto.classList.add('active');
        if (btnCarro) btnCarro.classList.remove('active');
      }
    }
  }

  // Escuchar múltiples eventos para evitar desfases del navegador
  const eventosEscucha = ['input', 'keyup', 'change'];

  const inputPlacaReg = document.getElementById('placa-registro');
  if (inputPlacaReg) {
    eventosEscucha.forEach(evt => {
      inputPlacaReg.addEventListener(evt, (e) => {
        autoSeleccionarTipo(e.target.value, 'tipo-registro');
      });
    });
  }

  const inputPlacaEnt = document.getElementById('placa-entrada');
  if (inputPlacaEnt) {
    eventosEscucha.forEach(evt => {
      inputPlacaEnt.addEventListener(evt, (e) => {
        autoSeleccionarTipo(e.target.value, 'tipo-vehiculo');
      });
    });
  }

  // --- 3. ACTUALIZAR DASHBOARD Y TABLA ---
  async function actualizarDashboard() {
    const errorDashboard = document.getElementById('dashboard-error');
    errorDashboard.classList.add('oculto');
    try {
      const res = await apiFetch('/api/acceso/ocupacion');
      const data = await res.json();
      if (!res.ok) {
        const solucion = res.status === 403
          ? 'Reinicia el servidor para cargar los permisos actualizados de administrador y operador.'
          : 'Comprueba que PostgreSQL esté conectado y vuelve a iniciar sesión.';
        throw new Error(`${data.error || 'No se pudo consultar la ocupación.'} ${solucion}`);
      }

      const resumenCeldas = data.resumenCeldas || [];
      const c = data.carros || resumenCeldas.find(item => item.tipo_vehiculo === 'CARRO') || { ocupadas: 0, disponibles: 80, total: 80 };
      const m = data.motos || resumenCeldas.find(item => item.tipo_vehiculo === 'MOTO') || { ocupadas: 0, disponibles: 10, total: 10 };
      c.ocupadas = Number(c.ocupadas) || 0;
      c.disponibles = Number(c.disponibles) || 0;
      c.total = Number(c.total) || 80;
      m.ocupadas = Number(m.ocupadas) || 0;
      m.disponibles = Number(m.disponibles) || 0;
      m.total = Number(m.total) || 10;

      document.getElementById('carros-ocupados').textContent = c.ocupadas;
      document.getElementById('carros-disponibles').textContent = `${c.disponibles} celdas disponibles`;
      const pctC = Math.round((c.ocupadas / c.total) * 100) || 0;
      document.getElementById('carros-pct').textContent = `${pctC}% ocupado`;
      document.getElementById('bar-carros').style.width = `${pctC}%`;

      document.getElementById('motos-ocupadas').textContent = m.ocupadas;
      document.getElementById('motos-disponibles').textContent = `${m.disponibles} celdas disponibles`;
      const pctM = Math.round((m.ocupadas / m.total) * 100) || 0;
      document.getElementById('motos-pct').textContent = `${pctM}% ocupado`;
      document.getElementById('bar-motos').style.width = `${pctM}%`;

      const vehiculos = data.vehiculosActivos || data.vehiculosParqueados || [];
      document.getElementById('total-parqueados-badge').textContent = `(${vehiculos.length} vehículos)`;

      tablaBody.innerHTML = '';
      if (vehiculos.length === 0) {
        tablaBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No hay vehículos parqueados actualmente.</td></tr>`;
        return;
      }

      vehiculos.forEach(v => {
        const fechaRaw = v.fecha_hora_entrada || v.fechaEntrada || new Date();
        const fecha = new Date(fechaRaw).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
        const celdaVal = v.numero_celda || v.celda;
        const tipoVal = v.tipo_vehiculo || v.tipo;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="badge-placa-sm">${v.placa}</span></td>
          <td>${tipoVal === 'CARRO' ? 'Carro' : 'Moto'}</td>
          <td><strong>${celdaVal}</strong></td>
          <td>Hoy, ${fecha}</td>
          <td><span class="badge-al-dia">Al Día</span></td>
          <td><button class="btn-table-action" data-placa="${v.placa}">Marcar Salida</button></td>
        `;
        tablaBody.appendChild(tr);
      });

      document.querySelectorAll('.btn-table-action').forEach(btn => {
        btn.addEventListener('click', e => ejecutarSalida(e.target.getAttribute('data-placa')));
      });
    } catch (err) {
      console.error('Error cargando ocupación:', err);
      errorDashboard.textContent = `${err.message || 'No se pudo consultar la ocupación.'} No se mostrarán contadores estimados.`;
      errorDashboard.classList.remove('oculto');
      document.getElementById('carros-ocupados').textContent = '—';
      document.getElementById('carros-disponibles').textContent = 'Dato no disponible';
      document.getElementById('carros-pct').textContent = '—';
      document.getElementById('motos-ocupadas').textContent = '—';
      document.getElementById('motos-disponibles').textContent = 'Dato no disponible';
      document.getElementById('motos-pct').textContent = '—';
      document.getElementById('total-parqueados-badge').textContent = '(dato no disponible)';
      document.getElementById('bar-carros').style.width = '0%';
      document.getElementById('bar-motos').style.width = '0%';
      tablaBody.innerHTML = `<tr><td colspan="6">No se pudo consultar la ocupación. Revisa el mensaje anterior.</td></tr>`;
    }
  }

  // --- 4. FUNCIONES DE MODALES ---
  function abrirModalEntradaExitosa(placa, celda, tipo) {
    document.getElementById('modal-placa-ok').textContent = placa;
    document.getElementById('modal-celda-ok').textContent = celda;
    document.getElementById('modal-celda-footnote').textContent = celda;
    document.getElementById('modal-tipo-ok').textContent = tipo === 'CARRO' ? 'Carro' : 'Moto';
    document.getElementById('modal-hora-ok').textContent = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    modalAutorizado.classList.remove('oculto');
  }

  function abrirModalMensualidadExitosa(placa, cliente, cedula, tipo) {
    document.getElementById('modal-placa-mat').textContent = placa;
    document.getElementById('modal-cliente-mat').textContent = cliente;
    document.getElementById('modal-cedula-mat').textContent = cedula;
    document.getElementById('modal-tipo-mat').textContent = tipo === 'CARRO' ? 'Carro' : 'Moto';
    modalMensualidad.classList.remove('oculto');
  }

  function abrirModalSalidaExitosa(placa, celda) {
    document.getElementById('modal-placa-salida').textContent = placa;
    document.getElementById('modal-celda-salida').textContent = celda || 'Liberada';
    document.getElementById('modal-hora-salida').textContent = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    modalSalida.classList.remove('oculto');
  }

  function abrirModalError(placa, causa, tipo, errorTecnico = false) {
    document.getElementById('modal-placa-error').textContent = placa;
    document.getElementById('modal-tipo-error').textContent = tipo === 'CARRO' ? 'Carro' : 'Moto';
    document.getElementById('modal-causa-error').textContent = causa;
    document.getElementById('modal-titulo-error').textContent = errorTecnico ? 'No se pudo completar' : 'Acceso Denegado';
    document.getElementById('modal-label-causa-error').textContent = errorTecnico ? 'DETALLE DEL ERROR' : 'CAUSA DE DENEGACIÓN';
    document.getElementById('modal-titulo-instruccion-error').textContent = errorTecnico ? 'INSTRUCCIONES' : 'INSTRUCCIONES PARA EL OPERADOR';
    const mensualidadInactiva = String(causa || '').toLowerCase().includes('mensualidad') && String(causa || '').toLowerCase().includes('inactiva');
    document.getElementById('modal-instruccion-error').textContent = errorTecnico
      ? 'Intenta nuevamente. Si el problema persiste, informa al administrador.'
      : mensualidadInactiva
        ? 'Solicita al administrador que renueve la mensualidad antes de permitir el ingreso.'
        : 'Remitir al usuario a la oficina de administración para actualizar el pago de la mensualidad antes de permitir el ingreso.';
    modalDenegado.classList.remove('oculto');
  }

  document.getElementById('btn-cerrar-modal-ok').addEventListener('click', () => modalAutorizado.classList.add('oculto'));
  document.getElementById('btn-cancelar-modal-ok').addEventListener('click', () => modalAutorizado.classList.add('oculto'));
  document.getElementById('btn-cerrar-modal-mat').addEventListener('click', () => modalMensualidad.classList.add('oculto'));
  document.getElementById('btn-cerrar-modal-salida').addEventListener('click', () => modalSalida.classList.add('oculto'));
  document.getElementById('btn-cerrar-modal-error').addEventListener('click', () => modalDenegado.classList.add('oculto'));

  // --- 5. ENVIAR FORMULARIOS ---

  // Matricular Mensualidad
  let registroEnProceso = false;
  const btnRegistro = formRegistro.querySelector('button[type="submit"]');
  formRegistro.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (registroEnProceso) return;
    registroEnProceso = true;
    if (btnRegistro) btnRegistro.disabled = true;
    const cedula = document.getElementById('cedula-usuario').value;
    const nombre = document.getElementById('nombre-usuario').value;
    const placa = document.getElementById('placa-registro').value.trim().toUpperCase();
    const tipoVehiculo = document.getElementById('tipo-registro').value;

    try {
      const res = await apiFetch('/api/vehiculo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula, nombre, placa, tipoVehiculo })
      });
      const data = await res.json();
      if (res.ok) {
        abrirModalMensualidadExitosa(placa, nombre, cedula, tipoVehiculo);
        formRegistro.reset();
        autoSeleccionarTipo('1', 'tipo-registro'); // Resetea visualmente a Carro
        if (usuarioActual?.rol === 'ADMINISTRADOR') actualizarAdministracion();
      } else {
        abrirModalError(placa, data.error || data.mensaje, tipoVehiculo, res.status >= 500);
      }
    } catch (err) {
      abrirModalError(placa, "Error de conexión con el servidor.", tipoVehiculo, true);
    }
    registroEnProceso = false;
    if (btnRegistro) btnRegistro.disabled = false;
  });

  // Registrar Entrada
  formEntrada.addEventListener('submit', async (e) => {
    e.preventDefault();
    const placa = document.getElementById('placa-entrada').value.trim().toUpperCase();
    const tipoVehiculo = document.getElementById('tipo-vehiculo').value;

    try {
      const res = await apiFetch('/api/acceso/entrada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa, tipoVehiculo })
      });
      const data = await res.json();

      if (res.ok) {
        const celda = data.celdaAsignada || data.celda;
        abrirModalEntradaExitosa(placa, celda, tipoVehiculo);
        formEntrada.reset();
        autoSeleccionarTipo('1', 'tipo-vehiculo'); // Resetea visualmente a Carro
        actualizarDashboard();
      } else {
        abrirModalError(placa, data.error || data.mensaje, tipoVehiculo, res.status >= 500);
      }
    } catch (err) {
      abrirModalError(placa, "Error de conexión al registrar entrada.", tipoVehiculo, true);
    }
  });

  // Registrar Salida
  async function ejecutarSalida(placa) {
    try {
      const res = await apiFetch('/api/acceso/salida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa })
      });
      const data = await res.json();

      if (res.ok) {
        const celdaLiberada = data.celdaAsignada || data.celda || data.celdaLiberada;
        abrirModalSalidaExitosa(placa, celdaLiberada);
        formSalida.reset();
        actualizarDashboard();
      } else {
        abrirModalError(placa, data.error || data.mensaje, 'CARRO', res.status >= 500);
      }
    } catch (err) {
      abrirModalError(placa, "Error de conexión al registrar salida.", 'CARRO', true);
    }
  }

  formSalida.addEventListener('submit', e => {
    e.preventDefault();
    ejecutarSalida(document.getElementById('placa-salida').value.trim().toUpperCase());
  });

  iniciarAplicacion();
});
